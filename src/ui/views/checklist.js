// The plan checklist (design/mockups checklist) and the plan mark after saving (AC-P2.2, AC-P2.3, AC-P2.4).
//   runChecklist(ctx, draft) -> Promise<planMark | null>: shown before a trade when a plan with rules is active. Rows the code can decide
//   now (hours, daily cap, daily loss limit) are checked by the app; the user ticks the rest. Skipping never blocks saving.
//   afterSave(ctx, trade): after the trade is saved, the code computes every check it can (hours, cap, risk, loss limit, stop, setup)
//   and the user confirms or overrides the plan-followed mark.
// Both are hung on ctx.data by the boot (src/review/index.js).
import { el, mount, t, page, detailBar, activePlan } from '../../review/viewkit.js';
import { evaluatePlan, sameDayBefore, checklistResult, hasRules } from '../../plan/check.js';
import { equityAtEntry, digitsFor, tradeMoney, entryTime } from '../../plan/derive.js';

const RULE_KEYS = ['hours', 'dailyCap', 'dailyLossLimit'];

const nowIso = () => new Date().toISOString();

async function loadPlanContext(ctx) {
  const [plans, trades, cash, accounts] = await Promise.all([ctx.store.plans.getAll(), ctx.store.trades.getAll(), ctx.store.cash.getAll(), ctx.store.accounts.getAll()]);
  return { plan: activePlan(plans), trades, cash, accounts };
}

// The checks of a plan at one instant for one draft or trade. Pure apart from the arguments.
export function autoChecks(plan, trade, { trades, cash, accounts, tz, dayCutoffHour = 0 }) {
  const account = accounts.find((a) => a.id === trade.accountId) ?? null;
  const digits = digitsFor(trade, Object.fromEntries(accounts.map((a) => [a.id, a])));
  const same = sameDayBefore(trade, trades.filter((x) => x.id !== trade.id), tz, dayCutoffHour);
  const eq = account ? equityAtEntry(trade, { account, trades: trades.filter((x) => x.id !== trade.id), cash }) : null;
  const equityMinor = eq === null ? null : Math.round(eq * 10 ** digits);
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const result = evaluatePlan(trade, plan, { sameDayTrades: same, equityAtEntryMinor: equityMinor, tz, digits, dayCutoffHour, accounts: accountsById });
  let lostPct = null;
  if (equityMinor && equityMinor > 0) {
    const at = entryTime(trade);
    const lost = same.reduce((sum, o) => {
      const c = o.closeTime;
      const m = c && Date.parse(c) < Date.parse(at) ? tradeMoney(o, { accounts: accountsById }) : null;
      return sum + (m ? m.netMinor : 0);
    }, 0);
    lostPct = (lost / equityMinor) * 100;
  }
  return { ...result, todayCount: same.length, lostPct };
}

const stateIcon = (state) => (state === 'pass' ? 'check' : state === 'fail' ? 'x' : 'info');
const stateClass = (state) => (state === 'pass' ? 'auto-ok' : state === 'fail' ? 'auto-no' : '');

function autoRow(ctx, { state, label, note }) {
  return el('div', { class: 'set-row check-row' },
    el('span', { class: ['check', stateClass(state)], role: 'img', 'aria-label': state === 'pass' ? t('checklist.met') : state === 'fail' ? t('checklist.notMet') : t('checklist.needsBalance') }, ctx.ui.icon(stateIcon(state))),
    el('span', { class: 'lbl' }, label, note ? el('small', null, note) : null));
}

function autoRows(ctx, plan, checks) {
  const f = ctx.fmt;
  const rows = [];
  if (checks.auto.hours) {
    const w = plan.hours[0];
    rows.push({ key: 'hours', state: checks.auto.hours, label: t('plan.rule.hours', { from: w.from, to: w.to }), note: t('checklist.now', { time: f.time(nowIso(), ctx.tz) }) });
  }
  if (checks.auto.dailyCap) rows.push({ key: 'dailyCap', state: checks.auto.dailyCap, label: t('plan.rule.cap', { n: plan.dailyCap }), note: t('checklist.cap.count', { n: checks.todayCount }) });
  if (checks.auto.dailyLossLimit) {
    rows.push({
      key: 'dailyLossLimit', state: checks.auto.dailyLossLimit, label: t('plan.rule.loss', { pct: f.pct(Number(plan.dailyLossLimitPct), 1) }),
      note: checks.lostPct === null ? t('checklist.needsBalance') : t('checklist.loss.today', { pct: f.pctSigned(checks.lostPct, 1) }),
    });
  }
  return rows;
}

