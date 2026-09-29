// Accounts (#/accounts): broker accounts and the paper account, and the broker-check period of each until it is reconciled or
// skipped (design/mockups periods, PICK K3). Adding and editing an account happens in a sheet.
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { loadModel } from '../../storage/model.js';
import { createAccount, validateAccount } from '../../storage/actions.js';
import { periodsFor, periodLabel, byUrgency } from '../../storage/periods.js';
import { detailBar, sectionHead, nowIso } from '../../storage/viewkit.js';

const errorText = (e) => t(`form.error.${e.code}`);

function accountSheet(ctx, { account, model, onSaved }) {
  const isNew = !account;
  const draft = { name: account?.name ?? '', mode: account?.mode ?? ctx.mode, baseCurrency: account?.baseCurrency ?? ctx.displayCurrency(), startBalance: account?.startBalance ?? '', toDisplayRate: account?.toDisplayRate && account.toDisplayRate !== 1 ? String(account.toDisplayRate) : '' };
  // The currency this account's figures are shown in: what the person set; else, for the first account of a mode, its own currency
  // (the display currency then follows it); else the currency the mode's accounts share. A different currency needs a typed rate.
  const targetCcy = () => {
    if (ctx.settings.get(`displayCurrency.${draft.mode}`)) return ctx.displayCurrencyFor(draft.mode);
    return model.accounts.some((a) => a.mode === draft.mode && a.id !== account?.id) ? ctx.displayCurrencyFor(draft.mode) : draft.baseCurrency.toUpperCase();
  };
  const slot = el('div', { class: 'vstack' });
  let errors = [];
  const errFor = (f) => { const e = errors.find((x) => x.field === f); return e ? errorText(e) : undefined; };
  const draw = () => {
    const rate = draft.baseCurrency.toUpperCase() !== targetCcy();
    mount(slot,
      ctx.ui.field({ label: t('accounts.name'), value: draft.name, error: errFor('name'), placeholder: t('accounts.name.ph'), onInput: (v) => { draft.name = v; } }),
      isNew ? el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('accounts.kind')), ctx.ui.segmented({ ariaLabel: t('accounts.kind'), value: draft.mode, options: [{ value: 'real', label: t('accounts.kind.real') }, { value: 'paper', label: t('accounts.kind.paper') }], onChange: (v) => { draft.mode = v; } })) : null,
      el('div', { class: 'grid2' },
        ctx.ui.field({ label: t('accounts.currency'), value: draft.baseCurrency, error: errFor('baseCurrency'), maxlength: 5, onInput: (v) => { draft.baseCurrency = v.toUpperCase(); }, onChange: () => draw() }),
        ctx.ui.field({ label: t('accounts.start'), value: draft.startBalance, inputmode: 'decimal', unit: draft.baseCurrency, error: errFor('startBalance'), help: t('accounts.start.help'), onInput: (v) => { draft.startBalance = v; } })),
      rate ? ctx.ui.field({ label: t('accounts.rate', { from: draft.baseCurrency, to: targetCcy() }), value: draft.toDisplayRate, inputmode: 'decimal', error: errFor('toDisplayRate'), help: t('accounts.rate.help'), onInput: (v) => { draft.toDisplayRate = v; } }) : null);
  };
  draw();
  const s = ctx.ui.sheet({
    title: isNew ? t('accounts.add') : t('accounts.edit'), body: slot, mode: draft.mode,
    footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: async () => {
      const next = createAccount(draft, { now: account?.createdAt ?? nowIso(), id: account?.id });
      const built = account ? { ...account, name: next.name, baseCurrency: next.baseCurrency, startBalance: next.startBalance, toDisplayRate: next.toDisplayRate } : next;
      errors = validateAccount(built, model.accounts, { displayCcy: targetCcy() });
      if (errors.length) { draw(); return; }
      await ctx.store.accounts.put(built);
      s.close();
      onSaved?.(built);
    } }),
  });
  return s;
}

export async function render(root, ctx) {
  let disposed = false;
  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const { fmt } = ctx;
    const real = model.accounts.filter((a) => a.mode === 'real');
    const paper = model.accounts.filter((a) => a.mode === 'paper');
    const row = (a) => el('a', { class: 'row', href: '#', onClick: (e) => { e.preventDefault(); accountSheet(ctx, { account: a, model, onSaved: paint }); } },
      el('span', { class: 'mk neutral' }, ctx.ui.icon(a.mode === 'paper' ? 'paper' : 'stock')),
      el('div', { class: 'main' }, el('span', { class: 't' }, a.name, a.mode === 'paper' ? el('span', { class: 'tag info' }, t('mode.paper')) : null),
        el('span', { class: 'd' }, [a.baseCurrency, a.startBalance ? t('accounts.startedWith', { x: fmt.num(Number(a.startBalance), 2) }) : t('accounts.noStart')].join(' · '))),
      el('div', { class: 'end' }, ctx.ui.icon('right', 'chev')));
    const periods = byUrgency(periodsFor(model, { tz: ctx.tz }));
    const periodRow = (p) => el('a', { class: 'row', href: `#/reconcile/${p.accountId}?from=${p.period.from}&to=${p.period.to}&zone=${encodeURIComponent(p.period.zone)}` },
      el('span', { class: 'mk neutral' }, ctx.ui.icon('scale')),
      el('div', { class: 'main' }, el('span', { class: 't' }, p.accountName), el('span', { class: 'd' }, periodLabel(p.period, fmt))),
      el('div', { class: 'end' }, ctx.ui.statusChip(p.state)));
    mount(root, detailBar(ctx, { title: t('accounts.title'), backHash: '#/settings', backLabel: t('nav.settings') }),
      el('main', { class: 'content' },
        real.length ? [sectionHead(t('accounts.broker')), el('div', { class: 'list' }, ...real.map(row))] : ctx.ui.stateBanner({ kind: 'neutral', iconName: 'info', body: t('accounts.none') }),
        paper.length ? [sectionHead(t('accounts.paper')), el('div', { class: 'list' }, ...paper.map(row))] : null,
        ctx.ui.button({ label: t('accounts.add'), kind: 'secondary', iconName: 'plus', block: true, onClick: () => accountSheet(ctx, { model, onSaved: paint }) }),
        periods.length ? [sectionHead(t('accounts.periods')), el('p', { class: 'sub' }, t('accounts.periods.lead')), el('div', { class: 'list' }, ...periods.map(periodRow))] : null,
        paper.length ? ctx.ui.stateBanner({ kind: 'neutral', iconName: 'info', body: t('accounts.paperNoCheck') }) : null));
  }
  await paint();
  const off = ctx.bus.on('trades-changed', paint);
  return () => { disposed = true; off(); };
}
