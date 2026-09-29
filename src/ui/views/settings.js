// Settings (design/mockups settings). General, broker accounts, plan and checks, AI, data, About. Rows open a sheet for a value
// they own (language, appearance, time zone, day start, display currency, tolerance, small-sample note) or the screen that owns it:
// #/accounts, #/cash, #/plan (S2, S3). #/settings/data shows S2's renderDataSettings and #/settings/ai S3's renderAiSettings inside
// this page, so Settings stays one place (architecture section 10: "#/settings dataSettings", "#/settings aiSettings").
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { APP_VERSION } from '../../about/text.js';

const OWN_KEY_STORAGE = 'trading-journal.ai-key';
const CCY_RE = /^[A-Z]{3,5}$/;

function readLocal(key) { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } }

const row = ({ color, iconName, label, sub, value, onClick, href, ui }) => el(href ? 'a' : 'button', { class: 'set-row', href, type: href ? null : 'button', onClick: onClick && ((e) => { e.preventDefault?.(); onClick(e); }) },
  el('span', { class: ['ic', `c-${color}`] }, ui.icon(iconName)),
  el('span', { class: 'lbl' }, label, sub ? el('small', null, sub) : null),
  el('span', { class: 'val' }, value ?? '', ui.icon('right')));

const group = (title, ...rows) => [el('div', { class: 'group-h' }, title), el('div', { class: 'list' }, ...rows.filter(Boolean))];

// A sheet listing options, one row per option, check mark on the current one.
function optionSheet(ctx, { title, options, value, onPick }) {
  const list = el('div', { class: 'choice-list' });
  const s = ctx.ui.sheet({ title, body: list, cancelLabel: t('sheet.close') });
  for (const o of options) {
    list.append(el('button', { type: 'button', class: ['opt', o.value === value && 'on'], onClick: async () => { await onPick(o.value); s.close(); } },
      el('span', { class: 'grow' }, o.label, o.sub ? el('small', null, o.sub) : null), o.value === value ? ctx.ui.icon('check', 'check-mark') : null));
  }
  return s;
}

// A sheet with one text field and a Save button. `parse(text)` returns { value } or { error }.
function valueSheet(ctx, { title, label, value, unit, help, inputmode, parse, onSave }) {
  const slot = el('div');
  const draw = (text, error) => { const f = ctx.ui.field({ label, value: text, unit, help, inputmode, error }); mount(slot, f); return f; };
  let f = draw(String(value ?? ''));
  const s = ctx.ui.sheet({
    title, body: slot,
    footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: async () => {
      const r = parse(f.input.value.trim());
      if (r.error) { f = draw(f.input.value, r.error); f.input.focus(); return; }
      await onSave(r.value);
      s.close();
    } }),
  });
  return s;
}

function zoneOptions(current) {
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = ['UTC', 'Europe/Athens', 'Europe/London', 'America/New_York', 'Asia/Tokyo']; }
  const common = ['Europe/Athens', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'];
  return [...new Set([current, 'UTC', ...common.filter((z) => zones.includes(z)), ...zones])];
}

function zoneSheet(ctx, done) {
  const current = ctx.tz;
  const list = el('div', { class: 'choice-list' });
  const search = ctx.ui.field({ label: t('settings.tz.search'), placeholder: 'Athens, New_York, UTC', onInput: () => fill() });
  const all = zoneOptions(current);
  const fill = () => {
    const q = search.input.value.trim().toLowerCase().replaceAll(' ', '_');
    const shown = (q ? all.filter((z) => z.toLowerCase().includes(q)) : all.slice(0, 30)).slice(0, 40);
    mount(list, ...shown.map((z) => el('button', { type: 'button', class: ['opt', z === current && 'on'], onClick: async () => { await ctx.settings.set('tz', z); s.close(); done(); } },
      el('span', { class: 'grow' }, z), z === current ? ctx.ui.icon('check', 'check-mark') : null)));
    if (!shown.length) mount(list, el('p', { class: 'caption' }, t('settings.tz.none')));
  };
  const s = ctx.ui.sheet({ title: t('settings.tz'), body: el('div', { class: 'ob-stack' }, search, list), cancelLabel: t('sheet.close') });
  fill();
  return s;
}

const positiveInt = (min, max) => (text) => {
  const n = Number(text);
  return Number.isInteger(n) && n >= min && n <= max ? { value: n } : { error: t('settings.err.range', { min, max }) };
};

async function ownKeyState() { return readLocal(OWN_KEY_STORAGE) ? t('settings.ai.keySet') : t('settings.ai.keyNone'); }

