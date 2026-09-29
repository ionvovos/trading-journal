// Writes tests/fixtures/review/weeks.json and calm.json: seeded weeks for the review tests (architecture 9). No randomness; every
// trade is listed. Expected findings are in the `expected` blocks, derived by hand from the trades (see the comments above each week)
// and asserted by tests/review/patterns.test.mjs and noAdvice.test.mjs. Run: node tests/fixtures/review/make-weeks.mjs
import { writeFileSync } from 'node:fs';

function mk({ id, acc, mode = 'real', market, instrument, side = 'long', entries, exits = [], stop = null, stopMoves = [], target = null, setup = null, followed = null, items = {}, fee = '1', contractSize = '1', holds = [], excluded = null, planId = 'P1' }) {
  const leg = (kind, [time, price, size], n) => ({
    id: `${id}-${kind[0]}${n}`, kind, time, zone: 'UTC', price, size, fee, feeCurrency: 'USD', feeToAccount: 1, quoteToAccount: 1, broker: null, source: { importId: null, row: null, key: null },
  });
  const legs = [...entries.map((e, i) => leg('entry', e, i + 1)), ...exits.map((e, i) => leg('exit', e, i + 1))];
  return {
    id, accountId: acc, mode, market, instrument, side, contractSize, contractValue: null, quoteCurrency: 'USD', legs,
    initialStop: stop, stopSource: stop === null ? null : 'user', stopMoves, target, funding: 0, broker: null, setup,
    plan: followed === null && !Object.keys(items).length ? { planId: null, followed: null, items: {}, auto: {}, confirmedByUser: false } : { planId, followed, items, auto: {}, confirmedByUser: true },
    notes: '', holds, excluded, dustRemainder: '0', closeDayOverride: null,
    closeTime: exits.length ? exits.at(-1)[0] : null, entry: 'manual',
  };
}
const both = (a, b) => ({ i1: a, i2: b });

