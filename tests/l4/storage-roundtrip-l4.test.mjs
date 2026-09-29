// L4 storage checks (AC-P3.5, AC-P8.3, AC-P8.4) on data that came through the importer, not on the S2 fixtures: an imported journal with an
// unanswered and an answered question, a paper trade and a plan is exported, migrated through a synthetic later schema, imported into an
// empty store, and every statistic, every trade id and every stored anomaly answer must be identical. The answered import must also
// rebuild the same trades from its stored raw text on the new store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../../src/storage/memory.js';
import { buildExport, parseExport, mergeImport } from '../../src/storage/exportImport.js';
import { MIGRATIONS, migrateExport, migrateRows } from '../../src/storage/migrate.js';
import { runImport, answerAnomaly, commitImport } from '../../src/import/run.js';
import {
  closedSet, winRate, avgWinLoss, profitFactor, expectancy, equityCurve, drawdown, buckets, calendar, feeTotals, streaks, holdingTime, tradeMoney, initialRisk,
} from '../../src/stats/index.js';
import { makeTrade } from '../stats/helpers.mjs';

const NOW = '2026-09-29T10:00:00.000Z';
const deps = { tradeMoney, initialRisk };
const acc = (id, mode, ccy = 'USD') => ({ id, name: id, mode, baseCurrency: ccy, startBalance: '5000', toDisplayRate: 1, fileZones: {}, dustThresholds: {}, contractValues: {}, createdAt: NOW });
const GEN = 'time,type,instrument,market,side,size,price,fee,fee_currency,quote_currency,amount,currency,contract_value,id,stop,setup,notes\n'
  + '2026-08-03T14:00:00+00:00,deposit,,,,,,,,,500,USD,,d1,,,\n'
  + '2026-08-03T15:00:00+00:00,trade,AAA,stock,buy,20,10,0.5,USD,USD,,,,a1,9,breakout,\n'
  + '2026-08-03T16:00:00+00:00,trade,AAA,stock,sell,20,11.5,0.5,USD,USD,,,,a2,,,\n'
  + '2026-08-04T15:00:00+00:00,trade,BBB,stock,buy,5,40,,USD,USD,,,,b1,38,,\n'
  + '2026-08-04T16:00:00+00:00,trade,BBB,stock,sell,5,38,1,USD,USD,,,,b2,,,\n'
  + '2026-08-05T15:00:00+00:00,trade,CCC,stock,sell,10,20,0,USD,USD,,,,c1,21,,\n'
  + '2026-08-05T16:00:00+00:00,trade,CCC,stock,buy,10,19,0,USD,USD,,,,c2,,,\n';

async function build() {
  const real = acc('acc-real', 'real');
  const store = createMemoryStore();
  await store.accounts.put(real);
  await store.accounts.put(acc('acc-paper', 'paper', 'EUR'));
  const res = await runImport({ text: GEN, fileName: 'aug.csv', formatId: 'generic-csv', account: real, fileZone: null, declaredZone: 'UTC', existing: { trades: [], cash: [] }, now: NOW, importId: 'imp-aug' }, { deps });
  assert.deepEqual(res.importRecord.anomalies.map((a) => a.kind), ['missing_fee']);
  await commitImport(store, res);
  await store.trades.put({ ...makeTrade({ id: 'paper1', accountId: 'acc-paper', mode: 'paper', entry: '10', exit: '12', size: '5', stop: '9' }), importId: null });
  await store.plans.put({ id: 'plan1', name: 'mine', active: true, items: [{ id: 'i1', text: 'wait for the close' }] });
  await store.setSetting('tz', 'Europe/Athens');
  return { store, real, res };
}

async function figures(store, mode) {
  const trades = await store.trades.getAll();
  const accounts = Object.fromEntries((await store.accounts.getAll()).map((a) => [a.id, { baseCurrency: a.baseCurrency, startBalance: a.startBalance, toDisplayRate: 1, mode: a.mode }]));
  const ctx = { mode, accountIds: 'all', displayCurrency: mode === 'paper' ? 'EUR' : 'USD', tz: 'Europe/Athens', dayCutoffHour: 0, smallSampleMin: 30, accounts, cash: await store.cash.getAll() };
  const set = closedSet(trades, ctx);
  const curve = equityCurve(set, ctx);
  return {
    ids: set.included.map((t) => t.id), held: set.excluded.heldOut.map((t) => t.id),
    nets: set.included.map((t) => tradeMoney(t, ctx).netMinor), win: winRate(set, ctx), avg: avgWinLoss(set, ctx), pf: profitFactor(set, ctx),
    exp: expectancy(set, ctx), curve, dd: drawdown(curve, { cash: ctx.cash, ctx }), fees: feeTotals(set, ctx), st: streaks(set, ctx), hold: holdingTime(set, ctx),
    weekday: buckets(set, 'weekday', ctx), setup: buckets(set, 'setup', ctx), cal: calendar(set, { year: 2026, month: 8 }, ctx),
  };
}

