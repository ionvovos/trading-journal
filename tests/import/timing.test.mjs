// AC-U2.1: a year of trades per format (2,000 rows, trades without stops, positions opened before the file starts) imports in
// under 10 seconds with visible progress, gives the import report, and its questions can all be answered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runImport, answerAnomaly } from '../../src/import/run.js';
import { KINDS } from '../../src/import/anomalies.js';
import * as stats from '../../src/stats/index.js';
import { generate as genIbkr } from '../gen/ibkr-activity.mjs';
import { generateText as genKraken } from '../gen/kraken-trades.mjs';
import { generate as genMt4 } from '../gen/mt4-statement.mjs';
import { generate as genGeneric } from '../gen/generic-csv.mjs';
import { createBus } from '../helpers/bus.mjs';

const deps = { tradeMoney: stats.tradeMoney, initialRisk: stats.initialRisk };
const account = { id: 'acc', name: 'acc', mode: 'real', baseCurrency: 'USD', fileZones: {}, dustThresholds: {}, contractValues: {} };
const NOW = '2026-09-29T10:00:00.000Z';

const cases = [
  ['ibkr-activity', () => readFileSync(genIbkr({ rows: 2000 }).path, 'utf8'), 'America/New_York'],
  ['kraken-trades', () => genKraken({ rows: 2000 }).text, null],
  ['mt4-statement', () => genMt4({ closedRows: 2000 }).text, 'ny+7'],
  ['generic-csv', () => genGeneric(2000).text, null],
];

for (const [formatId, make, fileZone] of cases) {
  test(`${formatId}: 2,000 rows import in under 10 s with progress and a report, and every question is answerable`, async () => {
    const text = make();
    const bus = createBus();
    const events = [];
    bus.on('import-progress', (e) => events.push(e));
    const t0 = Date.now();
    const r = await runImport({ text, fileName: `${formatId}.csv`, formatId, account, fileZone, declaredZone: 'Europe/Athens', existing: { trades: [], cash: [] }, now: NOW, importId: 'imp1' }, { bus, deps });
    const ms = Date.now() - t0;
    assert.ok(ms < 10000, `${formatId} took ${ms} ms`);
    assert.ok(events.length >= 2 && events.at(-1).done === events.at(-1).total, 'progress reaches its total');
    const rep = r.report;
    assert.ok(rep.rowsInFile >= 1000, `${formatId}: ${rep.rowsInFile} rows`);
    assert.equal(rep.rowsRead + rep.skipped.length, rep.rowsInFile, 'rows read + skipped = rows in file');
    assert.ok(rep.tradesBuilt > 50, `${rep.tradesBuilt} trades`);
    assert.equal(typeof rep.rKnownShare.known, 'number', 'the report carries the share of trades with R known');
    assert.ok(r.importRecord.anomalies.every((a) => KINDS[a.kind]), 'only known question kinds');
    // answer every question the first time with its default or first option; the rebuild stays quick
    let cur = r;
    const t1 = Date.now();
    for (const a of r.importRecord.anomalies) {
      const kind = KINDS[a.kind];
      const option = kind.defaultOption ?? kind.options.find((o) => !['enter_open', 'enter_fee', 'rate', 'value', 'attach', 'keep_broker_pnl'].includes(o)) ?? kind.options[0];
      if (['enter_open', 'enter_fee', 'rate', 'value', 'attach', 'keep_broker_pnl'].includes(option) && !kind.defaultOption) continue;
      cur = await answerAnomaly(cur.importRecord, cur.trades, a.id, { optionId: option }, { account, existing: { trades: [], cash: [] }, deps, now: NOW });
    }
    assert.ok(Date.now() - t1 < 15000, `answering took ${Date.now() - t1} ms`);
    assert.ok(cur.trades.length > 0);
  });
}
