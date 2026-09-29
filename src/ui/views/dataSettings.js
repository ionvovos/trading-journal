// Settings > Your data (#/settings/data): export everything, restore from a file, lasting-storage status, the export reminder, and
// "Delete all data on this device" (AC-P8.1-P8.5, AC-P8.9; design/mockups data, data-delete). Rendered inside S1's Settings page.
import { el, mount } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { loadModel } from '../../storage/model.js';
import { buildExport, parseExport, mergeImport, exportFileName } from '../../storage/exportImport.js';
import { deleteAllData, exportDue } from '../../storage/actions.js';
import { downloadText, byteText, confirmSheet, toastMsg, pickSheet, nowIso } from '../../storage/viewkit.js';

const REMIND_CHOICES = [25, 50, 100, 200, 0];

async function persistState() {
  try {
    if (!navigator.storage?.persisted) return 'unknown';
    return (await navigator.storage.persisted()) ? 'granted' : 'not_granted';
  } catch { return 'unknown'; }
}

function deleteSheet(ctx, counts, onDone) {
  return new Promise((resolve) => {
    let alsoModel = false;
    let handle = null;
    let typed = '';
    const word = t('data.delete.word');
    const go = ctx.ui.button({ label: t('data.delete.go'), kind: 'danger', size: 'lg', block: true, disabled: true, onClick: async () => {
      go.disabled = true;
      await deleteAllData({ store: ctx.store, storage: globalThis.localStorage, caches: globalThis.caches, alsoModel });
      handle.close();
      resolve(true);
      onDone();
    } });
    const kv = el('div', { class: 'kv' }, ...[
      [t('data.delete.trades'), String(counts.trades)], [t('data.delete.accounts'), `${counts.accounts} · ${counts.cash}`],
      [t('data.delete.plans'), `${counts.plans} · ${counts.reviews}`], [t('data.delete.imports'), `${counts.imports} · ${counts.blobs}`], [t('data.delete.settings'), t('data.delete.all')],
    ].map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v))));
    const toggle = el('label', { class: 'set-row' }, el('input', { type: 'checkbox', class: 'check', onChange: (e) => { alsoModel = e.target.checked; } }), el('span', { class: 'lbl' }, t('data.delete.model'), el('small', null, t('data.delete.model.sub'))));
    const field = ctx.ui.field({ label: t('data.delete.typeLabel', { word }), onInput: (v) => { typed = v.trim().toUpperCase(); go.disabled = typed !== word.toUpperCase(); } });
    const body = el('div', { class: 'vstack' },
      el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('data.delete.removes'))), kv, el('p', { class: 'caption' }, t('data.delete.noCopy'))),
      ctx.ui.button({ label: t('data.delete.exportFirst'), kind: 'secondary', iconName: 'export', block: true, onClick: () => doExport(ctx) }),
      el('div', { class: 'list' }, toggle), field, el('p', { class: 'caption' }, t('data.delete.after')));
    handle = ctx.ui.sheet({ title: t('data.delete.title'), body, footer: go, onClose: () => resolve(false) });
  });
}

async function doExport(ctx) {
  const file = await buildExport(ctx.store, { now: nowIso() });
  const name = exportFileName(file.exportedAt);
  const { size } = downloadText(name, JSON.stringify(file), 'application/json');
  await ctx.store.setSetting('lastExportAt', file.exportedAt); // read straight from the store: S1's settings cache loads only its own keys
  toastMsg(ctx, t('data.export.done', { name, size: byteText(size) }));
  ctx.bus.emit('trades-changed');
  return file;
}

async function restoreFile(ctx, file, notify) {
  const text = await file.text();
  const parsed = parseExport(text);
  if (!parsed.ok) { notify({ kind: 'danger', title: t('data.restore.failed'), body: t(parsed.errorKey, { detail: parsed.detail ?? '' }) }); return; }
  const r = await mergeImport(ctx.store, parsed.data);
  ctx.bus.emit('trades-changed');
  notify({ kind: 'neutral', title: t('data.restore.done', { added: r.added, kept: r.kept }), body: '' });
}

export async function renderDataSettings(root, ctx) {
  let disposed = false;
  let notice = null;
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'sr', 'aria-label': t('data.restore.choose'), onChange: async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) await restoreFile(ctx, f, (n) => { notice = n; paint(); });
  } });

  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const [blobs, persisted] = [await ctx.store.blobs.getAll(), await persistState()];
    const counts = { trades: model.trades.length, accounts: model.accounts.length, cash: model.cash.length, plans: model.plans.length, reviews: (await ctx.store.reviews.getAll()).length, imports: model.imports.length, blobs: blobs.length };
    const every = Number(ctx.settings.get('exportReminderEvery') ?? 50);
    const due = exportDue({ trades: model.trades, lastExportAt: (await ctx.store.getSetting('lastExportAt')) || null, every });
    const real = model.accounts.filter((a) => a.mode === 'real').length;
    mount(root,
      ctx.storage?.refused ? ctx.ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('data.refused.title'), body: t('data.refused.body') }) : null,
      persisted === 'not_granted' ? ctx.ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('data.persist.title'), body: t('data.persist.body') }) : null,
      persisted === 'not_granted' ? ctx.ui.button({ label: t('data.persist.ask'), kind: 'secondary', block: true, onClick: async () => { try { await navigator.storage.persist(); } catch { /* refused */ } paint(); } }) : null,
      due.due ? ctx.ui.stateBanner({ kind: 'neutral', iconName: 'info', title: t('data.reminder.title', { n: due.n }), body: t('data.reminder.body') }) : null,
      notice ? ctx.ui.stateBanner({ kind: notice.kind, iconName: notice.kind === 'danger' ? 'alert' : 'check', title: notice.title, body: notice.body || undefined }) : null,
      el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('data.export.title'))),
        el('p', { class: 'sub' }, t('data.export.body', { trades: counts.trades, accounts: counts.accounts, real, paper: counts.accounts - real, plans: counts.plans, imports: counts.imports, shots: counts.blobs })),
        ctx.ui.button({ label: t('data.export.go'), iconName: 'export', block: true, onClick: async () => { await doExport(ctx); paint(); } })),
      el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('data.restore.title'))), el('p', { class: 'sub' }, t('data.restore.body')),
        ctx.ui.button({ label: t('data.restore.choose'), kind: 'plain', iconName: 'import', block: true, onClick: () => fileInput.click() }), fileInput),
      el('div', { class: 'list' }, el('button', { type: 'button', class: 'set-row', onClick: async () => {
        const v = await pickSheet(ctx, { title: t('data.reminder.field'), value: every, options: REMIND_CHOICES.map((n) => ({ value: n, label: n ? t('data.reminder.every', { n }) : t('data.reminder.never') })) });
        if (v !== undefined) { await ctx.settings.set('exportReminderEvery', v); paint(); }
      } }, el('span', { class: 'lbl' }, t('data.reminder.label'), el('small', null, t('data.reminder.sub'))), el('span', { class: 'val' }, every ? String(every) : t('data.reminder.never'), ctx.ui.icon('right')))),
      el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('data.delete.section'))), el('p', { class: 'sub' }, t('data.delete.lead')),
        ctx.ui.button({ label: t('data.delete.open'), kind: 'danger', block: true, onClick: () => deleteSheet(ctx, counts, () => { globalThis.location?.reload?.(); }) })));
  }
  await paint();
  return () => { disposed = true; };
}

export const render = renderDataSettings;