test('export, migrate through a later schema, import into an empty store: identical trades, statistics and answers', async () => {
  const { store, real, res } = await build();
  const before = { real: await figures(store, 'real'), paper: await figures(store, 'paper') };
  assert.equal(before.real.held.length, 1, 'BBB has a blank entry fee and is held out');
  assert.deepEqual(before.real.ids.length, 2);

  const answered = await answerAnomaly(res.importRecord, res.trades, res.importRecord.anomalies[0].id, { optionId: 'enter_fee', value: { 'gen:b1': '0.5' } }, { account: real, existing: { trades: [], cash: [] }, deps, now: NOW });
  await commitImport(store, answered);
  const mid = await figures(store, 'real');
  assert.equal(mid.held.length, 0);
  assert.equal(mid.ids.length, 3);

  const file = JSON.parse(JSON.stringify(await buildExport(store, { now: NOW })));
  assert.equal(file.version, 1);
  // a synthetic schema 2 renames leverage and an unknown field must survive the migration untouched
  const later = [...MIGRATIONS, { to: 2, record: { trades: (r) => { const { leverage, ...rest } = r; return { ...rest, leverageUsed: leverage ?? null }; } } }];
  file.trades[0].futureField = { keep: 'me' };
  const migrated = migrateExport(file, { to: 2, migrations: later });
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.trades[0].futureField, { keep: 'me' });
  assert.ok(migrated.trades.every((t) => 'leverageUsed' in t && !('leverage' in t)));
  assert.equal(migrateRows({ trades: file.trades }, 1, 2, later).trades.length, file.trades.length);

  const parsed = parseExport(JSON.stringify(file));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  const fresh = createMemoryStore();
  const merged = await mergeImport(fresh, parsed.data);
  assert.equal(merged.kept, 0);
  const after = { real: await figures(fresh, 'real'), paper: await figures(fresh, 'paper') };
  assert.deepEqual(after.paper, before.paper);
  assert.deepEqual(after.real, mid, 'every S-figure of the real journal is identical after the round trip');
  assert.deepEqual((await fresh.trades.getAll()).map((t) => t.id).sort(), (await store.trades.getAll()).map((t) => t.id).sort());
  assert.equal(await fresh.getSetting('tz'), 'Europe/Athens');
  assert.equal((await fresh.plans.getAll())[0].items[0].text, 'wait for the close');

  // the stored answer and raw text still rebuild the same trades on the new store
  const rec = (await fresh.imports.getAll())[0];
  assert.equal(rec.anomalies[0].answer.optionId, 'enter_fee');
  const again = await runImport({ text: rec.rawText, fileName: rec.fileName, formatId: rec.formatId, account: real, fileZone: rec.fileZone, declaredZone: rec.declaredZone, existing: { trades: [], cash: [] }, now: NOW, importId: rec.id }, { deps });
  assert.deepEqual(again.trades.map((t) => t.id).sort(), (await fresh.trades.getAll()).filter((t) => t.importId === rec.id).map((t) => t.id).sort());
});

test('AC-P8.4 a newer file is refused with no write; a file with one bad trade is refused whole', async () => {
  const { store } = await build();
  const file = JSON.parse(JSON.stringify(await buildExport(store, { now: NOW })));
  assert.equal(parseExport(JSON.stringify({ ...file, version: 99 })).ok, false);
  const bad = JSON.parse(JSON.stringify(file));
  bad.trades[1].legs[0].price = 12;
  const r = parseExport(JSON.stringify(bad));
  assert.equal(r.ok, false);
  assert.match(r.detail, /trades\[1\]/);
  const empty = createMemoryStore();
  assert.equal((await empty.trades.getAll()).length, 0);
});
