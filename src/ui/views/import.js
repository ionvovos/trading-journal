// Import (#/import, #/import/:id; design/mockups import-*): choose a file and an account, confirm the file's time zone when the
// format does not state it, watch it build, read the report, answer one question per kind of anomaly, then go to the broker check.
// Everything runs on this device. The raw file text is kept on the import so an answer rebuilds the trades from it.
import { el, mount } from '../dom.js';
import { t, has } from '../../i18n/i18n.js';
import { loadFormats, formats, detectFormat, getFormat } from '../../import/registry.js';
import { runImport, answerAnomaly, commitImport } from '../../import/run.js';
import { readFileText } from '../../import/decode.js';
import { KINDS } from '../../import/anomalies.js';
import { reportJson, reportHtml } from '../../import/reportHtml.js';
import { isValidZone } from '../../core/time.js';
import { loadModel } from '../../storage/model.js';
import { loadStats, detailBar, sectionHead, pickSheet, downloadText, toastMsg, nowIso } from '../../storage/viewkit.js';
import { periodLabel } from '../../storage/periods.js';
import { tradeStatus } from '../../core/trade.js';

const steps = (n) => el('div', { class: 'steps', role: 'img', 'aria-label': t('import.step', { n, total: 4 }) }, ...[1, 2, 3, 4].map((i) => el('i', { class: i <= n ? 'done' : '' })));

const ZONE_PRESETS = ['ny+7', 'America/New_York', 'Europe/London', 'Europe/Athens', 'UTC'];
export const zoneLabel = (zone) => (zone === 'ny+7' ? t('import.zone.ny7') : zone);

// Pure: the anomaly's option ids with their labels, in the order the question shows them. `disabled` marks options the file cannot support.
export function optionsFor(anomaly, trades) {
  const kind = KINDS[anomaly.kind];
  return kind.options.map((id) => {
    let disabled = false;
    if (anomaly.kind === 'opened_before_file' && id === 'keep_broker_pnl') disabled = !trades.some((x) => anomaly.tradeIds.includes(x.id) && x.broker);
    return { id, disabled };
  });
}

function errorCard(ctx, error, retry) {
  const { ui } = ctx;
  const code = error?.code && has(error.code) ? error.code : 'import.error.generic';
  return el('div', { class: 'vstack' },
    ui.emptyState({ iconName: 'alert', title: t('import.error.title'), body: t(code, { formatId: error?.formatId ?? '' }) }),
    el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('import.error.found'))), el('div', { class: 'kv' }, el('div', null, el('dt', null, t('import.error.rows')), el('dd', null, '0')), el('div', null, el('dt', null, t('import.error.journal')), el('dd', null, t('import.error.unchanged'))))),
    el('div', { class: 'vstack' }, ui.button({ label: t('import.choose.another'), size: 'lg', block: true, onClick: retry }), el('a', { class: 'btn plain lg block', href: './docs/generic-template.csv', download: 'trading-journal-template.csv' }, t('import.template'))));
}

// ---------- step 1: choose ----------