async function mainPage(root, ctx, repaint) {
  const { ui, settings } = ctx;
  const accounts = await ctx.store.accounts.getAll().catch(() => []);
  const cash = await ctx.store.cash.getAll().catch(() => []);
  const plans = await ctx.store.plans.getAll().catch(() => []);
  const activePlan = plans.find((p) => p.active) ?? plans[0];
  const themeLabel = { system: t('settings.appearance.system'), light: t('settings.appearance.light'), dark: t('settings.appearance.dark') }[settings.get('theme') || 'system'];
  const engine = settings.get('ai.engine');
  const engineLabel = engine ? t(`settings.ai.engine.${engine}`) : t('settings.ai.engine.auto');
  const keyState = await ownKeyState();
  const money = (a) => (a.startBalance !== undefined && a.startBalance !== null ? ctx.fmt.moneyPlain(Math.round(Number(a.startBalance) * 10 ** ctx.fmt.minorDigits(a.baseCurrency)), a.baseCurrency) : null);

  const general = group(t('settings.general'),
    row({ ui, color: 'accent', iconName: 'globe', label: t('settings.language'), value: ctx.lang === 'el' ? 'Ελληνικά' : 'English', onClick: () => optionSheet(ctx, {
      title: t('settings.language'), value: ctx.lang, options: [{ value: 'en', label: 'English' }, { value: 'el', label: 'Ελληνικά' }], onPick: (l) => ctx.setLang(l) }) }),
    row({ ui, color: 'real', iconName: 'moon', label: t('settings.appearance'), value: themeLabel, onClick: () => optionSheet(ctx, {
      title: t('settings.appearance'), value: settings.get('theme') || 'system',
      options: [{ value: 'system', label: t('settings.appearance.system') }, { value: 'light', label: t('settings.appearance.light') }, { value: 'dark', label: t('settings.appearance.dark') }],
      onPick: async (v) => { await settings.set('theme', v); if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v; repaint(); } }) }),
    row({ ui, color: 'muted', iconName: 'clock', label: t('settings.tz'), sub: t('settings.tz.sub'), value: ctx.tz.split('/').pop().replaceAll('_', ' '), onClick: () => zoneSheet(ctx, repaint) }),
    row({ ui, color: 'muted', iconName: 'calendar', label: t('settings.dayStart'), value: `${String(settings.get('dayCutoffHour') ?? 0).padStart(2, '0')}:00`, onClick: () => valueSheet(ctx, {
      title: t('settings.dayStart'), label: t('settings.dayStart.field'), value: settings.get('dayCutoffHour') ?? 0, help: t('settings.dayStart.help'), inputmode: 'numeric', parse: positiveInt(0, 23), onSave: async (v) => { await settings.set('dayCutoffHour', v); repaint(); } }) }));

  const accountRows = accounts.filter((a) => a.mode !== undefined).map((a) => row({
    ui, color: a.mode === 'paper' ? 'paper' : 'real', iconName: a.mode === 'paper' ? 'paper' : 'file', label: a.name,
    sub: [a.mode === 'paper' ? null : t('mode.real'), money(a) ? t(a.mode === 'paper' ? 'settings.accounts.pretend' : 'settings.accounts.start', { x: money(a) }) : null].filter(Boolean).join(' · '),
    value: a.baseCurrency, href: '#/accounts' }));
  const brokers = group(t('settings.brokers'),
    ...(accountRows.length ? accountRows : [row({ ui, color: 'real', iconName: 'file', label: t('settings.accounts.manage'), href: '#/accounts' })]),
    row({ ui, color: 'muted', iconName: 'scale', label: t('settings.displayCurrency'), sub: t('settings.displayCurrency.sub', { real: ctx.displayCurrencyFor('real'), paper: ctx.displayCurrencyFor('paper') }), value: `${ctx.displayCurrencyFor('real')}, ${ctx.displayCurrencyFor('paper')}`, onClick: () => currencySheet(ctx, repaint) }),
    row({ ui, color: 'muted', iconName: 'import', label: t('settings.cash'), value: String(cash.length), href: '#/cash' }));

  const plan = group(t('settings.plan'),
    row({ ui, color: 'gain', iconName: 'target', label: t('settings.myPlan'), value: activePlan ? t('settings.rules', { n: activePlan.items?.length ?? 0 }) : t('settings.notSet'), href: '#/plan' }),
    row({ ui, color: 'attention', iconName: 'sliders', label: t('settings.lossWindow'), sub: t('settings.placeholderNote'), value: `${settings.get('lossWindowMin') ?? 30} min`, onClick: () => valueSheet(ctx, {
      title: t('settings.lossWindow'), label: t('settings.lossWindow.field'), value: settings.get('lossWindowMin') ?? 30, unit: 'min', help: t('settings.placeholderNote'), inputmode: 'numeric', parse: positiveInt(1, 600), onSave: async (v) => { await settings.set('lossWindowMin', v); repaint(); } }) }),
    row({ ui, color: 'attention', iconName: 'neq', label: t('settings.tolerance'), sub: t('settings.tolerance.sub'), value: String(settings.get('reconcileCap') ?? '1.00'), onClick: () => valueSheet(ctx, {
      title: t('settings.tolerance'), label: t('settings.tolerance.field'), value: settings.get('reconcileCap') ?? '1.00', help: t('settings.tolerance.help'), inputmode: 'decimal',
      parse: (x) => (/^\d+([.,]\d{1,2})?$/.test(x) && Number(x.replace(',', '.')) > 0 ? { value: Number(x.replace(',', '.')).toFixed(2) } : { error: t('settings.err.amount') }),
      onSave: async (v) => { await settings.set('reconcileCap', v); repaint(); } }) }),
    row({ ui, color: 'muted', iconName: 'info', label: t('settings.smallSample'), sub: t('settings.smallSample.sub'), value: String(settings.get('smallSampleMin') ?? 30), onClick: () => valueSheet(ctx, {
      title: t('settings.smallSample'), label: t('settings.smallSample.field'), value: settings.get('smallSampleMin') ?? 30, inputmode: 'numeric', parse: positiveInt(1, 1000), onSave: async (v) => { await settings.set('smallSampleMin', v); repaint(); } }) }));

  const ai = group(t('settings.ai'),
    row({ ui, color: 'accent', iconName: 'chip', label: t('settings.ai.engine'), value: engineLabel, href: '#/settings/ai' }),
    row({ ui, color: 'muted', iconName: 'key', label: t('settings.ai.key'), value: keyState, href: '#/settings/ai' }));

  const data = group(t('settings.data'),
    row({ ui, color: 'gain', iconName: 'database', label: t('settings.yourData'), sub: t('settings.yourData.sub'), href: '#/settings/data' }),
    row({ ui, color: 'muted', iconName: 'info', label: t('settings.about'), value: `v${APP_VERSION}`, href: '#/about' }));

  mount(root,
    ui.topbar({ back: { label: t('nav.home'), onClick: () => ctx.navigate('#/home') }, title: t('settings.title') }),
    el('main', { class: 'content' }, ...general, ...brokers, ...plan, ...ai, ...data));
}

