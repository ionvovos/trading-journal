// AI settings (#/settings/ai, design/mockups settings-ai, settings-key). Rules only, the on-device model (with consent and download
// progress), or the person's own key. The engine and its state are always shown (AC-P9.3). Before an own key is turned on the screen
// lists what is sent and says the service applies its own terms (AC-P9.2). Nothing here produces a number.
// Rendered inside the Settings page by src/ui/views/settings.js: renderAiSettings(body, ctx) -> cleanup.
import { el, mount, t } from '../../review/viewkit.js';
import { enginesFor, deviceHost, loadAiSettings, saveAiSetting, browserKeyStore } from '../../ai/index.js';
import { keyBinding, resolveProvider, describeAiError, AiError } from '../../ai/adapter.js';
import { LLM_BYTES, deleteModelCaches } from '../../ai/device.js';

const HOSTS = ['cdn.jsdelivr.net', 'huggingface.co', 'raw.githubusercontent.com'];
const MB = Math.round(LLM_BYTES / (1024 * 1024));
const mask = (key) => (key ? `••••••••••••${key.slice(-4)}` : '');

export async function renderAiSettings(root, ctx) {
  let disposed = false;
  const keys = browserKeyStore();
  const engines = enginesFor(ctx);
  const device = deviceHost();
  const s = await loadAiSettings(ctx.store);
  const draft = { provider: s['ai.provider'] === 'openai' ? 'openai' : 'anthropic', model: s['ai.model'] ?? '', baseUrl: s['ai.baseUrl'] ?? '', key: '' };
  let panel = s['ai.engine'] === 'own-key' ? 'own' : null;
  let status = await engines.status(s, ctx.lang);
  let live = { engine: status.engine, state: status.state, progress: null, reason: status.reason };
  let message = '';
  let busy = false;

  const off = ctx.bus.on('ai-state', (e) => { live = { ...live, ...e }; if (!disposed) paint(); });
  const set = async (k, v) => { s[k] = v; await saveAiSetting(ctx, k, v); };
  const draftSettings = () => ({ 'ai.provider': draft.provider, 'ai.model': draft.model, 'ai.baseUrl': draft.provider === 'openai' ? draft.baseUrl || null : null });
  const errorText = (err) => (err instanceof AiError ? t(`ai.error.${err.kind}`) : describeAiError(err));
  const refresh = async () => { status = await engines.status(s, ctx.lang); if (!live.progress || live.state !== 'downloading') live = { ...live, engine: status.engine, state: status.state, reason: status.reason }; paint(); };

  const stateChip = () => {
    const id = live.engine === 'rules' && live.state === 'ready' ? 'rules' : live.engine;
    return el('span', { class: 'engine', 'data-engine': id, 'data-state': live.state }, ctx.ui.icon(id === 'rules' ? 'sliders' : id === 'own-key' ? 'key' : 'chip', 'sm'),
      `${t(`review.ui.engine.${id === 'rules' ? 'rulesChosen' : id}`)} · ${t(`ai.state.${live.state}`)}`);
  };

  async function chooseRules() { await set('ai.engine', 'rules'); panel = null; message = ''; await refresh(); }

  async function chooseDevice() {
    panel = 'device';
    message = '';
    const problem = await device.check();
    if (problem) { live = { engine: 'rules', state: 'unavailable', reason: problem.reason, progress: null }; paint(); return; }
    if (s['ai.device.consent'] === 'yes') { await set('ai.engine', 'on-device'); await refresh(); return; }
    consentSheet();
  }

  function consentSheet() {
    const sheet = ctx.ui.sheet({
      title: t('ai.device.consent.h'), cancelLabel: t('sheet.cancel'),
      body: el('div', { class: 'vstack' }, el('p', { class: 'sub' }, t('ai.device.consent.body', { mb: MB, hosts: HOSTS.join(', ') }))),
      footer: ctx.ui.button({ label: t('ai.device.download'), size: 'lg', block: true, onClick: async () => { sheet.close(); await startDownload(); } }),
    });
  }

  async function startDownload() {
    await set('ai.device.consent', 'yes');
    await set('ai.engine', 'on-device');
    panel = 'device';
    live = { engine: 'on-device', state: 'downloading', progress: 0, reason: null };
    paint();
    const r = await engines.loadDevice({ onProgress: () => {} });
    if (!r.ok) message = t('ai.device.failed', { reason: r.reason });
    await refresh();
  }

  async function removeModel() {
    device.cancel();
    await deleteModelCaches();
    await set('ai.device.consent', 'ask');
    if (s['ai.engine'] === 'on-device') await set('ai.engine', 'rules');
    message = t('ai.device.removed');
    live = { engine: 'rules', state: 'ready', progress: null, reason: 'no_model_set_up' };
    await refresh();
  }

  async function turnOnOwnKey() {
    const typed = draft.key.trim();
    const binding = keyBinding(draftSettings());
    if (!binding) return;
    if (draft.provider === 'openai' && !draft.model.trim()) { message = t('ai.own.needModel'); paint(); return; }
    if (keys.reconcileKey(binding) === 'removed' && !typed) { message = t('ai.own.changed'); paint(); return; }
    if (typed) keys.setKey(typed, binding);
    if (!keys.hasKeyFor(binding)) { message = t('ai.own.needKey'); paint(); return; }
    await set('ai.provider', draft.provider);
    await set('ai.model', draft.model.trim());
    await set('ai.baseUrl', draftSettings()['ai.baseUrl']);
    await set('ai.own.confirmed', true);
    await set('ai.engine', 'own-key');
    draft.key = '';
    message = '';
    await refresh();
  }

  async function turnOffOwnKey() { await set('ai.own.confirmed', false); if (s['ai.engine'] === 'own-key') await set('ai.engine', 'rules'); await refresh(); }
  async function removeOwnKey() { keys.removeKey(); await turnOffOwnKey(); message = t('ai.own.removed'); paint(); }

  async function testConnection() {
    busy = true; message = ''; paint();
    try {
      const provider = resolveProvider(draftSettings(), keys, { fetch: (...a) => globalThis.fetch(...a), typedKey: draft.key.trim() });
      if (!provider) message = draft.provider === 'openai' && !draft.model.trim() ? t('ai.own.needModel') : t('ai.own.needKey');
      else { await provider.test(); message = t('ai.own.test.ok'); }
    } catch (err) { message = errorText(err); }
    busy = false; paint();
  }

  const optionRow = ({ key, title, sub, selected, onSelect }) => el('button', { type: 'button', class: 'set-row engine-row', role: 'radio', 'aria-checked': String(selected), onClick: onSelect },
    el('span', { class: ['radio', selected && 'on'] }), el('span', { class: 'lbl' }, title, el('small', null, sub)), key ? el('span', { class: 'val' }, key) : null);

  const devicePanel = () => {
    const rows = [];
    const problem = live.state === 'unavailable' && ['no-webgpu', 'no-f16', 'memory'].includes(live.reason) ? live.reason : null;
    if (problem) rows.push(el('p', { class: 'caption' }, t(`ai.device.${problem}`)));
    if (ctx.lang === 'el') rows.push(el('p', { class: 'caption' }, t('ai.device.greek')));
    if (live.state === 'downloading') {
      const done = Math.round(((live.progress ?? 0) / 100) * MB);
      rows.push(el('div', { class: 'progress-wrap' },
        el('div', { class: 'spread' }, el('span', { class: 'caption num strong' }, t('ai.device.downloading', { done, total: MB })), el('span', { class: 'caption num' }, `${live.progress ?? 0}%`)),
        el('span', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(live.progress ?? 0), 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('i', { style: { width: `${live.progress ?? 0}%` } }))),
      ctx.ui.button({ label: t('ai.device.pause'), kind: 'plain', block: true, onClick: async () => { device.cancel(); live = { engine: 'rules', state: 'ready', progress: null, reason: 'not_loaded' }; await refresh(); } }));
    } else if (!problem && s['ai.device.consent'] === 'yes') {
      rows.push(el('p', { class: 'caption' }, device.loaded() ? t('ai.device.loaded') : t('ai.device.notLoaded')));
      if (!device.loaded()) rows.push(ctx.ui.button({ label: t('ai.device.download'), kind: 'secondary', block: true, onClick: startDownload }));
    } else if (!problem) rows.push(ctx.ui.button({ label: t('ai.device.download'), kind: 'secondary', block: true, onClick: consentSheet }));
    if (s['ai.device.consent'] === 'yes') rows.push(ctx.ui.button({ label: t('ai.device.remove'), kind: 'plain', block: true, onClick: removeModel }));
    return el('section', { class: 'card vstack' }, ...rows);
  };

  const ownPanel = () => {
    const binding = keyBinding(draftSettings());
    const saved = binding ? keys.getKeyFor(binding) : null;
    const host = binding?.host ?? '';
    const sent = (label, yes) => el('div', null, el('dt', null, label), el('dd', null, yes ? t('ai.own.sent.yes') : t('ai.own.sent.never')));
    return el('div', { class: 'vstack' },
      ctx.ui.segmented({ ariaLabel: t('ai.own.provider'), value: draft.provider, options: ['anthropic', 'openai'].map((p) => ({ value: p, label: t(`ai.own.provider.${p}`) })), onChange: (v) => { draft.provider = v; message = ''; paint(); } }),
      el('section', { class: 'card vstack' },
        draft.provider === 'openai' ? ctx.ui.field({ label: t('ai.own.address'), value: draft.baseUrl, placeholder: 'https://api.openai.com/v1', inputmode: 'url', onInput: (v) => { draft.baseUrl = v; } }) : null,
        ctx.ui.field({ label: t('ai.own.model'), value: draft.model, placeholder: draft.provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : '', onInput: (v) => { draft.model = v; } }),
        ctx.ui.field({ label: t('ai.own.key'), value: draft.key, type: 'password', autocomplete: 'off', placeholder: saved ? mask(saved) : t('ai.own.key.placeholder'), help: t('ai.own.key.help'), onInput: (v) => { draft.key = v; } })),
      el('section', { class: 'card' },
        el('div', { class: 'card-h' }, el('h3', null, t('ai.own.sent.h'))),
        el('dl', { class: 'kv' }, sent(t('ai.own.sent.figures'), true), sent(t('ai.own.sent.sentence'), true), sent(t('ai.own.sent.names'), false), sent(t('ai.own.sent.rule'), false), sent(t('ai.own.sent.notes'), false), sent(t('ai.own.sent.other'), false)),
        el('p', { class: 'caption top-gap' }, t('ai.own.sent.note', { host }))),
      el('div', { class: 'action-stack' },
        ctx.ui.button({ label: t('ai.own.turnOn'), size: 'lg', block: true, disabled: busy, onClick: turnOnOwnKey }),
        ctx.ui.button({ label: t('ai.own.test'), kind: 'secondary', block: true, disabled: busy, onClick: testConnection }),
        keys.hasKey() ? ctx.ui.button({ label: t('ai.own.remove'), kind: 'plain', block: true, onClick: removeOwnKey }) : null,
        s['ai.own.confirmed'] ? ctx.ui.button({ label: t('ai.own.turnOff'), kind: 'plain', block: true, onClick: turnOffOwnKey }) : null));
  };

  function paint() {
    if (disposed) return;
    const choice = s['ai.engine'];
    mount(root,
      el('p', { class: 'sub pad-x' }, t('ai.intro')),
      el('div', { class: 'spread wrap' }, stateChip()),
      el('div', { class: 'list', role: 'radiogroup', 'aria-label': t('ai.title') },
        optionRow({ title: t('ai.rules'), sub: t('ai.rules.sub'), selected: choice === 'rules' || (choice === 'auto' && status.engine === 'rules' && !panel), onSelect: chooseRules }),
        optionRow({ title: t('ai.device'), sub: t('ai.device.sub'), selected: choice === 'on-device' || panel === 'device', onSelect: chooseDevice }),
        optionRow({ title: t('ai.own'), sub: t('ai.own.sub'), key: keys.hasKey() ? t('ai.own.set') : t('ai.own.notSet'), selected: choice === 'own-key' || panel === 'own', onSelect: () => { panel = 'own'; message = ''; paint(); } })),
      panel === 'device' ? devicePanel() : null,
      panel === 'own' ? ownPanel() : null,
      message ? el('p', { class: 'caption pad-x', role: 'status' }, message) : null);
  }
  paint();
  return () => { disposed = true; off?.(); mount(root); };
}

export const render = renderAiSettings;