// ---------------------------------------------------------------- stocks week (real, New York time, account acc-s, start 10000 USD)
// Plan P1: hours 09:30-11:30, daily cap 3, risk 1%, daily loss limit 2%; items i1 "Stop set before entry", i2 "Wait for the first 15 minutes".
// Times are UTC; New York is UTC-4 (EDT). Net = (exit - entry) x size - 1.00 fee per leg. Hand results (minor units):
//  t1 -10200 R -1.02 | t2 -10200 | t3 -10200 | t4 +14800 R 1.48 | t5 +9700 R 0.776 (avg entry 49.8333, risk 125) | t6 -20200 R -2.02
//  t7 +4800 R null (no stop) | t8 -10200 | t9 -16200 R -1.0125 | t10 -8200
const stocks = [
  mk({ id: 't1', acc: 'acc-s', market: 'stock', instrument: 'AAPL', entries: [['2026-09-07T13:45:00Z', '100', '50']], exits: [['2026-09-07T15:00:00Z', '98', '50']], stop: '98', setup: 'breakout', followed: true, items: both(true, true) }),
  mk({ id: 't2', acc: 'acc-s', market: 'stock', instrument: 'MSFT', entries: [['2026-09-07T15:20:00Z', '200', '25']], exits: [['2026-09-07T15:50:00Z', '196', '25']], stop: '196', setup: 'breakout', followed: true, items: both(true, true) }),
  mk({ id: 't3', acc: 'acc-s', market: 'stock', instrument: 'TSLA', entries: [['2026-09-07T16:05:00Z', '300', '20']], exits: [['2026-09-07T16:30:00Z', '295', '20']], stop: '295', setup: null, followed: false, items: both(true, false) }),
  mk({ id: 't4', acc: 'acc-s', market: 'stock', instrument: 'NVDA', entries: [['2026-09-08T14:00:00Z', '100', '50']], exits: [['2026-09-08T18:00:00Z', '103', '50']], stop: '98', setup: 'pullback', followed: true, items: both(true, true) }),
  mk({ id: 't5', acc: 'acc-s', market: 'stock', instrument: 'AMD', entries: [['2026-09-08T14:30:00Z', '50', '100'], ['2026-09-08T14:50:00Z', '49.5', '50']], exits: [['2026-09-08T17:00:00Z', '50.5', '150']], stop: '49', setup: 'breakout', followed: true, items: both(true, true) }),
  mk({ id: 't6', acc: 'acc-s', market: 'stock', instrument: 'META', entries: [['2026-09-09T13:40:00Z', '100', '50']], exits: [['2026-09-09T16:00:00Z', '96', '50']], stop: '98', stopMoves: [{ time: '2026-09-09T14:30:00Z', price: '96' }], setup: 'breakout', followed: false, items: both(false, true) }),
  mk({ id: 't7', acc: 'acc-s', market: 'stock', instrument: 'GOOG', entries: [['2026-09-09T17:00:00Z', '100', '50']], exits: [['2026-09-09T18:00:00Z', '101', '50']], stop: null, setup: null, followed: false, items: both(false, false) }),
  mk({ id: 't8', acc: 'acc-s', market: 'stock', instrument: 'AAPL', entries: [['2026-09-10T13:35:00Z', '100', '50']], exits: [['2026-09-10T14:00:00Z', '98', '50']], stop: '98', setup: 'breakout', followed: true, items: both(true, true) }),
  mk({ id: 't9', acc: 'acc-s', market: 'stock', instrument: 'AAPL', entries: [['2026-09-10T14:10:00Z', '100', '80']], exits: [['2026-09-10T14:40:00Z', '98', '80']], stop: '98', setup: 'breakout', followed: false, items: both(true, false) }),
  mk({ id: 't10', acc: 'acc-s', market: 'stock', instrument: 'TSLA', entries: [['2026-09-11T13:50:00Z', '300', '20']], exits: [['2026-09-11T15:00:00Z', '296', '20']], stop: '295', setup: 'breakout', followed: true, items: both(true, true) }),
  // left out of the review: an open trade, a held-out trade, a user-excluded trade, and a paper trade (other mode)
  mk({ id: 'o1', acc: 'acc-s', market: 'stock', instrument: 'IBM', entries: [['2026-09-11T16:00:00Z', '150', '10']], stop: '148' }),
  mk({ id: 'h1', acc: 'acc-s', market: 'stock', instrument: 'KO', entries: [['2026-09-08T15:00:00Z', '60', '10']], exits: [['2026-09-08T16:00:00Z', '61', '10']], holds: ['opened_before_file'] }),
  mk({ id: 'e1', acc: 'acc-s', market: 'stock', instrument: 'KO', entries: [['2026-09-09T15:00:00Z', '60', '10']], exits: [['2026-09-09T16:00:00Z', '61', '10']], excluded: { by: 'user' } }),
  mk({ id: 'p1', acc: 'acc-sp', mode: 'paper', market: 'stock', instrument: 'AAPL', entries: [['2026-09-07T13:45:00Z', '100', '50']], exits: [['2026-09-07T15:00:00Z', '98', '50']], stop: '98' }),
];
const stocksExpected = {
  counted: 10,
  left: { open: 1, heldOut: 1, userExcluded: 1 },
  findings: {
    plan_not_followed: { n: 4, tradeIds: ['t3', 't6', 't7', 't9'], facts: { off: 4, marked: 10, quote: { text: 'Wait for the first 15 minutes', kept: 7, total: 10 } } },
    entry_after_loss: { n: 2, tradeIds: ['t3', 't9'], facts: { a: 1, b: 1 } },
    busy_days: { n: 3, tradeIds: ['t1', 't2', 't3'], facts: { days: 1, median: 2 } },
    no_setup_share: { n: 2, tradeIds: ['t3', 't7'] },
    added_while_losing: { n: 1, tradeIds: ['t5'] },
    stop_moved_or_missing: { n: 2, tradeIds: ['t6', 't7'], facts: { moved: 1, missing: 1, rKnownMoved: 1 } },
    outside_set_hours: { n: 2, tradeIds: ['t3', 't7'] },
    after_daily_loss_limit: { n: 2, tradeIds: ['t3', 't7'] }, // t3: Mon closed loss 204 vs 2% of 9,796 = 195.92; t7: Wed t6 closed -202 vs 2% of 9,737 = 194.74
  },
  absent: ['days_over_cap', 'size_rising', 'holding_and_target'],
  processOutcome: { followed: { n: 6 }, offPlan: { n: 4 }, unmarked: { n: 0 } },
};

