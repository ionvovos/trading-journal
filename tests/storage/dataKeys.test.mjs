// Every catalogue key the data views use exists in the data or shell catalogue in both languages, and every dynamic family is complete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dataEn from '../../src/i18n/en/data.js';
import dataEl from '../../src/i18n/el/data.js';
import shellEn from '../../src/i18n/en/shell.js';
import shellEl from '../../src/i18n/el/shell.js';
import { KINDS } from '../../src/import/anomalies.js';

const en = { ...shellEn, ...dataEn };
const el = { ...shellEl, ...dataEl };
const root = fileURLToPath(new URL('../../', import.meta.url));
const FILES = ['accounts', 'cash', 'dataSettings', 'tradeForm', 'journal', 'trade', 'bulkStops', 'import', 'reconcile', 'stats', 'calendar', 'drill'].map((n) => `src/ui/views/${n}.js`)
  .concat(['src/storage/viewkit.js', 'src/import/reportHtml.js', 'src/storage/summary.js']).filter((f) => existsSync(root + f));

test('static keys used by t() exist in en and el', () => {
  const missing = [];
  for (const f of FILES) {
    const src = readFileSync(root + f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
      if (!(m[1] in en)) missing.push(`en ${f}: ${m[1]}`);
      if (!(m[1] in el)) missing.push(`el ${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every anomaly kind has a name, a question and a label for each option', () => {
  const missing = [];
  for (const [kind, def] of Object.entries(KINDS)) {
    for (const key of [`import.kind.${kind}`, `import.q.${kind}`, `journal.hold.${kind}`, ...def.options.map((o) => `import.opt.${kind}.${o}`)]) {
      if (kind === 'unreadable_rows' || kind === 'funding_unmatched') { if (key.startsWith('journal.hold.')) continue; }
      if (!(key in en) || !(key in el)) missing.push(key);
    }
  }
  assert.deepEqual(missing, []);
});

test('form, stop and reconcile families are complete', () => {
  const need = [
    ...['required', 'number', 'positive', 'time', 'oversize_exit', 'rate_required', 'duplicate', 'currency', 'unknown_trade'].map((c) => `form.error.${c}`),
    ...['no_stop', 'stop_at_entry', 'stop_profit_side'].map((c) => `form.stop.${c}`),
    ...['opened_before_file', 'broker_mismatch', 'dust', 'flip', 'duplicate', 'tz_edge', 'partial_exit_open', 'cash_items', 'fee_in_asset', 'transfer'].map((c) => `reconcile.cause.${c}`),
    ...['missing_fee', 'rate_missing'].map((c) => `reconcile.needs.${c}`),
    ...['ibkr-activity', 'mt4-statement', 'kraken-trades', 'generic-csv'].map((c) => `reconcile.hint.${c}`),
    ...['win', 'loss', 'even'].map((c) => `journal.result.${c}`), ...['followed', 'off', 'unmarked'].map((c) => `journal.plan.${c}`),
    ...['number', 'date', 'assetClass', 'cancelled', 'timeOffset', 'pair'].map((c) => `import.skip.${c}`),
    ...['notJson', 'wrongFormat', 'newerVersion', 'badRow'].map((c) => `export.error.${c}`),
    ...['unknownFormat', 'formatNotDetected', 'needZone', 'unknownAnomaly', 'unknownOption', 'generic'].map((c) => `import.error.${c}`),
    'reconcile.balance.confirmNoOpenPositions', 'reconcile.paper',
  ];
  assert.deepEqual(need.filter((k) => !(k in en) || !(k in el)), []);
});

test('the Greek data catalogue is Greek, except stated Latin-term strings', () => {
  const latinOk = new Set(['accounts.name.ph', 'journal.pips', 'form.stop', 'form.setup', 'journal.f.setup', 'trade.setup', 'trade.stop', 'stops.ph', 'trade.pips', 'unit.lots', 'form.unit.lots', 'stops.in', 'stops.out', 'accounts.kind.real', 'accounts.kind.paper', 'import.report.rKnownOf', 'trade.stopPips', 'stats.pips', 'drill.name.pips', 'drill.name.r']);
  const bad = Object.entries(dataEl).filter(([k, v]) => !/[Ͱ-Ͽ]/.test(v) && !latinOk.has(k));
  assert.deepEqual(bad.map(([k]) => k), []);
});
