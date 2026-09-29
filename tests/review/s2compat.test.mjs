// The trades S2 builds by hand (src/storage/actions.js buildManualTrade) are read by the review, the plan checks and the sentence
// entry without conversion: a hand-entered week produces the same rows and findings as the fixture week.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManualTrade } from '../../src/storage/actions.js';
import { buildRows } from '../../src/review/rows.js';
import { runReview } from '../../src/review/run.js';
import { parseSentence } from '../../src/sentence/parse.js';
import { toForm, emptyDraft } from '../../src/ui/views/tradeForm.js';
import { rMultiple, tradeMoney } from '../../src/plan/derive.js';

const account = { id: 'acc', name: 'A', mode: 'real', baseCurrency: 'USD', startBalance: '10000' };
const make = (id, day, entry, exit, stop, extra = {}) => buildManualTrade({
  instrument: 'AAPL', market: 'stock', side: 'long', stop,
  legs: [{ kind: 'entry', time: `2026-09-${day}T14:00:00Z`, price: entry, size: '50', fee: '' }, { kind: 'exit', time: `2026-09-${day}T15:00:00Z`, price: exit, size: '50', fee: '1' }], ...extra,
}, { account, declaredZone: 'UTC', now: '2026-09-29T10:00:00Z', id }).trade;

test('a hand-entered trade is a closed trade with money and R that match the arithmetic by hand', () => {
  const t = make('h1', '07', '100', '104', '98');
  assert.ok(t, 'built');
  const money = tradeMoney(t, { digits: 2 });
  assert.equal(money.netMinor, 19900, '(104 - 100) x 50 = 200, fee 1');
  assert.ok(Math.abs(rMultiple(t) - 1.99) < 1e-9, '199 / 100');
});

test('the review reads hand-entered trades: rows, the R-known count and a plan mark', async () => {
  const trades = [make('h1', '07', '100', '104', '98'), make('h2', '08', '100', '98', '98'), make('h3', '09', '100', '98', null)];
  trades[0].plan = { planId: 'P', followed: true, items: {}, auto: {}, confirmedByUser: true };
  trades[1].plan = { planId: 'P', followed: false, items: {}, auto: {}, confirmedByUser: true };
  const { rows } = buildRows({ trades, accounts: [account], plans: [], mode: 'real', period: null, tz: 'UTC' });
  assert.deepEqual(rows.map((r) => [r.id, r.netMinor, r.stopMissing]), [['h1', 19900, false], ['h2', -10100, false], ['h3', -10100, true]]);
  assert.equal(rows[2].r, null);
  const review = await runReview({ trades, cash: [], accounts: [account], plans: [], settings: {}, mode: 'real', period: null, lang: 'en', tz: 'UTC', now: new Date('2026-09-29T10:00:00Z') });
  assert.equal(review.counted, 3);
  assert.equal(review.processOutcome.followed.n, 1);
  assert.equal(review.processOutcome.offPlan.n, 1);
  assert.equal(review.processOutcome.unmarked.n, 1);
});

test('a sentence read by the parser builds a trade through the same builder, with the same numbers as the form', () => {
  const parsed = parseSentence('bought 50 AAPL at 100 stop 98', { lang: 'en' });
  const draft = { ...emptyDraft({ account, now: '2026-09-07T14:00:00Z', tz: 'UTC' }), market: parsed.fields.market, instrument: parsed.fields.instrument, side: parsed.fields.side, size: parsed.fields.size, entryPrice: parsed.fields.entry, stop: parsed.fields.stop, exitPrice: '104', exitTime: '2026-09-07T15:00' };
  const r = buildManualTrade(toForm(draft), { account, declaredZone: 'UTC', now: '2026-09-07T14:00:00Z', id: 's1' });
  assert.ok(r.trade, JSON.stringify(r.errors));
  assert.equal(r.trade.instrument, 'AAPL');
  assert.equal(r.trade.initialStop, '98');
  assert.equal(r.trade.legs[0].size, '50');
});