// ---------------------------------------------------------------- crypto week (real, Athens time UTC+3, account acc-c, start 5000 USD)
// Plan P2: setups trend/range, daily cap 2, risk 2%, targets on some trades; item i1 "Write the reason before entering".
// c1 -5200 | c2 -5200 | c3 -5200 | c4 +4800 R 0.96 | c5 +4800 R 0.96 | c6 -10200 | c7 -15200 R -1.0133 | c8 -20200
// risk % of equity at entry: 1.000 1.011 1.021 1.032 1.022 2.024 3.100 4.268; halves (first 4, last 4) median 1.016 and 2.562.
const crypto = [
  mk({ id: 'c1', acc: 'acc-c', market: 'crypto', instrument: 'BTC/USD', entries: [['2026-09-14T06:00:00Z', '60000', '0.05']], exits: [['2026-09-14T08:00:00Z', '59000', '0.05']], stop: '59000', target: '62000', setup: 'trend', followed: true, items: { i1: true }, planId: 'P2' }),
  mk({ id: 'c2', acc: 'acc-c', market: 'crypto', instrument: 'ETH/USD', entries: [['2026-09-14T08:10:00Z', '2400', '1']], exits: [['2026-09-14T09:00:00Z', '2350', '1']], stop: '2350', target: '2500', setup: 'trend', followed: true, items: { i1: true }, planId: 'P2' }),
  mk({ id: 'c3', acc: 'acc-c', market: 'crypto', instrument: 'SOL/USD', entries: [['2026-09-14T09:10:00Z', '100', '10']], exits: [['2026-09-14T09:40:00Z', '95', '10']], stop: '95', target: '110', setup: 'range', followed: false, items: { i1: false }, planId: 'P2' }),
  mk({ id: 'c4', acc: 'acc-c', market: 'crypto', instrument: 'BTC/USD', entries: [['2026-09-15T06:00:00Z', '60000', '0.05']], exits: [['2026-09-15T10:00:00Z', '61000', '0.05']], stop: '59000', target: '62000', setup: 'trend', followed: true, items: { i1: true }, planId: 'P2' }),
  mk({ id: 'c5', acc: 'acc-c', market: 'crypto', instrument: 'ETH/USD', entries: [['2026-09-16T06:00:00Z', '2400', '1']], exits: [['2026-09-16T08:00:00Z', '2450', '1']], stop: '2350', target: '2500', setup: 'trend', followed: true, items: { i1: true }, planId: 'P2' }),
  mk({ id: 'c6', acc: 'acc-c', market: 'crypto', instrument: 'BTC/USD', entries: [['2026-09-17T06:00:00Z', '60000', '0.1']], exits: [['2026-09-17T07:00:00Z', '59000', '0.1']], stop: '59000', setup: 'trend', followed: false, items: { i1: false }, planId: 'P2' }),
  mk({ id: 'c7', acc: 'acc-c', market: 'crypto', instrument: 'BTC/USD', entries: [['2026-09-17T07:10:00Z', '60000', '0.15']], exits: [['2026-09-17T07:50:00Z', '59000', '0.15']], stop: '59000', stopMoves: [{ time: '2026-09-17T07:30:00Z', price: '58500' }], setup: 'trend', followed: false, items: { i1: false }, planId: 'P2' }),
  mk({ id: 'c8', acc: 'acc-c', market: 'crypto', instrument: 'BTC/USD', entries: [['2026-09-18T06:00:00Z', '60000', '0.2']], exits: [['2026-09-18T09:00:00Z', '59000', '0.2']], stop: '59000', setup: 'trend', followed: false, items: { i1: false }, planId: 'P2' }),
];
const cryptoExpected = {
  counted: 8,
  left: { open: 0, heldOut: 0, userExcluded: 0 },
  findings: {
    plan_not_followed: { n: 4, tradeIds: ['c3', 'c6', 'c7', 'c8'], facts: { off: 4, marked: 8, quote: { text: 'Write the reason before entering', kept: 4, total: 8 } } },
    entry_after_loss: { n: 3, tradeIds: ['c3', 'c7', 'c8'], facts: { a: 1, b: 2 } },
    busy_days: { n: 5, tradeIds: ['c1', 'c2', 'c3', 'c6', 'c7'], facts: { days: 2, median: 1 } },
    days_over_cap: { n: 3, tradeIds: ['c1', 'c2', 'c3'], facts: { days: 1, cap: 2 } },
    size_rising: { n: 4, tradeIds: ['c5', 'c6', 'c7', 'c8'], basis: 'r' },
    stop_moved_or_missing: { n: 1, tradeIds: ['c7'], facts: { moved: 1, missing: 0, rKnownMoved: 1 } },
    holding_and_target: { n: 2, tradeIds: ['c4', 'c5'], facts: { targetR: 2, nTarget: 2 } },
  },
  absent: ['no_setup_share', 'added_while_losing', 'outside_set_hours', 'after_daily_loss_limit'],
};

