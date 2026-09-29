// Anomaly kinds of the import check (architecture section 2.3). Pure data.
// `holds`: an unanswered anomaly of this kind holds every affected trade out of the statistics.
// `options`: the answer ids in the order the question shows them; `defaultOption` is what a tap on
// "same for all" without a choice would select, or null when the user must choose.

export const KINDS = {
  flip: { holds: true, options: ['split', 'exclude'], defaultOption: 'split' },
  dust: { holds: true, options: ['close_with_remainder', 'keep_open'], defaultOption: 'close_with_remainder' },
  opened_before_file: { holds: true, options: ['enter_open', 'keep_broker_pnl', 'exclude'], defaultOption: null },
  tz_edge: { holds: true, options: ['month_before', 'month_after'], defaultOption: null },
  missing_fee: { holds: true, options: ['fee_zero', 'enter_fee', 'exclude'], defaultOption: null },
  rate_missing: { holds: true, options: ['rate'], defaultOption: null },
  contract_size_missing: { holds: true, options: ['value'], defaultOption: null },
  broker_mismatch: { holds: true, options: ['use_broker', 'exclude'], defaultOption: 'use_broker' },
  near_duplicate: { holds: true, options: ['merge', 'keep_both'], defaultOption: null },
  funding_unmatched: { holds: false, options: ['attach', 'ignore'], defaultOption: null },
  unreadable_rows: { holds: false, options: ['continue', 'cancel_import'], defaultOption: null },
};

export const KIND_ORDER = Object.keys(KINDS);
export const holdsTrades = (kind) => !!KINDS[kind]?.holds;

// Options that need a typed value, for the question sheet.
export const NEEDS_VALUE = {
  opened_before_file: { enter_open: 'price_date' },
  missing_fee: { enter_fee: 'fee_per_fill' },
  rate_missing: { rate: 'rate_per_currency' },
  contract_size_missing: { value: 'value_per_symbol' },
  funding_unmatched: { attach: 'trade_id' },
};

export const anomalyId = (importId, kind) => `${importId}:${kind}`;

// Answers of an import record's anomalies as group.js takes them:
// { answers: { [kind]: { optionId, value } }, overrides: { [kind]: { [tradeId]: { optionId, value } } } }
export function answersOf(anomalies) {
  const answers = {};
  const overrides = {};
  for (const a of anomalies || []) {
    if (a.answer) answers[a.kind] = { optionId: a.answer.optionId, value: a.answer.value };
    if (a.overrides && Object.keys(a.overrides).length) overrides[a.kind] = a.overrides;
  }
  return { answers, overrides };
}

// The answer that applies to one trade: its override first, then the answer for all.
export function answerFor(answers, overrides, kind, tradeId) {
  return overrides?.[kind]?.[tradeId] ?? answers?.[kind] ?? null;
}