export async function runChecklist(ctx, draft) {
  const { plan, trades, cash, accounts } = await loadPlanContext(ctx);
  if (!plan || !hasRules(plan)) return null;
  const host = document.getElementById('overlay') ?? document.body;
  const at = nowIso();
  const pseudo = { id: 'draft', accountId: draft?.accountId ?? null, mode: ctx.mode, side: 'long', initialStop: '', legs: [{ kind: 'entry', time: at, price: '1', size: '1' }] };
  const checks = autoChecks(plan, pseudo, { trades, cash, accounts, tz: ctx.tz, dayCutoffHour: Number(ctx.settings.get('dayCutoffHour') || 0) });
  const rows = autoRows(ctx, plan, checks);
  const ticks = {};

  return new Promise((resolve) => {
    const screen = el('div', { class: 'screen-overlay' });
    let done = false;
    // System Back (or any route change) leaves the trade: the overlay must not stay on the next screen (V2 G8)
    const onRoute = () => finish(null);
    const finish = (mark, leave = false) => {
      if (done) return;
      done = true;
      window.removeEventListener('hashchange', onRoute);
      screen.remove();
      resolve(mark);
      if (leave) ctx.navigate('#/home');
    };
    const ticksList = (plan.items ?? []).map((item) => {
      const box = el('button', { type: 'button', class: 'check', role: 'checkbox', 'aria-checked': 'false', 'aria-label': item.text }, ctx.ui.icon('check'));
      const row = el('div', { class: 'set-row check-row tick-row' }, box, el('span', { class: 'lbl' }, item.text));
      const toggle = () => { ticks[item.id] = !ticks[item.id]; box.classList.toggle('on', ticks[item.id]); box.setAttribute('aria-checked', String(Boolean(ticks[item.id]))); };
      row.addEventListener('click', toggle);
      return row;
    });
    page(screen, ctx, {
      bar: detailBar(ctx, { title: t('checklist.title'), backHash: '#/home', backLabel: t('nav.home') }),
      content: [
        el('div', { class: 'vstack tight' }, el('h2', null, t('checklist.heading')), el('p', { class: 'sub' }, t('checklist.intro', { plan: plan.name || t('plan.title') }))),
        rows.length ? [el('div', { class: 'group-h' }, t('checklist.auto.h')), el('div', { class: 'list' }, ...rows.map((r) => autoRow(ctx, r)))] : null,
        ticksList.length ? [el('div', { class: 'group-h' }, t('checklist.tick.h')), el('div', { class: 'list' }, ...ticksList)] : null,
        el('p', { class: 'caption pad-x' }, t('checklist.skipNote')),
      ].flat().filter(Boolean),
      actions: [
        ctx.ui.button({ label: t('checklist.continue'), size: 'lg', block: true, onClick: () => finish(markFrom(plan, ticks, checks, false)) }),
        ctx.ui.button({ label: t('checklist.skip'), kind: 'ghost', block: true, onClick: () => finish(markFrom(plan, {}, checks, true)) }),
      ],
    });
    // the back button leaves the trade: nothing is saved and the person returns home
    screen.querySelector('.topbar .back')?.addEventListener('click', (e) => { e.stopImmediatePropagation(); finish(null, true); }, true);
    host.append(screen);
    window.addEventListener('hashchange', onRoute);
    screen.querySelector('button.btn.primary')?.focus();
  });
}

// The plan mark stored on the trade before it is saved: the ticks, what the app checked, no verdict yet.
function markFrom(plan, ticks, checks, skipped) {
  const r = checklistResult(plan, ticks, skipped);
  const auto = {};
  for (const k of RULE_KEYS) if (checks.auto[k]) auto[k] = checks.auto[k];
  return { planId: plan.id, followed: null, items: r.items, auto, confirmedByUser: false, skipped };
}