// ---------------------------------------------------------------- forex week (real, Athens time UTC+3, account acc-f, start 10000 USD)
// EUR/USD and GBP/USD, contract size 100000, 0.2 lot, quote USD. Loss to a 50-pip stop = -100.00 - 1.40 fee = -10140 (R -1.014).
// f4 short win +98.60 (R 0.986); f5 stop moved then filled 100 pips away: -201.40 (R -2.014); f7 +38.60 (R 0.386).
// Plan P3: hours 09:00-12:00 (end exclusive), daily loss limit 3%; no setups, cap or risk rule. Every trade has no setup.
const fx = (id, instrument, side, day, hh1, mm1, hh2, mm2, entry, exit, stop, followed, extra = {}) => mk({
  id, acc: 'acc-f', market: 'forex', instrument, side, contractSize: '100000', fee: '0.70',
  entries: [[`2026-09-${day}T${hh1}:${mm1}:00Z`, entry, '0.2']], exits: [[`2026-09-${day}T${hh2}:${mm2}:00Z`, exit, '0.2']], stop, followed, items: { i1: followed }, planId: 'P3', ...extra,
});
const forex = [
  fx('f1', 'EUR/USD', 'long', '21', '06', '30', '07', '00', '1.0850', '1.0800', '1.0800', true),
  fx('f2', 'GBP/USD', 'long', '21', '07', '20', '08', '00', '1.2700', '1.2650', '1.2650', true),
  fx('f3', 'EUR/USD', 'long', '21', '12', '00', '13', '30', '1.0840', '1.0790', '1.0790', false),
  fx('f4', 'EUR/USD', 'short', '22', '06', '10', '06', '50', '1.0900', '1.0850', '1.0950', true),
  fx('f5', 'GBP/USD', 'long', '22', '07', '00', '07', '40', '1.2700', '1.2600', '1.2650', false, { stopMoves: [{ time: '2026-09-22T07:20:00Z', price: '1.2600' }] }),
  fx('f6', 'GBP/USD', 'long', '22', '07', '50', '10', '30', '1.2650', '1.2600', '1.2600', true),
  fx('f7', 'EUR/USD', 'long', '23', '06', '30', '07', '00', '1.0850', '1.0870', '1.0800', true),
  fx('f8', 'EUR/USD', 'long', '23', '09', '00', '12', '00', '1.0850', '1.0800', '1.0800', false),
];
const forexExpected = {
  counted: 8,
  left: { open: 0, heldOut: 0, userExcluded: 0 },
  findings: {
    plan_not_followed: { n: 3, tradeIds: ['f3', 'f5', 'f8'], facts: { off: 3, marked: 8 } },
    no_setup_share: { n: 8 },
    stop_moved_or_missing: { n: 1, tradeIds: ['f5'], facts: { moved: 1, missing: 0 } },
    holding_and_target: { n: 8, facts: { nWinners: 2, nLosers: 6 } },
    outside_set_hours: { n: 2, tradeIds: ['f3', 'f8'] },
  },
  absent: ['busy_days', 'days_over_cap', 'size_rising', 'added_while_losing', 'after_daily_loss_limit', 'entry_after_loss'],
};

