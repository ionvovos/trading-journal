// Position size from risk (#/sizing, design/mockups sizing, requirements AC-P2.6). Every input is typed by the user: no risk percent,
// no stop distance, no size step and no equity is proposed or prefilled (W5). The worked examples are labelled "example numbers only"
// and are text, not values that fill the fields. Only the value of one price unit (1 for shares and coins) and the rate (1 when the
// price is in the account currency) start at 1, because they describe the instrument, not a choice.
import { el, mount, t, page, detailBar } from '../../review/viewkit.js';
import { positionSize, pipSizeOf } from '../../plan/sizing.js';
import { parseUserDecimal } from '../../core/money.js';
import { mul, div, abs, sub } from '../../core/decimal.js';

const MARKETS = ['stock', 'crypto', 'forex'];
const fieldNames = { equity: 'equity', riskPct: 'riskPct', sizeStep: 'sizeStep', entry: 'entry', stop: 'stop', stopDistance: 'stopDistance', contractSize: 'contractSize', quoteToAccount: 'quoteToAccount', stopPips: 'stopPips', pipValuePerLot: 'pipValuePerLot' };

const dec = (text) => (String(text ?? '').trim() === '' ? '' : parseUserDecimal(text) ?? '');

export async function render(root, ctx) {
  const state = { market: 'stock', equity: '', riskPct: '', entry: '', stop: '', stopPips: '', pipValue: '', pair: 'EUR/USD', contractSize: '1', rate: '1', sizeStep: '' };
  const result = el('div', { class: 'vstack' });

  const input = () => ({
    market: state.market, instrument: state.pair, equity: dec(state.equity), riskPct: dec(state.riskPct), sizeStep: dec(state.sizeStep),
    entry: dec(state.entry), stop: dec(state.stop), stopPips: dec(state.stopPips), pipValuePerLot: dec(state.pipValue), contractSize: dec(state.contractSize), quoteToAccount: dec(state.rate),
  });

  function figures() {
    const i = input();
    const r = positionSize(i);
    const f = ctx.fmt;
    const unit = t(`sizing.unit.${state.market}`);
    if (r.size === null) {
      const names = r.missing.map((m) => t(`sizing.field.${fieldNames[m] ?? m}`)).join(', ');
      return el('section', { class: 'card' }, el('div', { class: 'caption' }, t('sizing.result')), el('p', { class: 'sub' }, t('sizing.result.empty')), r.missing.length ? el('p', { class: 'caption' }, t('sizing.missing', { names })) : null);
    }
    const riskMoney = div(mul(i.equity, i.riskPct), '100');
    const lines = [t('sizing.arith.risk', { equity: f.num(Number(i.equity), 2), pct: f.num(Number(i.riskPct), 2), risk: f.num(Number(riskMoney), 2) })];
    lines.push(state.market === 'forex'
      ? t('sizing.arith.forex', { risk: f.num(Number(riskMoney), 2), pips: f.num(Number(i.stopPips), 1), pv: f.num(Number(i.pipValuePerLot), 2), size: r.size, unit, step: i.sizeStep })
      : t('sizing.arith.unit', { risk: f.num(Number(riskMoney), 2), distance: f.num(Number(abs(sub(i.entry, i.stop))), 4), value: i.contractSize, rate: i.quoteToAccount, size: r.size, unit, step: i.sizeStep }));
    return el('section', { class: 'card vstack' },
      el('div', { class: 'caption' }, t('sizing.result')),
      el('div', { class: 'hero' }, `${r.size} ${unit}`),
      el('div', { class: 'formula' }, ...lines.flatMap((l, n) => [n ? el('br') : null, l])),
      el('p', { class: 'caption' }, t('sizing.riskAt', { size: `${r.size} ${unit}`, risk: f.num(r.riskAmount, 2) })),
      ctx.ui.button({
        label: t('sizing.use', { size: `${r.size} ${unit}` }), size: 'lg', block: true,
        onClick: () => ctx.navigate('#/trade/new', { draft: { market: state.market, size: r.size, ...(state.market === 'forex' ? { instrument: state.pair } : { entryPrice: i.entry, stop: i.stop }) } }),
      }));
  }

  const refresh = () => mount(result, figures());

  function paint() {
    const fx = state.market === 'forex';
    const inp = (key, label, opts = {}) => ctx.ui.field({ label, value: state[key], inputmode: 'decimal', onInput: (v) => { state[key] = v; refresh(); }, ...opts });
    const pip = fx ? pipSizeOf(state.pair) : null;
    const fields = fx
      ? [
        el('div', { class: 'grid2' }, inp('equity', t('sizing.equity')), inp('riskPct', t('sizing.risk'), { unit: '%' })),
        el('div', { class: 'grid2' },
          ctx.ui.field({ label: t('sizing.pair'), value: state.pair, inputmode: 'text', onInput: (v) => { state.pair = v.toUpperCase(); refresh(); }, onChange: () => paint() }),
          inp('stopPips', t('sizing.stopPips'), { unit: 'pips' })),
        el('div', { class: 'grid2' },
          el('div', { class: 'field' }, el('span', { class: 'lbl' }, t('sizing.pipSize')), el('div', { class: 'input static' }, pip ?? '–')),
          inp('pipValue', t('sizing.pipValue'))),
        inp('sizeStep', t('sizing.step'), { help: t('sizing.step.help') }),
      ]
      : [
        el('div', { class: 'grid2' }, inp('equity', t('sizing.equity')), inp('riskPct', t('sizing.risk'), { unit: '%' })),
        el('div', { class: 'grid2' }, inp('entry', t('sizing.entry')), inp('stop', t('sizing.stop'))),
        el('div', { class: 'grid2' }, inp('contractSize', t('sizing.contract')), inp('rate', t('sizing.rate'))),
        inp('sizeStep', t('sizing.step'), { help: t('sizing.step.help') }),
      ];
    const examples = el('section', { class: 'card vstack' },
      el('div', { class: 'card-h' }, el('h3', null, t('sizing.examples.h')), el('span', { class: 'tag info' }, t('sizing.examples.note'))),
      ...['stock', 'crypto', 'forex'].map((m) => el('p', { class: 'sub' }, t(`sizing.example.${m}`))));

    page(root, ctx, {
      bar: detailBar(ctx, { title: t('sizing.title'), backHash: '#/trade/new', backLabel: t('sizing.back') }),
      content: [
        ctx.ui.segmented({ ariaLabel: t('form.market'), value: state.market, options: MARKETS.map((m) => ({ value: m, label: t(`market.${m}`) })), onChange: (v) => { state.market = v; paint(); } }),
        el('section', { class: 'card vstack' }, ...fields, el('p', { class: 'caption' }, t('sizing.help')), fx ? null : el('p', { class: 'caption' }, t('sizing.constants'))),
        result,
        examples,
      ],
    });
    refresh();
  }
  paint();
  return () => mount(root);
}
