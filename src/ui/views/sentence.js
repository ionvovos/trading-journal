// Sentence entry (#/sentence, design/mockups log-sentence, log-sentence-el). One typed sentence in English or Greek is read by code,
// field by field, and saved after one tap (AC-P1.5). A field that cannot be read stays empty and is asked for, one question at a time;
// a number that can be read two ways ("1.085" in Greek) is asked with both readings, never guessed (AC-P7.2). A model may add the setup
// and notes; every number stays the code's reading and a difference is shown beside it (AC-P1.6).
import { el, mount, t, detailBar } from '../../review/viewkit.js';
import { parseSentence, REQUIRED } from '../../sentence/parse.js';
import { assistSentence } from '../../sentence/assist.js';
import { enginesFor, loadAiSettings } from '../../ai/index.js';
import { loadModel } from '../../storage/model.js';
import { buildManualTrade } from '../../storage/actions.js';
import { emptyDraft, toForm } from './tradeForm.js';
import { runChecklist, afterSave } from './checklist.js';
import { parseUserDecimal } from '../../core/money.js';

const SHOWN = ['instrument', 'market', 'side', 'size', 'entry', 'exit', 'stop', 'target', 'fee', 'setup', 'notes'];
const NUMERIC = new Set(['size', 'entry', 'exit', 'stop', 'target', 'fee']);