const plans = {
  P1: { id: 'P1', name: 'Stocks plan', active: true, items: [{ id: 'i1', text: 'Stop set before entry' }, { id: 'i2', text: 'Wait for the first 15 minutes' }], setups: ['breakout', 'pullback'], hours: [{ from: '09:30', to: '11:30' }], dailyCap: 3, riskPct: '1', dailyLossLimitPct: '2' },
  P2: { id: 'P2', name: 'Crypto plan', active: true, items: [{ id: 'i1', text: 'Write the reason before entering' }], setups: ['trend', 'range'], hours: [], dailyCap: 2, riskPct: '2', dailyLossLimitPct: null },
  P3: { id: 'P3', name: 'Forex plan', active: true, items: [{ id: 'i1', text: 'Trade only the sessions I chose' }], setups: [], hours: [{ from: '09:00', to: '12:00' }], dailyCap: null, riskPct: null, dailyLossLimitPct: '3' },
};

const weeks = {
  about: 'Seeded losing weeks, one per market (architecture 9). Generated by make-weeks.mjs; expected findings are derived by hand in the comments of that file.',
  stocks: { tz: 'America/New_York', mode: 'real', period: { from: '2026-09-07', to: '2026-09-11' }, accounts: [{ id: 'acc-s', baseCurrency: 'USD', startBalance: '10000' }], plan: plans.P1, trades: stocks, expected: stocksExpected },
  crypto: { tz: 'Europe/Athens', mode: 'real', period: { from: '2026-09-14', to: '2026-09-18' }, accounts: [{ id: 'acc-c', baseCurrency: 'USD', startBalance: '5000' }], plan: plans.P2, trades: crypto, expected: cryptoExpected },
  forex: { tz: 'Europe/Athens', mode: 'real', period: { from: '2026-09-21', to: '2026-09-23' }, accounts: [{ id: 'acc-f', baseCurrency: 'USD', startBalance: '10000' }], plan: plans.P3, trades: forex, expected: forexExpected },
};

// ---------------------------------------------------------------- calm week: plan followed, no pattern (AC-P5.3)
// Six trades on six days, one per day, 100 x 50 shares, stop 98. Wins exit 104 after 2 h (+198.00), losses exit 98 after 1 h (-102.00).
const calmTrade = (id, day, win, followed = true) => mk({
  id, acc: 'acc-k', market: 'stock', instrument: 'AAPL', setup: 'breakout', stop: '98', followed, items: { i1: true },
  entries: [[`2026-09-${day}T10:00:00Z`, '100', '50']], exits: [[`2026-09-${day}T${win ? '12' : '11'}:00:00Z`, win ? '104' : '98', '50']],
});
const calm = {
  about: 'A calm week: every trade follows the plan, no pattern of the review fires (AC-P5.3).',
  tz: 'UTC', mode: 'real', period: { from: '2026-09-07', to: '2026-09-14' },
  accounts: [{ id: 'acc-k', baseCurrency: 'USD', startBalance: '10000' }],
  plan: { id: 'P1', name: 'Calm plan', active: true, items: [{ id: 'i1', text: 'Stop set before entry' }], setups: ['breakout'], hours: [{ from: '09:00', to: '17:00' }], dailyCap: 3, riskPct: null, dailyLossLimitPct: null },
  trades: [calmTrade('k1', '07', true), calmTrade('k2', '08', false), calmTrade('k3', '09', true), calmTrade('k4', '10', false), calmTrade('k5', '11', true), calmTrade('k6', '14', false)],
  expected: { counted: 6, findings: {} },
};

const here = new URL('.', import.meta.url);
writeFileSync(new URL('weeks.json', here), `${JSON.stringify(weeks, null, 1)}\n`);
writeFileSync(new URL('calm.json', here), `${JSON.stringify(calm, null, 1)}\n`);
console.log('wrote weeks.json and calm.json');
