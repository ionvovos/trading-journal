// First run (design/mockups onboarding-welcome, onboarding-path). Two steps: the promise with the lawyer's first-run sentence
// (AC-B1.5) and the language; then the path: paper (beginner), import (trader) or a real trade by hand. Screens shown once.
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { FIRST_RUN } from '../../about/text.js';

const PATHS = ['paper', 'import', 'hand'];

function newId() { return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

// A paper account with a pretend balance is created when the beginner starts on paper (editable later in Settings).
export async function createPaperAccount(ctx) {
  const existing = (await ctx.store.accounts.getAll()).find((a) => a.mode === 'paper');
  if (existing) return existing;
  const account = { id: newId(), name: t('first.paperAccount'), mode: 'paper', baseCurrency: 'EUR', startBalance: '10000', toDisplayRate: 1, fileZones: {}, dustThresholds: {}, contractValues: {}, createdAt: new Date().toISOString() };
  await ctx.store.accounts.put(account);
  await ctx.settings.set('displayCurrency.paper', 'EUR');
  return account;
}

export async function finishFirstRun(ctx, path) {
  if (path === 'paper') { await createPaperAccount(ctx); await ctx.settings.set('mode', 'paper'); } else await ctx.settings.set('mode', 'real');
  await ctx.settings.set('firstRunDone', true);
  ctx.navigate(path === 'import' ? '#/import' : path === 'hand' ? '#/trade/new' : '#/home');
}

export function render(root, ctx) {
  let step = 1;
  let path = 'paper';
  const { ui } = ctx;

  const steps = (n) => el('div', { class: 'steps', role: 'img', 'aria-label': t('first.step', { n, total: 2 }) }, el('i', { class: 'done' }), el('i', { class: n === 2 ? 'done' : null }));

  const welcome = () => el('div', { class: 'ob' },
    steps(1),
    el('div', { class: 'app-logo' }, ui.logo(64)),
    el('div', { class: 'ob-stack tight' }, el('h1', null, t('first.title')), el('p', { class: 'lead' }, t('first.lead'))),
    el('section', { class: 'card note-card' }, el('span', { class: 'mk accent' }, ui.icon('shield')), el('p', null, FIRST_RUN[ctx.lang])),
    el('section', { class: 'card note-card' }, el('span', { class: 'mk neutral' }, ui.icon('lock')), el('p', null, t('first.noAccount'))),
    el('div', { class: 'spacer' }),
    el('div', { class: 'ob-foot' },
      el('div', { class: 'field lang-field' }, el('span', { class: 'lbl' }, t('first.language')),
        ui.segmented({ ariaLabel: t('first.language'), value: ctx.lang, options: [{ value: 'en', label: 'English', lang: 'en' }, { value: 'el', label: 'Ελληνικά', lang: 'el' }], onChange: (l) => ctx.setLang(l) })),
      ui.button({ label: t('first.continue'), size: 'lg', block: true, onClick: () => { step = 2; paint(); } })));

  const choice = (id, iconName, cls) => el('button', { type: 'button', class: ['choice', path === id && 'sel'], 'aria-pressed': String(path === id), onClick: () => { path = id; paint(); } },
    el('span', { class: ['ic', cls] }, ui.icon(iconName)),
    el('span', null, el('h3', null, t(`first.path.${id}`)), el('span', { class: 'sub' }, t(`first.path.${id}Sub`))),
    el('span', { class: ['radio', path === id && 'on'] }));

  const chooser = () => el('div', { class: 'ob' },
    steps(2),
    el('div', { class: 'ob-stack tight' }, el('h1', null, t('first.path.title')), el('p', { class: 'lead' }, t('first.path.lead'))),
    el('div', { class: 'ob-stack' }, choice('paper', 'paper', 'paper'), choice('import', 'import', 'real'), choice('hand', 'pencil', 'real')),
    el('div', { class: 'spacer' }),
    el('div', { class: 'ob-foot' },
      path === 'paper' ? el('p', { class: 'caption' }, t('first.paperLimits')) : null,
      ui.button({ label: t(`first.go.${path}`), size: 'lg', block: true, onClick: () => finishFirstRun(ctx, path) }),
      ui.button({ label: t('first.back'), kind: 'ghost', block: true, onClick: () => { step = 1; paint(); } })));

  function paint() { mount(root, step === 1 ? welcome() : chooser()); }
  paint();
  return null;
}