function currencySheet(ctx, done) {
  const real = ctx.ui.field({ label: t('settings.displayCurrency.real'), value: ctx.displayCurrencyFor('real'), maxlength: 5 });
  const paper = ctx.ui.field({ label: t('settings.displayCurrency.paper'), value: ctx.displayCurrencyFor('paper'), maxlength: 5 });
  const s = ctx.ui.sheet({
    title: t('settings.displayCurrency'), body: el('div', { class: 'ob-stack' }, real, paper, el('p', { class: 'caption' }, t('settings.displayCurrency.help'))),
    footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: async () => {
      const a = real.input.value.trim().toUpperCase(); const b = paper.input.value.trim().toUpperCase();
      if (!CCY_RE.test(a) || !CCY_RE.test(b)) { real.input.setAttribute('aria-invalid', 'true'); paper.input.setAttribute('aria-invalid', 'true'); return; }
      await ctx.settings.set('displayCurrency.real', a); await ctx.settings.set('displayCurrency.paper', b);
      s.close(); done();
    } }),
  });
}

// A section of Settings owned by another shard: its module renders into this page under the Settings top bar.
async function ownedSection(root, ctx, section) {
  const spec = { data: { title: t('settings.yourData'), load: () => import('./dataSettings.js'), fn: 'renderDataSettings' }, ai: { title: t('settings.ai'), load: () => import('./aiSettings.js'), fn: 'renderAiSettings' } }[section];
  const body = el('main', { class: 'content' });
  mount(root, ctx.ui.topbar({ back: { label: t('settings.title'), onClick: () => ctx.navigate('#/settings') }, title: spec?.title ?? '' }), body);
  let cleanup = null;
  try {
    const mod = await spec.load();
    cleanup = await mod[spec.fn](body, ctx);
  } catch (error) {
    const nb = await import('../components/notBuilt.js');
    nb.render(body, ctx, { name: `settings/${section}`, error });
  }
  return cleanup;
}

export async function render(root, ctx, params = {}) {
  let disposed = false;
  let inner = null;
  const holder = el('div');
  mount(root, holder);
  if (params.section === 'data' || params.section === 'ai') { inner = await ownedSection(holder, ctx, params.section); return () => inner?.(); }
  const repaint = () => { if (!disposed) mainPage(holder, ctx, repaint); };
  await mainPage(holder, ctx, repaint);
  return () => { disposed = true; };
}