async function renderPicker(root, ctx) {
  await loadFormats();
  let model = await loadModel(ctx.store);
  const st = { account: null, file: null, formatId: null, zone: null, error: null, running: false };
  const real = () => model.accounts.filter((a) => a.mode === 'real');
  st.account = real().find((a) => a.id === ctx.accountFilter) ?? real()[0] ?? null;
  const input = el('input', { type: 'file', accept: '.csv,.htm,.html,.txt,text/csv,text/html', class: 'sr', 'aria-label': t('import.choose'), onChange: async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    st.error = null;
    try {
      const { text } = await readFileText(f);
      const det = detectFormat(text);
      st.file = { name: f.name, text };
      st.formatId = det.format?.id ?? null;
      st.zone = null;
      if (!det.format) st.error = { code: 'import.error.formatNotDetected' };
    } catch (err) { st.error = err; }
    paint();
  } });

  const zoneFor = () => {
    const f = st.formatId ? getFormat(st.formatId) : null;
    if (!f || f.statesZone) return null;
    return st.zone ?? st.account?.fileZones?.[f.id] ?? (f.id === 'mt4-statement' ? 'ny+7' : 'America/New_York');
  };

  async function pickZone() {
    const cur = zoneFor();
    const v = await pickSheet(ctx, { title: t('import.zone.title'), value: cur, options: [...new Set([cur, ...ZONE_PRESETS])].filter(Boolean).map((z) => ({ value: z, label: zoneLabel(z) })).concat([{ value: '__other', label: t('import.zone.other') }]) });
    if (v === undefined) return;
    if (v !== '__other') { st.zone = v; paint(); return; }
    let typed = '';
    let error;
    const slot = el('div');
    const draw = () => mount(slot, ctx.ui.field({ label: t('import.zone.other'), value: typed, placeholder: 'Europe/Paris', error, help: t('import.zone.help'), onInput: (x) => { typed = x; } }));
    draw();
    const s = ctx.ui.sheet({ title: t('import.zone.title'), body: slot, footer: ctx.ui.button({ label: t('sheet.save'), size: 'lg', block: true, onClick: () => { if (!isValidZone(typed.trim())) { error = t('import.zone.bad'); draw(); return; } st.zone = typed.trim(); s.close(); paint(); } }) });
  }

  async function start() {
    if (!st.file || !st.account || !st.formatId) return;
    st.running = true;
    st.error = null;
    paint();
    try {
      const stats = await loadStats();
      const deps = { tradeMoney: stats.tradeMoney, initialRisk: stats.initialRisk };
      model = await loadModel(ctx.store);
      const account = model.accounts.find((a) => a.id === st.account.id);
      const existing = { trades: model.trades.filter((x) => x.accountId === account.id), cash: model.cash.filter((c) => c.accountId === account.id) };
      const result = await runImport({ text: st.file.text, fileName: st.file.name, formatId: st.formatId, account, fileZone: zoneFor(), declaredZone: ctx.tz, existing, now: nowIso() }, { bus: ctx.bus, deps });
      await commitImport(ctx.store, result);
      const up = result.accountUpdates;
      const next = { ...account, fileZones: { ...(account.fileZones || {}) }, contractValues: { ...(account.contractValues || {}), ...(up.contractValues || {}) } };
      if (up.fileZone) next.fileZones[up.fileZone.formatId] = up.fileZone.zone;
      await ctx.store.accounts.put(next);
      ctx.bus.emit('trades-changed');
      ctx.navigate(`#/import/${result.importRecord.id}`);
    } catch (err) {
      console.error('import failed', err);
      st.running = false;
      st.error = err;
      paint();
    }
  }

  const bar = el('div');
  ctx.bus.on('import-progress', () => {});
  function paint() {
    const { ui } = ctx;
    const accounts = real();
    const fmtObj = st.formatId ? getFormat(st.formatId) : null;
    const zone = zoneFor();
    let body;
    if (st.running) {
      const prog = ui.progress({ done: 0, total: 1, label: t('import.building') });
      const off = ctx.bus.on('import-progress', (e) => prog.update(e.done, e.total, t('import.rows', { a: ctx.fmt.num(e.done), b: ctx.fmt.num(e.total) })));
      body = [steps(2), el('section', { class: 'card' }, el('div', { class: 'spread' }, el('h3', null, t('import.building'))), prog, el('p', { class: 'caption' }, `${st.file.name} · ${fmtObj ? t(fmtObj.labelKey) : ''}`)), el('p', { class: 'caption center-note' }, t('import.local'))];
      void off;
    } else if (st.error && !st.file) body = [steps(1), errorCard(ctx, st.error, () => { st.error = null; paint(); })];
    else if (st.file) {
      body = [steps(2),
        el('section', { class: 'card file-card' }, el('span', { class: 'mk neutral' }, ui.icon('file')), el('div', { class: 'main' }, el('div', { class: 'file-name' }, st.file.name), el('div', { class: 'caption num' }, fmtObj ? t('import.detected', { format: t(fmtObj.labelKey), account: st.account?.name ?? '' }) : t('import.notDetected')))),
        st.error ? ui.stateBanner({ kind: 'danger', iconName: 'alert', title: t('import.error.title'), body: t(st.error.code && has(st.error.code) ? st.error.code : 'import.error.generic', { formatId: st.error.formatId ?? '' }) }) : null,
        el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('import.format')), ui.segmented({ ariaLabel: t('import.format'), value: st.formatId, options: formats.map((f) => ({ value: f.id, label: t(f.labelKey) })), onChange: (v) => { st.formatId = v; st.error = null; paint(); } })),
        accounts.length > 1 ? el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('import.account')), ui.segmented({ ariaLabel: t('import.account'), value: st.account?.id, options: accounts.map((a) => ({ value: a.id, label: a.name })), onChange: (v) => { st.account = accounts.find((a) => a.id === v); paint(); } })) : null,
        zone ? el('button', { type: 'button', class: 'set-row', onClick: pickZone }, el('span', { class: 'lbl' }, t('import.zone.label'), el('small', null, t('import.zone.help'))), el('span', { class: 'val attn' }, zoneLabel(zone), ui.icon('right'))) : null,
        ui.button({ label: t('import.go'), size: 'lg', block: true, disabled: !st.formatId || !st.account, onClick: start }),
        ui.button({ label: t('import.choose.another'), kind: 'plain', block: true, onClick: () => input.click() })];
    } else {
      body = [steps(1),
        ui.emptyState({ iconName: 'import', title: t('import.pick.title'), body: t('import.pick.body') }),
        accounts.length ? null : ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('import.noAccount.title'), body: t('import.noAccount.body'), href: '#/accounts' }),
        accounts.length > 1 ? el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('import.account')), ui.segmented({ ariaLabel: t('import.account'), value: st.account?.id, options: accounts.map((a) => ({ value: a.id, label: a.name })), onChange: (v) => { st.account = accounts.find((a) => a.id === v); paint(); } })) : null,
        ui.button({ label: t('import.choose'), size: 'lg', block: true, disabled: !accounts.length, onClick: () => input.click() }),
        el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('import.formats.title'))), el('div', { class: 'kv' }, ...formats.map((f) => el('div', null, el('dt', null, t(f.labelKey)), el('dd', null, t(`market.${f.market === 'any' ? 'stock' : f.market}`))))),
          el('a', { class: 'link', href: './docs/generic-template.csv', download: 'trading-journal-template.csv' }, t('import.template')))];
    }
    mount(root, detailBar(ctx, { title: t('import.title'), backHash: '#/journal', backLabel: t('nav.journal') }), el('main', { class: 'content' }, ...body, input, bar));
  }
  paint();
  return () => {};
}