export async function render(root, ctx, params = {}) {
  let disposed = false;
  const state = params.state ?? {};
  const model = await loadModel(ctx.store);
  const accounts = model.accounts.filter((a) => a.mode === ctx.mode);
  let account = accounts.find((a) => a.id === ctx.accountFilter) ?? accounts[0] ?? null;
  let mark = null;
  if (!state.checklistDone && ctx.data?.runChecklist) { try { mark = await runChecklist(ctx, { accountId: account?.id ?? null }); } catch (e) { console.error('checklist failed', e); } }

  let text = state.text ?? '';
  let parsed = null;
  let fields = null;
  let conflicts = [];
  const typed = {}; // the value being typed beside each conflict, by field
  let assistNote = '';
  let engineId = 'rules';
  let asked = ''; // the answer being typed for the current question
  let saveError = false;

  const aiSettings = await loadAiSettings(ctx.store);
  const setups = [...new Set([...model.plans.flatMap((p) => p.setups ?? []), ...model.trades.map((x) => x.setup).filter(Boolean)])];
  const knownInstruments = [...new Set(model.trades.map((x) => x.instrument))];

  async function read() {
    parsed = parseSentence(text, { lang: ctx.lang, setups, instruments: knownInstruments });
    fields = { ...parsed.fields, notes: null };
    conflicts = [];
    for (const k of Object.keys(typed)) delete typed[k];
    assistNote = '';
    engineId = 'rules';
    paint();
    // the model step is optional and never blocks: the code reading is already on screen
    try {
      const engine = await enginesFor(ctx).resolve(aiSettings, ctx.lang);
      if (engine.id === 'rules') return;
      const r = await assistSentence(engine, text, parsed, { lang: ctx.lang, setups });
      if (disposed || !parsed) return;
      engineId = r.by === 'model' ? engine.id : 'rules';
      assistNote = r.note;
      if (r.by === 'model') {
        fields = { ...fields, setup: fields.setup ?? r.fields.setup, notes: r.fields.notes };
        conflicts = r.conflicts;
      }
      paint();
    } catch { /* the code reading stands */ }
  }

  const unresolved = () => {
    if (!parsed) return [];
    const amb = parsed.ambiguous.filter((a) => fields[a.field] === null);
    const missing = REQUIRED.filter((f) => fields[f] === null && !amb.some((a) => a.field === f));
    return [...amb.map((a) => ({ kind: 'ambiguous', field: a.field, readings: a.readings })), ...missing.map((f) => ({ kind: 'missing', field: f }))];
  };

  const fieldLabel = (f) => t(`sentence.field.${f}`);
  const valueText = (f, v) => (f === 'side' ? t(`label.side.${v}`) : f === 'market' ? t(`market.${v}`) : NUMERIC.has(f) ? ctx.fmt.num(Number(v), Math.min(8, (String(v).split('.')[1] ?? '').length)) : v);

  function question(q) {
    if (q.kind === 'ambiguous') {
      const raw = q.readings[0];
      return el('section', { class: 'q accent-ring' },
        el('span', { class: 'qn' }, t('sentence.q.h')),
        el('p', { class: 'qt' }, t('sentence.q.ambiguous', { raw })),
        el('div', { class: 'vstack' }, ...q.readings.map((r) => el('button', { type: 'button', class: 'opt', onClick: () => { fields[q.field] = r; paint(); } },
          el('span', { class: 'radio' }), el('span', null, `${fieldLabel(q.field)}: ${ctx.fmt.num(Number(r), (r.split('.')[1] ?? '').length)}`)))));
    }
    const isSide = q.field === 'side';
    return el('section', { class: 'q accent-ring' },
      el('span', { class: 'qn' }, t('sentence.q.h')),
      el('p', { class: 'qt' }, t('sentence.q.missing', { field: fieldLabel(q.field).toLocaleLowerCase(ctx.lang) })),
      isSide
        ? ctx.ui.segmented({ ariaLabel: fieldLabel('side'), value: null, options: ['long', 'short'].map((v) => ({ value: v, label: t(`label.side.${v}`) })), onChange: (v) => { fields.side = v; paint(); } })
        : ctx.ui.field({ label: t('sentence.q.answer'), value: asked, inputmode: q.field === 'instrument' ? 'text' : 'decimal', onInput: (v) => { asked = v; } }),
      isSide ? null : ctx.ui.button({ label: t('sentence.q.next'), kind: 'secondary', block: true, onClick: () => {
        const v = asked.trim();
        if (!v) return;
        const value = q.field === 'instrument' ? v.toUpperCase() : parseUserDecimal(v);
        if (value === null || value === undefined) return;
        fields[q.field] = value;
        asked = '';
        paint();
      } }));
  }

  const rowsList = () => el('div', { class: 'list' }, ...SHOWN.filter((f) => fields[f] !== null && fields[f] !== undefined && fields[f] !== '').map((f) => el('div', { class: 'set-row', 'data-field': f },
    el('span', { class: 'check auto-ok', role: 'img', 'aria-label': fieldLabel(f) }, ctx.ui.icon('check')),
    el('span', { class: 'lbl' }, fieldLabel(f), parsed.derived.includes(f) ? el('small', null, t('sentence.derived', { pips: parsed.fields.stopPips })) : null),
    el('span', { class: 'val num strong' }, valueText(f, fields[f])))));

  // Both readings are shown and neither is applied: the person types the value they mean (L4b F12, RULING-L4-F5 R3). The model's
  // number is never a button, so it cannot reach a trade field except through what the person types.
  const conflictBlock = () => conflicts.map((c) => el('div', { class: 'banner attention' }, ctx.ui.icon('info'),
    el('div', { class: 'body' },
      c.code === null ? t('sentence.conflict.none', { field: fieldLabel(c.field), model: c.model }) : t('sentence.conflict', { field: fieldLabel(c.field), model: c.model, code: c.code }),
      ctx.ui.field({ label: t('sentence.conflict.type', { field: fieldLabel(c.field).toLocaleLowerCase(ctx.lang) }), value: typed[c.field] ?? '', inputmode: 'decimal', onInput: (v) => { typed[c.field] = v; } }),
      el('div', { class: 'btn-row' }, ctx.ui.button({ label: t('sentence.conflict.set'), kind: 'secondary', onClick: () => {
        const value = parseUserDecimal(String(typed[c.field] ?? '').trim());
        if (value === null || value === undefined) return;
        fields[c.field] = value;
        conflicts = conflicts.filter((x) => x !== c);
        paint();
      } }))),
    el('span', { class: 'spacer' })));

  async function save() {
    if (!account) return;
    const now = new Date().toISOString();
    const draft = { ...emptyDraft({ account, now, tz: ctx.tz }), market: fields.market ?? 'stock', instrument: fields.instrument ?? '', side: fields.side ?? 'long', size: fields.size ?? '', entryPrice: fields.entry ?? '',
      stop: fields.stop ?? '', target: fields.target ?? '', fee: fields.fee ?? '', setup: fields.setup ?? '', notes: fields.notes ?? '', exitPrice: fields.exit ?? '' };
    const r = buildManualTrade(toForm(draft), { account, declaredZone: ctx.tz, now });
    if (!r.trade) { saveError = { draft }; paint(); return; }
    const trade = { ...r.trade, entry: 'sentence', plan: mark ?? r.trade.plan };
    await ctx.store.trades.put(trade);
    try { await ctx.data?.afterSave?.(ctx, trade); } catch (e) { console.error('afterSave failed', e); }
    ctx.bus.emit('trades-changed');
    ctx.ui.toast({ text: t('sentence.saved') });
    ctx.navigate('#/journal');
  }

  function paint() {
    if (disposed) return;
    const q = parsed ? unresolved()[0] : null;
    const content = [
      el('div', { class: 'vstack' },
        ctx.ui.field({ label: t('sentence.input'), value: text, placeholder: t('sentence.placeholder'), maxlength: 400, onInput: (v) => { text = v; } }),
        el('p', { class: 'caption' }, t('sentence.hint')),
        ctx.ui.button({ label: t('sentence.read'), size: 'lg', block: true, iconName: 'send', onClick: read })),
    ];
    if (parsed) {
      content.push(rowsList());
      if (q) content.push(question(q));
      content.push(...conflictBlock());
      if (assistNote && assistNote !== 'no_model') content.push(el('p', { class: 'caption' }, t('sentence.model.note', { note: assistNote })));
      if (engineId !== 'rules') content.push(el('p', { class: 'caption' }, t('sentence.model.on', { engine: t(`review.ui.engine.${engineId}`) })));
      content.push(el('p', { class: 'caption' }, t('sentence.codeOnly', { time: ctx.fmt.time(new Date().toISOString(), ctx.tz) })));
      if (!account) content.push(ctx.ui.stateBanner({ kind: 'attention', iconName: 'alert', title: t('sentence.noAccount'), href: '#/accounts' }));
      if (saveError) content.push(ctx.ui.stateBanner({ kind: 'danger', iconName: 'alert', body: t('sentence.err.save'), onClick: () => ctx.navigate('#/trade/new', { draft: saveError.draft, checklistDone: true }) }));
      if (accounts.length > 1) content.push(ctx.ui.segmented({ ariaLabel: t('form.account'), value: account?.id, options: accounts.map((a) => ({ value: a.id, label: a.name })), onChange: (v) => { account = accounts.find((a) => a.id === v); paint(); } }));
    }
    mount(root, el('div', { class: ['app-s3', 'has-actions'] },
      detailBar(ctx, { title: t('sentence.title'), backHash: '#/trade/new', backLabel: t('sentence.back') }),
      el('main', { class: 'content' }, ...content),
      el('div', { class: 'actions' }, ctx.ui.button({ label: ctx.mode === 'paper' ? t('sentence.save.paper') : t('sentence.save.real'), size: 'lg', block: true, disabled: !parsed || Boolean(q) || !account, onClick: save }))));
  }

  paint();
  if (text) await read();
  return () => { disposed = true; mount(root); };
}
