import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { format } from '../../src/import/formats/mt4-statement.js';
import { generate } from '../gen/mt4-statement.mjs';
import { add } from '../../src/core/decimal.js';

const html = readFileSync(new URL('../fixtures/import/mt4-statement.htm', import.meta.url), 'utf8');
const expected = JSON.parse(readFileSync(new URL('../fixtures/import/mt4-statement.expected.json', import.meta.url), 'utf8'));
const FILE_ZONE = 'ny+7'; // the answer the fixture's `about` states
const result = format.parse(html, { fileZone: FILE_ZONE });

const sameInstant = (actual, exp) => assert.equal(Date.parse(actual), Date.parse(exp), `${actual} vs ${exp}`);
const num = (actual, exp) => assert.equal(Number(actual), exp, `${actual} vs ${exp}`);
const minor = (s) => Math.round(Number(s) * 100);
const fill = (key) => result.fills.find((f) => f.key === key);
const tradeOf = (instrument) => expected.trades.find((t) => t.instrument === instrument);

test('format metadata', () => {
  assert.equal(format.id, expected.format);
  assert.equal(format.market, 'forex');
  assert.equal(format.labelKey, 'import.format.mt4');
  assert.equal(format.statesZone, expected.statesZone);
});

test('detect', () => {
  assert.ok(format.detect(html) >= 0.9);
  assert.ok(format.detect('<html><body>Closed Transactions:</body></html>') < 0.6);
  assert.equal(format.detect('txid,ordertxid,pair,time,type\n'), 0);
  assert.equal(format.detect(''), 0);
});

test('account currency', () => {
  assert.equal(result.accountCurrency, expected.accountCurrency);
  for (const f of result.fills) assert.equal(f.feeCurrency, expected.accountCurrency);
});

test('rows in file and 8 fills from 4 closed rows plus one open', () => {
  assert.equal(result.rowsInFile, expected.rowsInFile);
  assert.equal(result.fills.length, expected.fills);
  assert.equal(result.fills.length / 2, expected.rowsToFills);
  assert.equal(result.openAtEnd.length, expected.openAtEnd.length);
  const keys = result.fills.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const t of ['1002', '1003', '1004', '1005']) {
    assert.ok(keys.includes(`mt4:${t}:open`) && keys.includes(`mt4:${t}:close`));
  }
});

test('open trade at end of file', () => {
  const [exp] = expected.openAtEnd;
  const [f] = result.openAtEnd;
  assert.equal(f.key, `mt4:${exp.ticket}:open`);
  assert.equal(f.instrument, exp.instrument);
  assert.equal(f.side, 'buy');
  num(f.size, exp.size);
  num(f.price, exp.price);
  sameInstant(f.time, exp.timeUtc);
});

test('UTC times with ny+7 across the 8 Mar 2026 US clock change', () => {
  for (const [inst, ticket] of [['EUR/USD', '1002'], ['USD/JPY', '1003']]) {
    const t = tradeOf(inst);
    sameInstant(fill(`mt4:${ticket}:open`).time, t.entryUtc);
    sameInstant(fill(`mt4:${ticket}:close`).time, t.exitUtc);
  }
  const gbp = tradeOf('GBP/USD');
  sameInstant(fill('mt4:1004:open').time, gbp.entryUtc);
  sameInstant(fill('mt4:1005:open').time, gbp.entryUtc);
  sameInstant(fill('mt4:1004:close').time, gbp.exits[0].utc);
  sameInstant(fill('mt4:1005:close').time, gbp.exits[1].utc);
  // before the change the server clock is UTC+2, after it UTC+3
  sameInstant(result.cash[0].time, expected.cash[0].time);
});

test('sides, prices, sizes and contract size', () => {
  const eur = tradeOf('EUR/USD');
  const o = fill('mt4:1002:open');
  const c = fill('mt4:1002:close');
  assert.equal(o.side, 'buy');
  assert.equal(c.side, 'sell');
  num(o.price, eur.avgEntry);
  num(c.price, eur.avgExit);
  num(o.size, eur.size);
  num(c.size, eur.size);
  num(o.contractSize, eur.contractSize);
  assert.equal(o.quoteCurrency, 'USD');
  assert.equal(o.market, 'forex');

  const jpy = tradeOf('USD/JPY');
  assert.equal(fill('mt4:1003:open').side, 'sell');
  assert.equal(fill('mt4:1003:close').side, 'buy');
  assert.equal(fill('mt4:1003:open').quoteCurrency, 'JPY');
  num(fill('mt4:1003:open').price, jpy.avgEntry);
  num(fill('mt4:1003:close').price, jpy.avgExit);
  num(fill('mt4:1003:open').contractSize, jpy.contractSize);

  const gbp = tradeOf('GBP/USD');
  num(fill('mt4:1004:close').price, gbp.exits[0].price);
  num(fill('mt4:1005:close').price, gbp.exits[1].price);
  num(fill('mt4:1004:close').size, gbp.exits[0].size);
  num(fill('mt4:1005:close').size, gbp.exits[1].size);
  num(add(fill('mt4:1004:open').size, fill('mt4:1005:open').size), gbp.size);
});

