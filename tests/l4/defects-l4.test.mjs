// L4 defects found by the browser flows and traced to code. Each test states the requirement and fails today, so it is marked `todo`:
// `npm test` stays green, the run reports them as todo, and each turns into a plain pass when its owner fixes the code and drops `todo`.
// Details and file:line in reports/trading-journal/test-results.md (ais-os).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runImport, answerAnomaly } from '../../src/import/run.js';
import { tradeMoney, initialRisk } from '../../src/stats/index.js';
import { createMemoryStore } from '../../src/storage/memory.js';
import { loadModel } from '../../src/storage/model.js';
import { computeStats } from '../../src/storage/statsModel.js';
import { closeDay } from '../../src/storage/viewkit.js';
import { makeTrade } from '../stats/helpers.mjs';

const NOW = '2026-09-29T10:00:00.000Z';
const deps = { tradeMoney, initialRisk };
const account = { id: 'acc', name: 'IBKR', mode: 'real', baseCurrency: 'USD', startBalance: '10000', toDisplayRate: 1, fileZones: {}, dustThresholds: {}, contractValues: {} };

test('F2 AC-A2.3: a trade whose broker P&L the user kept has a close time, so it reaches the journal, the period statistics and the calendar', { todo: 'src/import/group.js:349 sets closeTime before entryUnknown is known (line 405), so it stays null' }, async () => {
  const text = readFileSync(new URL('../fixtures/import/ibkr-activity.csv', import.meta.url), 'utf8');
  const res = await runImport({ text, fileName: 'a.csv', formatId: 'ibkr-activity', account, fileZone: 'America/New_York', declaredZone: 'Europe/Athens', existing: { trades: [], cash: [] }, now: NOW, importId: 'i1' }, { deps });
  const q = res.importRecord.anomalies.find((a) => a.kind === 'opened_before_file');
  const kept = await answerAnomaly(res.importRecord, res.trades, q.id, { optionId: 'keep_broker_pnl' }, { account, existing: { trades: [], cash: [] }, deps, now: NOW });
  const nvda = kept.trades.find((t) => t.instrument === 'NVDA');
  assert.equal(nvda.entryUnknown, true);
  assert.deepEqual(nvda.holds, []);
  assert.equal(nvda.closeTime, '2026-03-06T15:00:00.000Z', 'the close is the last exit');
  const ctx = { tz: 'Europe/Athens', settings: { get: () => 0 } };
  assert.equal(closeDay(nvda, ctx), '2026-03-06');
});

test('F3 P3 money rules: a journal with a EUR account shown in USD converts every figure, not only the net total', { todo: 'src/storage/statsModel.js:50-53 calls winRate, avgWinLoss, profitFactor, feeTotals, streaks and holdingTime without the statistics context' }, async () => {
  const store = createMemoryStore();
  await store.accounts.put({ id: 'eur', name: 'EUR', mode: 'real', baseCurrency: 'EUR', startBalance: '1000', toDisplayRate: 2, createdAt: NOW });
  await store.accounts.put({ id: 'usd', name: 'USD', mode: 'real', baseCurrency: 'USD', startBalance: '1000', toDisplayRate: 1, createdAt: NOW });
  // +100.00 EUR (= +200.00 USD at the typed rate 2) and -50.00 USD
  await store.trades.put(makeTrade({ id: 'w', accountId: 'eur', entry: '10', exit: '20', size: '10', stop: '9', close: '2026-09-02T16:00:00Z', open: '2026-09-02T15:00:00Z' }));
  await store.trades.put(makeTrade({ id: 'l', accountId: 'usd', entry: '10', exit: '5', size: '10', stop: '9', close: '2026-09-03T16:00:00Z', open: '2026-09-03T15:00:00Z' }));
  const model = await loadModel(store);
  const ctx = { mode: 'real', accountFilter: 'all', displayCurrency: () => 'USD', tz: 'UTC', settings: { get: () => undefined } };
  const s = await computeStats(ctx, model, { period: null });
  assert.equal(s.netMinor, 15000, 'the headline net is converted: 200.00 - 50.00');
  assert.equal(s.avgWinLoss.avgWin, 200, 'average win in USD');
  assert.equal(s.profitFactor.value, 200 / 50, 'profit factor on converted amounts');
});

test('F4 AC-P1.11: the bulk-stops list does not offer a trade with no entry leg (its row divides by an entry price that does not exist)', { todo: 'src/ui/views/bulkStops.js:59 calls D.toNumber(null) for a trade kept with the broker P&L; the screen shows nothing' }, async () => {
  const { stopCandidates } = await import('../../src/ui/views/bulkStops.js');
  const opened = { ...makeTrade({ id: 'x', entry: '1', exit: '2', size: '1' }), entryUnknown: true, broker: { netMinor: 4900 } };
  opened.legs = opened.legs.filter((l) => l.kind === 'exit');
  const list = stopCandidates([opened], 'real', 'all');
  assert.equal(list.some((t) => t.legs.every((l) => l.kind !== 'entry')), false);
});