// After saving: compute every check the code can decide and ask the person to confirm or override the mark (AC-P2.3).
export async function afterSave(ctx, trade) {
  const { plan, trades, cash, accounts } = await loadPlanContext(ctx);
  if (!plan || !hasRules(plan) || trade.mode === undefined) return;
  const checks = autoChecks(plan, trade, { trades, cash, accounts, tz: ctx.tz, dayCutoffHour: Number(ctx.settings.get('dayCutoffHour') || 0) });
  const suggested = checks.suggestedFollowed;
  const base = { ...(trade.plan ?? {}), planId: plan.id, auto: checks.auto, confirmedByUser: false };
  await ctx.store.trades.put({ ...trade, plan: { ...base, followed: base.followed ?? null } });
  const labels = {
    hours: plan.hours?.[0] ? t('plan.rule.hours', { from: plan.hours[0].from, to: plan.hours[0].to }) : '',
    dailyCap: plan.dailyCap ? t('plan.rule.cap', { n: plan.dailyCap }) : '',
    risk: plan.riskPct ? t('plan.rule.risk', { pct: ctx.fmt.pct(Number(plan.riskPct), 1) }) : '',
    dailyLossLimit: plan.dailyLossLimitPct ? t('plan.rule.loss', { pct: ctx.fmt.pct(Number(plan.dailyLossLimitPct), 1) }) : '',
    stop: t('plan.check.stop'),
    setup: t('plan.check.setup'),
  };
  const rows = Object.entries(checks.auto).filter(([, v]) => v).map(([k, v]) => autoRow(ctx, { state: v, label: labels[k] }));
  const mark = async (followed) => {
    const fresh = await ctx.store.trades.get(trade.id);
    await ctx.store.trades.put({ ...(fresh ?? trade), plan: { ...base, followed, confirmedByUser: true } });
    ctx.bus.emit('trades-changed');
    window.removeEventListener('hashchange', onRoute);
    s.close();
  };
  // The sheet follows the person to the journal after a save (that navigation happens at once), but it does not outlive a later route
  // change such as system Back: it closes without a mark (V2 G8, L4a F9). Armed after the save's own navigation has passed.
  const onRoute = () => { window.removeEventListener('hashchange', onRoute); s.close(); };
  setTimeout(() => window.addEventListener('hashchange', onRoute), 400);
  const suggestion = suggested === true ? t('plan.mark.followed') : suggested === false ? t('plan.mark.off') : null;
  const s = ctx.ui.sheet({
    title: t('plan.check.title'), mode: trade.mode, cancelLabel: t('plan.mark.none'),
    body: el('div', { class: 'vstack' },
      el('p', { class: 'sub' }, t('plan.check.body')),
      rows.length ? el('div', { class: 'list' }, ...rows) : null,
      suggestion ? el('p', { class: 'caption' }, t('plan.check.suggested', { mark: suggestion })) : null),
    footer: el('div', { class: 'action-stack' },
      ctx.ui.button({ label: t('plan.mark.followed'), size: 'lg', block: true, kind: suggested === true ? 'primary' : 'secondary', onClick: () => mark(true) }),
      ctx.ui.button({ label: t('plan.mark.off'), size: 'lg', block: true, kind: suggested === false ? 'primary' : 'secondary', onClick: () => mark(false) })),
  });
}

// Standalone route view: the checklist is not a route (it runs inside the trade flow), so #/checklist shows the plan link.
export async function render(root, ctx) {
  mount(root, el('div', { class: 'app-s3' }, detailBar(ctx, { title: t('checklist.title'), backHash: '#/home', backLabel: t('nav.home') }),
    el('main', { class: 'content' }, ctx.ui.emptyState({ iconName: 'target', title: t('checklist.noneTitle'), body: t('checklist.noneBody'), children: [ctx.ui.button({ label: t('review.ui.plan'), block: true, onClick: () => ctx.navigate('#/plan') })] }))));
  return () => mount(root);
}