test('prices, sizes and money are decimal strings', () => {
  for (const f of [...result.fills, ...result.openAtEnd]) {
    for (const k of ['size', 'price', 'contractSize']) assert.equal(typeof f[k], 'string', `${f.key} ${k}`);
    if (f.fee !== null) assert.equal(typeof f.fee, 'string');
  }
  assert.equal(fill('mt4:1002:open').price, '1.085');
});

test('close-fill fees, broker figures and implied quoteToAccount', () => {
  const byTicket = { 'EUR/USD': ['1002'], 'USD/JPY': ['1003'], 'GBP/USD': ['1004', '1005'] };
  for (const [inst, tickets] of Object.entries(byTicket)) {
    const t = tradeOf(inst);
    const closes = tickets.map((n) => fill(`mt4:${n}:close`));
    const opens = tickets.map((n) => fill(`mt4:${n}:open`));
    for (const o of opens) {
      assert.equal(o.fee, null);
      assert.equal(o.broker, null);
    }
    assert.equal(closes.reduce((s, c) => s + minor(c.fee), 0), t.feesMinor, inst);
    assert.equal(closes.reduce((s, c) => s + minor(c.broker.swap), 0), t.fundingMinor, inst);
    const net = closes.reduce((s, c) => s + minor(c.broker.profit) + minor(c.broker.commission) + minor(c.broker.taxes) + minor(c.broker.swap), 0);
    assert.equal(net, t.broker.netMinor, inst);
    assert.equal(closes.reduce((s, c) => s + minor(c.broker.profit), 0), t.grossMinor, inst);
    for (const c of closes) assert.equal(c.feeCurrency, 'USD');
    if (t.quoteToAccount !== undefined) {
      for (const f of [...opens, ...closes]) {
        assert.equal(typeof f.quoteToAccount, 'number');
        assert.ok(Math.abs(f.quoteToAccount - t.quoteToAccount) < 1e-9, `${inst} ${f.quoteToAccount}`);
      }
    }
  }
  const jpyClose = fill('mt4:1003:close');
  assert.equal(jpyClose.fee, '0.7');
  assert.deepEqual(jpyClose.broker, { commission: '-0.7', taxes: '0', swap: '-0.5', profit: '-33.22' });
  const sum = expected.trades.reduce((s, t) => s + t.netMinor, 0);
  assert.equal(sum, expected.closedIncludedNetMinor);
});

test('quoteToAccount is null when open equals close', () => {
  const same = html.replace('<td>1.09000</td>', '<td>1.08500</td>');
  const r = format.parse(same, { fileZone: FILE_ZONE });
  const f = r.fills.filter((x) => x.key.startsWith('mt4:1002:'));
  assert.equal(f.length, 2);
  for (const x of f) assert.equal(x.quoteToAccount, null);
});

test('stops with stopSource, none for GBP/USD', () => {
  for (const [inst, ticket] of [['EUR/USD', '1002'], ['USD/JPY', '1003']]) {
    const t = tradeOf(inst);
    for (const side of ['open', 'close']) {
      const f = fill(`mt4:${ticket}:${side}`);
      assert.equal(f.stop, t.initialStop);
      assert.equal(f.stopSource, t.stopSource);
    }
  }
  assert.equal(fill('mt4:1002:open').target, '1.095');
  assert.equal(fill('mt4:1003:open').target, '149');
  for (const k of ['mt4:1004:open', 'mt4:1004:close', 'mt4:1005:open', 'mt4:1005:close']) {
    assert.equal(fill(k).stop, tradeOf('GBP/USD').initialStop);
    assert.equal(fill(k).stopSource, null);
    assert.equal(fill(k).target, null);
  }
  const known = expected.trades.filter((t) => t.initialStop !== null).length;
  assert.deepEqual({ known, of: expected.trades.length }, expected.rKnownShare);
});

test('the GBP/USD chain has positionId 1004 on all four fills', () => {
  const gbp = result.fills.filter((f) => f.instrument === 'GBP/USD');
  assert.equal(gbp.length, tradeOf('GBP/USD').legs);
  for (const f of gbp) assert.equal(f.positionId, tradeOf('GBP/USD').positionId);
  for (const f of result.fills.filter((x) => x.instrument !== 'GBP/USD')) assert.equal(f.positionId, null);
  assert.equal(result.openAtEnd[0].positionId, null);
});

test('cancelled row skipped', () => {
  assert.equal(result.skipped.length, expected.skipped.length);
  const [exp] = expected.skipped;
  const [s] = result.skipped;
  assert.equal(s.reasonKey, exp.reasonKey);
  assert.ok(s.raw.startsWith(exp.ticket));
  assert.equal(typeof s.row, 'number');
  assert.ok(!result.fills.some((f) => f.key.startsWith(`mt4:${exp.ticket}:`)));
  // unreadable_rows is raised when skipped.length > 0 (architecture 2.3)
  const unreadable = expected.anomalies.find((a) => a.kind === 'unreadable_rows');
  assert.equal(result.skipped.length, unreadable.rows);
});

