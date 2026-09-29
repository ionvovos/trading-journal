// My plan (#/plan, design/mockups plan). The user writes their own rules: checklist items, setups, allowed hours, a daily trade cap,
// risk per trade and a daily loss limit (AC-P2.1). Every field is optional and starts empty; risk per trade and daily loss limit never
// have a default (W5). Example items are offered unselected and name no instrument (AC-P2.5).
import { el, mount, t, page, detailBar, activePlan } from '../../review/viewkit.js';
import { emptyPlan, normalizePlan } from '../../plan/check.js';
import { newId } from '../../storage/model.js';

const EXAMPLES = ['plan.example.1', 'plan.example.2', 'plan.example.3'];
const TIME = /^\d{1,2}:\d{2}$/;

export async function render(root, ctx) {
  const plans = await ctx.store.plans.getAll().catch(() => []);
  const existing = activePlan(plans);
  const draft = existing ? structuredClone(existing) : emptyPlan(newId('plan-'), t('plan.title'));
  const win = draft.hours?.[0] ?? { from: '', to: '' };
  const state = { from: win.from ?? '', to: win.to ?? '', risk: draft.riskPct ?? '', loss: draft.dailyLossLimitPct ?? '', cap: draft.dailyCap ?? '', item: '', setup: '', errors: {} };

  const paint = () => {
    const items = draft.items ?? [];
    const itemList = items.length
      ? el('div', { class: 'list' }, ...items.map((it, i) => el('div', { class: 'set-row' },
        el('span', { class: 'lbl' }, it.text),
        el('button', { type: 'button', class: 'btn plain', 'aria-label': `${t('plan.item.remove')}: ${it.text}`, onClick: () => { draft.items.splice(i, 1); paint(); } }, t('plan.item.remove')))))
      : el('p', { class: 'sub' }, t('plan.checklist.empty'));
    const addItem = () => {
      const text = state.item.trim();
      if (!text) return;
      draft.items = [...(draft.items ?? []), { id: `i${Date.now().toString(36)}${(draft.items ?? []).length}`, text }];
      state.item = '';
      paint();
    };
    const itemField = ctx.ui.field({ label: t('plan.item.write'), value: state.item, placeholder: t('plan.item.placeholder'), onInput: (v) => { state.item = v; }, maxlength: 140 });
    const examples = el('div', { class: 'list' }, ...EXAMPLES.map((key) => {
      const text = t(key);
      const added = (draft.items ?? []).some((i) => i.text === text);
      return el('div', { class: 'set-row' }, el('span', { class: 'lbl' }, text),
        el('button', { type: 'button', class: 'btn plain', disabled: added, onClick: () => { draft.items = [...(draft.items ?? []), { id: `e${key.slice(-1)}`, text }]; paint(); } }, ctx.ui.icon('plus', 'sm'), t('plan.examples.add')));
    }));
    const setups = el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('plan.setups')),
      el('div', { class: 'chips' },
        (draft.setups ?? []).length ? (draft.setups ?? []).map((s, i) => el('button', { type: 'button', class: 'chip', 'aria-pressed': 'true', 'aria-label': `${t('plan.item.remove')}: ${s}`, onClick: () => { draft.setups.splice(i, 1); paint(); } }, s, ctx.ui.icon('x', 'sm'))) : el('span', { class: 'caption self-center' }, t('plan.setups.none'))),
      el('div', { class: 'grid2' },
        ctx.ui.field({ label: t('plan.setups.name'), value: state.setup, onInput: (v) => { state.setup = v; }, maxlength: 40 }),
        el('div', { class: 'field field-action' }, ctx.ui.button({ label: t('plan.setups.add'), kind: 'secondary', block: true, onClick: () => {
          const s = state.setup.trim();
          if (s && !(draft.setups ?? []).includes(s)) draft.setups = [...(draft.setups ?? []), s];
          state.setup = '';
          paint();
        } }))));
    const num = (key, label, unit) => ctx.ui.field({ label, value: String(state[key]), inputmode: 'decimal', unit, placeholder: t('plan.yourNumber'), error: state.errors[key] ? t('plan.err.number') : undefined, onInput: (v) => { state[key] = v; } });
    const rules = el('section', { class: 'card vstack' },
      setups,
      el('div', { class: 'grid2' },
        ctx.ui.field({ label: t('plan.hours.from'), value: state.from, placeholder: t('plan.yourNumber'), inputmode: 'numeric', error: state.errors.hours ? t('plan.err.hours') : undefined, onInput: (v) => { state.from = v; } }),
        ctx.ui.field({ label: t('plan.hours.to'), value: state.to, placeholder: t('plan.yourNumber'), inputmode: 'numeric', onInput: (v) => { state.to = v; } })),
      el('div', { class: 'grid2' }, num('risk', t('plan.risk'), '%'), num('loss', t('plan.lossLimit'), '%')),
      num('cap', t('plan.cap')),
      el('p', { class: 'caption' }, t('plan.note', { zone: ctx.tz })));

    const save = async () => {
      state.errors = {};
      const from = state.from.trim(); const to = state.to.trim();
      const hasHours = from || to;
      if (hasHours && !(TIME.test(from) && TIME.test(to))) state.errors.hours = true;
      const dec = (v) => String(v).trim().replace(',', '.');
      for (const key of ['risk', 'loss', 'cap']) {
        const v = dec(state[key]);
        if (v !== '' && !(Number(v) > 0)) state.errors[key] = true;
      }
      if (Object.keys(state.errors).length) { paint(); return; }
      const plan = normalizePlan({
        ...draft, hours: hasHours ? [{ from, to }] : [], riskPct: dec(state.risk), dailyLossLimitPct: dec(state.loss), dailyCap: dec(state.cap),
      });
      await ctx.store.plans.put({ ...plan, id: draft.id, name: draft.name || t('plan.title'), active: true, updatedAt: new Date().toISOString() });
      ctx.bus.emit('plan-changed');
      ctx.ui.toast({ text: t('plan.saved') });
      ctx.navigate('#/settings');
    };

    page(root, ctx, {
      bar: detailBar(ctx, { title: t('plan.title'), backHash: '#/settings', backLabel: t('plan.back') }),
      content: [
        el('div', { class: 'group-h' }, t('plan.checklist.h')),
        el('section', { class: 'card vstack' }, itemList, itemField, ctx.ui.button({ label: t('plan.item.save'), kind: 'secondary', block: true, iconName: 'plus', onClick: addItem })),
        el('div', { class: 'group-h' }, t('plan.examples.h')),
        examples,
        el('div', { class: 'group-h' }, t('plan.rules.h')),
        rules,
      ],
      actions: [ctx.ui.button({ label: t('plan.save'), size: 'lg', block: true, onClick: save })],
    });
  };
  paint();
  return () => mount(root);
}