// ---------- step 3: report and questions ----------

function optionRow(ctx, { kind, id, disabled, selected, onSelect }) {
  const label = t(`import.opt.${kind}.${id}`);
  const subKey = `import.opt.${kind}.${id}.sub`;
  return el('button', { type: 'button', class: ['opt', selected && 'on', disabled && 'off'], disabled, 'aria-pressed': String(selected), onClick: onSelect }, el('span', { class: ['radio', selected && 'on'] }), el('span', null, label, has(subKey) ? el('small', null, t(subKey)) : null));
}

async function renderRecord(root, ctx, importId) {
  let disposed = false;
  let open = null; // anomaly id whose answered question is being changed
  const draftFor = new Map();
  async function paint() {
    const model = await loadModel(ctx.store);
    if (disposed) return;
    const { ui, fmt } = ctx;
    const record = model.imports.find((i) => i.id === importId);
    if (!record) { mount(root, detailBar(ctx, { title: t('import.title'), backHash: '#/journal' }), el('main', { class: 'content' }, ui.emptyState({ iconName: 'search', title: t('import.missing.title'), body: t('import.missing.body') }))); return; }
    const account = model.accounts.find((a) => a.id === record.accountId);
    const trades = model.trades.filter((x) => x.importId === record.id);
    const cash = model.cash.filter((c) => c.importId === record.id);
    const rep = record.report;
    const byId = new Map(trades.map((x) => [x.id, x]));
    const pending = record.anomalies.filter((a) => (!a.answer || a.id === open) && KINDS[a.kind]);
    const answered = record.anomalies.filter((a) => a.answer && a.id !== open);

    async function apply(anomaly, answers) {
      const stats = await loadStats();
      const deps = { tradeMoney: stats.tradeMoney, initialRisk: stats.initialRisk };
      const existing = { trades: model.trades.filter((x) => x.accountId === account.id && x.importId !== record.id), cash: model.cash.filter((c) => c.accountId === account.id && c.importId !== record.id) };
      let rec = record;
      let cur = trades;
      let res = null;
      for (const a of answers) {
        res = await answerAnomaly(rec, cur, anomaly.id, a, { account, existing, deps, bus: ctx.bus, now: nowIso() });
        rec = res.importRecord;
        cur = res.trades;
      }
      await commitImport(ctx.store, res, { replaceTradeIds: trades.map((x) => x.id), replaceCashIds: cash.map((c) => c.id) });
      const up = res.accountUpdates?.contractValues;
      if (up && Object.keys(up).length) await ctx.store.accounts.put({ ...account, contractValues: { ...(account.contractValues || {}), ...up } });
      ctx.bus.emit('trades-changed');
      open = null;
      paint();
    }

    const label = (tr) => `${tr.instrument} · ${fmt.date(tr.closeTime || tr.legs[0].time)}`;
    const questionCard = (anomaly, idx, total) => {
      const opts = optionsFor(anomaly, trades);
      const draft = draftFor.get(anomaly.id) ?? { option: KINDS[anomaly.kind].defaultOption, values: {} };
      draftFor.set(anomaly.id, draft);
      const affected = anomaly.tradeIds.map((id) => byId.get(id)).filter(Boolean);
      const inst = [...new Set(affected.map((x) => x.instrument))];
      const links = affected.map((tr) => el('a', { class: 'trade-link', href: `#/trade/${tr.id}` }, label(tr)));
      const entries = anomaly.detail?.entries ?? [];
      const values = el('div', { class: 'vstack' });
      const drawValues = () => {
        const nodes = [];
        const set = (k) => (v) => { draft.values[k] = v; };
        if (draft.option === 'enter_open') nodes.push(el('div', { class: 'grid2' }, ui.field({ label: t('import.value.price'), inputmode: 'decimal', value: draft.values.price ?? '', onInput: set('price') }), ui.field({ label: t('import.value.date'), placeholder: 'YYYY-MM-DD', inputmode: 'numeric', value: draft.values.date ?? '', onInput: set('date') })));
        if (draft.option === 'enter_fee') for (const [tid, fills] of Object.entries(anomaly.detail?.fills ?? {})) for (const key of Object.keys(fills)) nodes.push(ui.field({ label: t('import.value.fee', { trade: byId.get(tid) ? label(byId.get(tid)) : key }), inputmode: 'decimal', value: draft.values[key] ?? '', unit: account?.baseCurrency, onInput: set(key) }));
        if (draft.option === 'rate') for (const c of anomaly.detail?.currencies ?? []) nodes.push(ui.field({ label: t('import.value.rate', { from: c, to: account?.baseCurrency ?? '' }), inputmode: 'decimal', value: draft.values[c] ?? '', onInput: set(c) }));
        if (draft.option === 'value') for (const s of anomaly.detail?.symbols ?? []) nodes.push(ui.field({ label: t('import.value.contract', { symbol: s }), inputmode: 'decimal', value: draft.values[s] ?? '', help: t('import.value.contract.help'), onInput: set(s) }));
        if (draft.option === 'attach') for (const e of entries) nodes.push(el('button', { type: 'button', class: 'set-row', onClick: async () => { const v = await pickSheet(ctx, { title: t('import.value.attach', { instrument: e.instrument }), value: draft.values[e.key], options: trades.map((x) => ({ value: x.id, label: label(x) })) }); if (v !== undefined) { draft.values[e.key] = v; drawValues(); } } }, el('span', { class: 'lbl' }, `${e.instrument} · ${e.amount}`), el('span', { class: 'val' }, draft.values[e.key] ? label(byId.get(draft.values[e.key])) : t('import.value.choose'), ui.icon('right'))));
        mount(values, ...nodes);
      };
      drawValues();
      const options = el('div', { class: 'vstack' });
      const drawOptions = () => mount(options, ...opts.map((o) => optionRow(ctx, { kind: anomaly.kind, id: o.id, disabled: o.disabled, selected: draft.option === o.id, onSelect: () => { draft.option = o.id; drawOptions(); drawValues(); } })));
      drawOptions();
      const submit = async () => {
        if (!draft.option) return;
        const kind = anomaly.kind;
        const v = draft.values;
        let answers = [];
        if (kind === 'opened_before_file' && draft.option === 'enter_open') answers = [{ optionId: 'enter_open', value: { price: v.price, date: v.date } }];
        else if (kind === 'missing_fee' && draft.option === 'enter_fee') answers = [{ optionId: 'enter_fee', value: { ...v } }];
        else if (kind === 'rate_missing') answers = [{ optionId: 'rate', value: { ...v } }];
        else if (kind === 'contract_size_missing') answers = [{ optionId: 'value', value: { ...v } }];
        else if (kind === 'funding_unmatched' && draft.option === 'attach') answers = entries.filter((e) => v[e.key]).map((e) => ({ optionId: 'attach', value: v[e.key], tradeId: e.key }));
        else answers = [{ optionId: draft.option }];
        if (!answers.length) return;
        await apply(anomaly, answers);
      };
      return el('section', { class: 'q' },
        el('span', { class: 'qn' }, t('import.q.n', { a: idx + 1, b: total })),
        el('p', { class: 'qt' }, t(`import.q.${anomaly.kind}`, { n: affected.length || entries.length || (anomaly.detail?.skipped?.length ?? 0), instruments: inst.join(', '), currencies: (anomaly.detail?.currencies ?? []).join(', '), symbols: (anomaly.detail?.symbols ?? []).join(', ') })),
        links.length ? el('div', { class: 'hstack wrap' }, ...links) : null,
        anomaly.kind === 'unreadable_rows' ? el('div', { class: 'vstack' }, ...(anomaly.detail.skipped || []).slice(0, 12).map((s) => el('div', { class: 'spread top' }, el('span', { class: 'caption num row-no' }, t('import.report.row', { n: s.row })), el('span', { class: 'sub' }, t(s.reasonKey))))) : null,
        options, values, ui.button({ label: t('import.answer'), kind: 'primary', block: true, onClick: submit }));
    };

    const skipped = rep.skipped || [];
    const reportCard = el('section', { class: 'card' }, el('div', { class: 'card-h' }, el('h3', null, t('import.report.rows')), el('span', { class: 'caption num' }, t('import.report.inFile', { n: fmt.num(rep.rowsInFile) }))),
      el('div', { class: 'kv' },
        el('div', null, el('dt', null, t('import.report.fills')), el('dd', null, String(rep.rowsRead - rep.cashRows - (rep.fundingRows || 0)))),
        el('div', null, el('dt', null, t('import.report.tradesBuilt')), el('dd', null, String(rep.tradesBuilt))),
        rep.matched ? el('div', null, el('dt', null, t('import.report.matchedEarlier')), el('dd', null, String(rep.matched))) : null,
        rep.cashRows ? el('div', null, el('dt', null, t('import.report.cash')), el('dd', null, String(rep.cashRows))) : null,
        skipped.length ? el('div', null, el('dt', null, t('import.report.skippedRows')), el('dd', { class: 'attn' }, String(skipped.length))) : null,
        el('div', null, el('dt', null, t('import.report.rKnown')), el('dd', null, t('import.report.rKnownOf', { a: rep.rKnownShare.known, b: rep.rKnownShare.of })))),
      ...skipped.slice(0, 8).map((s) => el('div', { class: 'spread top' }, el('span', { class: 'caption num row-no' }, t('import.report.row', { n: s.row })), el('span', { class: 'sub' }, t(s.reasonKey)))));

    const period = rep.period;
    const recon = model.reconciliations.find((r) => account && period && r.id === `${account.id}:${period.from}:${period.to}`);
    const checkHref = account && period ? `#/reconcile/${account.id}?from=${period.from}&to=${period.to}&zone=${encodeURIComponent(period.zone)}&import=${record.id}` : '#/accounts';
    const held = trades.filter((x) => tradeStatus(x) === 'held').length;
    const stepNum = pending.length ? 3 : 4;

    const saveReport = async (kind) => {
      const base = `${(record.fileName || 'import').replace(/\.[^.]+$/, '')}-report`;
      if (kind === 'json') downloadText(`${base}.json`, JSON.stringify(reportJson(record, recon), null, 2));
      else downloadText(`${base}.html`, reportHtml(record, { t, fmt, reconciliation: recon, accountName: account?.name ?? '', currency: account?.baseCurrency ?? 'USD' }), 'text/html');
      toastMsg(ctx, t('import.report.saved'));
    };

    mount(root, detailBar(ctx, { title: t('import.title'), backHash: '#/journal', backLabel: t('nav.journal') }),
      el('main', { class: 'content' }, steps(stepNum),
        record.status === 'cancelled' ? ui.stateBanner({ kind: 'neutral', iconName: 'info', title: t('import.cancelled.title'), body: t('import.cancelled.body') }) : null,
        rep.currencyMismatch ? ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('import.currency.title'), body: t('import.currency.body', { file: rep.fileCurrency, account: account?.baseCurrency ?? '' }) }) : null,
        el('div', { class: 'vstack tight' }, el('h2', { class: 'big-h' }, pending.length ? t('import.questions.title', { n: pending.length }) : t('import.report.done')),
          el('p', { class: 'sub' }, pending.length ? t('import.questions.lead', { n: held }) : t('import.report.doneLead', { n: rep.tradesBuilt }))),
        ...pending.map((a, i) => questionCard(a, i, pending.length)),
        reportCard,
        answered.length ? [sectionHead(t('import.answered')), el('div', { class: 'list' }, ...answered.map((a) => el('div', { class: 'row' }, el('div', { class: 'main' }, el('span', { class: 't' }, t(`import.kind.${a.kind}`)), el('span', { class: 'd' }, t(`import.opt.${a.kind}.${a.answer.optionId}`))), record.status !== 'cancelled' && !a.resolved ? el('button', { type: 'button', class: 'link', onClick: () => { open = a.id; draftFor.set(a.id, { option: a.answer.optionId, values: {} }); paint(); } }, t('import.change')) : null)))] : null,
        rep.rKnownShare.of > rep.rKnownShare.known ? ui.stateBanner({ kind: 'neutral', iconName: 'target', title: t('import.stops.title', { a: rep.rKnownShare.known, b: rep.rKnownShare.of }), body: t('import.stops.body'), href: '#/stops' }) : null,
        record.status === 'cancelled' ? null : ui.button({ label: t('import.check.go'), size: 'lg', block: true, onClick: () => ctx.navigate(checkHref) }),
        recon ? el('div', { class: 'row status-row' }, el('div', { class: 'main' }, el('span', { class: 't' }, t('import.check.state')), el('span', { class: 'd' }, period ? periodLabel(period, fmt) : '')), el('div', { class: 'end' }, ui.statusChip(recon.state))) : null,
        el('div', { class: 'btn-row' }, ui.button({ label: t('import.report.saveJson'), kind: 'plain', onClick: () => saveReport('json') }), ui.button({ label: t('import.report.saveHtml'), kind: 'plain', onClick: () => saveReport('html') })),
        ui.button({ label: t('import.toJournal'), kind: 'ghost', block: true, onClick: () => ctx.navigate('#/journal') })));
  }
  await paint();
  return () => { disposed = true; };
}

export async function render(root, ctx, params = {}) {
  return params.id ? renderRecord(root, ctx, params.id) : renderPicker(root, ctx);
}