test('deposit', () => {
  assert.equal(result.cash.length, expected.cash.length);
  const [exp] = expected.cash;
  const [c] = result.cash;
  assert.equal(c.kind, exp.kind);
  assert.equal(c.amount, exp.amount);
  assert.equal(c.currency, exp.currency);
  sameInstant(c.time, exp.time);
  assert.equal(c.key, 'mt4:1001:cash');
});

test('withdrawal and credit rows', () => {
  const extra = html.replace(
    '<tr bgcolor=#E0E0E0 align=right><td>1002</td>',
    '<tr><td>1101</td><td>2026.03.03 08:00:00</td><td>balance</td><td colspan=10>Withdrawal</td><td>-250.00</td></tr>'
      + '<tr><td>1102</td><td>2026.03.03 09:00:00</td><td>credit</td><td colspan=10>Bonus</td><td>50.00</td></tr>'
      + '<tr bgcolor=#E0E0E0 align=right><td>1002</td>',
  );
  const r = format.parse(extra, { fileZone: FILE_ZONE });
  const w = r.cash.find((c) => c.key === 'mt4:1101:cash');
  const o = r.cash.find((c) => c.key === 'mt4:1102:cash');
  assert.equal(w.kind, 'withdrawal');
  assert.equal(w.amount, '-250');
  assert.equal(o.kind, 'other');
  assert.equal(o.amount, '50');
  assert.equal(r.rowsInFile, expected.rowsInFile + 2);
});

test('fileSummary', () => {
  const s = result.fileSummary;
  num(s.closedPnl, expected.fileSummary.closedPnl);
  num(s.deposits, expected.fileSummary.deposits);
  num(s.balance, expected.fileSummary.balance);
  assert.equal(s.currency, expected.fileSummary.currency);
  assert.equal(minor(s.closedPnl), expected.closedIncludedNetMinor);
});

test('invariant: rowsInFile = closed rows turned into fills + open rows + cash + skipped', () => {
  const closedRows = result.fills.length / 2;
  assert.equal(result.rowsInFile, closedRows + result.openAtEnd.length + result.cash.length + result.funding.length + result.skipped.length);
});

test('sizeStep is the smallest lot step', () => {
  assert.equal(result.sizeStep, '0.01');
});

test('bad time or number rows are skipped with catalogue keys', () => {
  const bad = html
    .replace('<td class=msdate nowrap>2026.03.05 09:00:00</td>', '<td>not a time</td>')
    .replace('<td class=mspt>-33.22</td>', '<td>n/a</td>');
  const r = format.parse(bad, { fileZone: FILE_ZONE });
  assert.deepEqual(r.skipped.map((s) => s.reasonKey).sort(), ['import.skip.cancelled', 'import.skip.date', 'import.skip.number']);
  assert.equal(r.rowsInFile, r.fills.length / 2 + r.openAtEnd.length + r.cash.length + r.skipped.length);
  for (const s of r.skipped) assert.match(s.reasonKey, /^import\.skip\.[a-zA-Z]+$/);
});

test('generator: 2,000 closed rows parsed under 2 s', () => {
  const { text, expected: g } = generate({ closedRows: 2000, seed: 7 });
  assert.ok(format.detect(text) >= 0.9);
  const t0 = performance.now();
  const r = format.parse(text, { fileZone: FILE_ZONE });
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `parse took ${ms.toFixed(0)} ms`);
  assert.equal(r.rowsInFile, g.rowsInFile);
  assert.equal(r.fills.length, g.fills);
  assert.equal(r.cash.length, g.cash);
  assert.equal(r.skipped.length, g.skipped);
  assert.equal(r.rowsInFile, r.fills.length / 2 + r.openAtEnd.length + r.cash.length + r.skipped.length);
  const closes = r.fills.filter((f) => f.key.endsWith(':close'));
  assert.equal(closes.reduce((s, c) => s + minor(c.broker.profit), 0), g.profitCents);
  assert.equal(closes.reduce((s, c) => s + minor(c.broker.commission), 0), g.commissionCents);
  assert.equal(closes.reduce((s, c) => s + minor(c.broker.swap), 0), g.swapCents);
  assert.equal(closes.filter((c) => c.stop !== null).length, g.withStop);
  assert.equal(r.cash.reduce((s, c) => s + minor(c.amount), 0), g.depositCents);
  assert.equal(minor(r.fileSummary.closedPnl), g.closedPnlCents);
  assert.equal(minor(r.fileSummary.deposits), g.depositCents);
  for (const c of closes) assert.ok(Math.abs(c.quoteToAccount - 1) < 1e-9 || c.quoteToAccount === null);
});
