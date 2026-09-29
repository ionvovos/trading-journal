import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, reportJson, reportHtml } from '../../src/import/reportHtml.js';
import { createFormat } from '../../src/i18n/format.js';

const fmt = createFormat({ lang: 'en', tz: 'UTC' });
const t = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);
const record = {
  id: 'imp1', fileName: '<script>alert(1)</script>.csv', formatId: 'ibkr-activity', createdAt: '2026-09-29T10:00:00Z', fileZone: 'America/New_York',
  report: { rowsInFile: 11, rowsRead: 9, tradesBuilt: 4, matched: 0, skipped: [{ row: 5, reasonKey: 'import.skip.number' }], rKnownShare: { known: 0, of: 3 }, period: { from: '2026-03-02', to: '2026-03-09', zone: 'America/New_York' } },
  anomalies: [{ id: 'imp1:opened_before_file', kind: 'opened_before_file', tradeIds: ['a'], answer: { optionId: 'keep_broker_pnl', at: 'x' }, overrides: {} }, { id: 'imp1:missing_fee', kind: 'missing_fee', tradeIds: ['b'], answer: null, overrides: { b: {} } }],
};

test('esc escapes markup characters', () => {
  assert.equal(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(5), '5');
});

test('reportJson carries the report, the answers and the broker check, and no raw file text', () => {
  const j = reportJson({ ...record, rawText: 'SECRET,ROWS' }, { from: 'a', to: 'b', zone: 'UTC', state: 'reconciled', broker: { valueMinor: 100 }, oursMinor: 100, differenceMinor: 0, explanations: [] });
  assert.equal(j.format, 'trading-journal-import-report');
  assert.equal(j.anomalies[0].answer.optionId, 'keep_broker_pnl');
  assert.equal(j.anomalies[1].answer, null);
  assert.equal(j.anomalies[1].overrides, 1);
  assert.equal(j.reconciliation.differenceMinor, 0);
  assert.ok(!JSON.stringify(j).includes('SECRET'));
  assert.equal(reportJson(record).reconciliation, null);
});

test('reportHtml is self-contained, escapes user text and lists what the report holds', () => {
  const html = reportHtml(record, { t, fmt, accountName: 'IBKR <b>', currency: 'USD', reconciliation: { from: '2026-03-02', to: '2026-03-09', zone: 'America/New_York', state: 'difference', broker: { valueMinor: 23400 }, oursMinor: 18500, differenceMinor: 4900 } });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('<script>alert(1)'), 'file name is escaped');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;.csv'));
  assert.ok(html.includes('IBKR &lt;b&gt;'));
  assert.ok(html.includes('0 / 3'));
  assert.ok(html.includes('import.skip.number'));
  assert.ok(html.includes('import.opt.opened_before_file.keep_broker_pnl'));
  assert.ok(html.includes('import.report.unanswered'));
  assert.ok(html.includes('+49.00'), 'difference formatted');
  assert.ok(!/https?:\/\//.test(html), 'no external reference');
  assert.ok(!/<link|<script/.test(html));
});
