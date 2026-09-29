// Cash (#/cash): deposits, withdrawals and other cash items per broker account (design/mockups cash). They are never trades, never
// a gain or a loss; the broker check subtracts them in the balance form and the drawdown percent counts them.
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { loadModel } from '../../storage/model.js';
import { buildCash } from '../../storage/actions.js';
import { detailBar, toastMsg } from '../../storage/viewkit.js';

const errorText = (e) => t(`form.error.${e.code}`);
const today = () => new Date().toISOString().slice(0, 10);

function cashSheet(ctx, { model, account, onSaved }) {
  const accounts = model.accounts.filter((a) => a.mode === 'real');
  const draft = { accountId: account?.id ?? accounts[0]?.id, kind: 'deposit', amount: '', time: today(), note: '' };
  const slot = el('div', { class: 'vstack' });
  let errors = [];
  const errFor = (f) => { const e = errors.find((x) => x.field === f); return e ? errorText(e) : undefined; };
  const draw = () => mount(slot,
    accounts.length > 1 ? el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('cash.account')), ctx.ui.segmented({ ariaLabel: t('cash.account'), value: draft.accountId, options: accounts.map((a) => ({ value: a.id, label: a.name })), onChange: (v) => { draft.accountId = v; } })) : null,
    el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('cash.kind')), ctx.ui.segmented({ ariaLabel: t('cash.kind'), value: draft.kind, options: [{ value: 'deposit', label: t('cash.deposit') }, { value: 'withdrawal', label: t('cash.withdrawal') }, { value: 'other', label: t('cash.other') }], onChange: (v) => { draft.kind = v; draw(); } })),
    ctx.ui.field({ label: t('cash.amount'), value: draft.amount, inputmode: 'decimal', unit: accounts.find((a) => a.id === draft.accountId)?.baseCurrency, error: errFor('amount'), help: draft.kind === 'other' ? t('cash.other.help') : undefined, onInput: (v) => { draft.amount = v; } }),
    ctx.ui.field({ label: t('cash.date'), value: draft.time, type: 'date', error: errFor('time'), onInput: (v) => { draft.time = v; } }),
    ctx.ui.field({ label: t('cash.note'), value: draft.note, onInput: (v) => { draft.note = v; } }));
  draw();
  const s = ctx.ui.sheet({
    title: t('cash.add'), body: slot,
    footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: async () => {
      const acct = accounts.find((a) => a.id === draft.accountId);
      if (!acct) { errors = [{ field: 'amount', code: 'required' }]; draw(); return; }
      const r = buildCash(draft, { account: acct });
      errors = r.errors;
      if (r.errors.length) { draw(); return; }
      await ctx.store.cash.put(r.cash);
      s.close();
      ctx.bus.emit('trades-changed');
      onSaved?.();
      toastMsg(ctx, t('cash.saved'));
    } }),
  });
  return s;
}

export async function render(root, ctx) {
  let disposed = false;
  let filter = ctx.accountFilter === 'all' ? 'all' : ctx.accountFilter;
  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const { fmt } = ctx;
    const real = model.accounts.filter((a) => a.mode === 'real');
    const names = new Map(model.accounts.map((a) => [a.id, a.name]));
    const rows = model.cash.filter((c) => filter === 'all' ? real.some((a) => a.id === c.accountId) : c.accountId === filter).sort((a, b) => (a.time < b.time ? 1 : -1));
    const chips = el('div', { class: 'chips', role: 'toolbar', 'aria-label': t('cash.filter') },
      el('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === 'all'), onClick: () => { filter = 'all'; paint(); } }, t('cash.allAccounts')),
      ...real.map((a) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === a.id), onClick: () => { filter = a.id; paint(); } }, a.name)));
    const row = (c) => {
      const label = t(`cash.${c.kind}`);
      const signed = c.kind === 'withdrawal' ? -Math.abs(Number(c.amount)) : c.kind === 'deposit' ? Math.abs(Number(c.amount)) : Number(c.amount);
      const digits = fmt.minorDigits(c.currency);
      const minor = Math.round(signed * 10 ** digits);
      return el('div', { class: 'row' },
        el('span', { class: 'mk neutral' }, ctx.ui.icon(c.kind === 'withdrawal' ? 'up' : 'down')),
        el('div', { class: 'main' }, el('span', { class: 't' }, `${label} · ${names.get(c.accountId) ?? ''}`), el('span', { class: 'd' }, [fmt.date(/T/.test(c.time) ? c.time : `${c.time}T12:00:00Z`, { zone: 'UTC' }), c.importId ? t('cash.fromImport') : t('cash.typed'), c.note || null].filter(Boolean).join(' · '))),
        el('div', { class: 'end' }, el('span', { class: 'm num' }, fmt.money(minor, c.currency))),
        el('button', { type: 'button', class: 'icon-btn hit', 'aria-label': t('cash.remove'), onClick: async () => { await ctx.store.cash.delete(c.id); ctx.bus.emit('trades-changed'); paint(); } }, ctx.ui.icon('x', 'sm')));
    };
    mount(root, detailBar(ctx, { title: t('cash.title'), backHash: '#/settings', backLabel: t('nav.settings') }),
      el('main', { class: 'content' },
        real.length > 1 ? chips : null,
        ctx.ui.stateBanner({ kind: 'neutral', iconName: 'info', body: t('cash.lead') }),
        rows.length ? el('div', { class: 'list' }, ...rows.map(row)) : ctx.ui.emptyState({ iconName: 'database', title: t('cash.empty.title'), body: t('cash.empty.body') }),
        real.length ? ctx.ui.button({ label: t('cash.add'), kind: 'secondary', iconName: 'plus', block: true, onClick: () => cashSheet(ctx, { model, account: real.find((a) => a.id === filter), onSaved: paint }) })
          : ctx.ui.stateBanner({ kind: 'attention', iconName: 'alert', body: t('cash.needAccount'), href: '#/accounts' })));
  }
  await paint();
  return () => { disposed = true; };
}
