import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlRows, decodeEntities } from '../../src/import/htmlTable.js';

const mt4 = readFileSync(new URL('../fixtures/import/mt4-statement.htm', import.meta.url), 'utf8');
const text = (row) => row.cells.map((c) => c.text);

test('rows and cells in order, entities decoded, whitespace collapsed', () => {
  const rows = htmlRows('<table><tr><td>a &amp; b</td><td> x\n  y </td></tr><tr><td>&lt;1&gt;</td><td>&nbsp;</td></tr></table>');
  assert.deepEqual(rows.map(text), [['a & b', 'x y'], ['<1>', '']]);
});

test('title and colspan; attributes quoted, single quoted or bare', () => {
  const rows = htmlRows(`<tr><td title="to #1005" colspan=2>1004</td><td title='from #1'>x</td><td colspan="3" title=Deposit>y</td><td>z</td></tr>`);
  const c = rows[0].cells;
  assert.deepEqual(c.map((x) => x.title), ['to #1005', 'from #1', 'Deposit', '']);
  assert.deepEqual(c.map((x) => x.colspan), [2, 1, 3, 1]);
});

test('a > inside a quoted attribute does not end the tag', () => {
  const rows = htmlRows('<tr><td title="a > b">1</td></tr>');
  assert.equal(rows[0].cells[0].title, 'a > b');
  assert.equal(rows[0].cells[0].text, '1');
});

test('missing closing tags and th cells', () => {
  const rows = htmlRows('<table><tr><th>A<th>B<tr><td>1<td>2</table>');
  assert.deepEqual(rows.map(text), [['A', 'B'], ['1', '2']]);
});

test('tags inside cells are removed, br becomes a space', () => {
  const rows = htmlRows('<tr><td><b>Closed P/L:</b></td><td>line1<br>line2<span> x</span></td></tr>');
  assert.deepEqual(text(rows[0]), ['Closed P/L:', 'line1 line2 x']);
});

test('comments, style and script are ignored', () => {
  const rows = htmlRows('<style><!-- td{font:8pt} --></style><script>var s="<tr><td>no</td></tr>"</script><!-- <tr><td>hidden</td></tr> --><tr><td>seen</td></tr>');
  assert.deepEqual(rows.map(text), [['seen']]);
});

test('numeric entities', () => {
  assert.equal(decodeEntities('&#65;&#x42;&#xZZ;&unknown;'), 'AB&#xZZ;&unknown;');
  assert.deepEqual(text(htmlRows('<tr><td>caf&eacute; &#8364;5</td></tr>')[0]), ['caf&eacute; €5']);
});

test('MT4 fixture: tables, titles, thousands spaces, no-break spaces', () => {
  const rows = htmlRows(mt4);
  const withTicket = rows.filter((r) => /^\d+$/.test(r.cells[0]?.text));
  assert.deepEqual(withTicket.map((r) => r.cells[0].text), ['1001', '1002', '1003', '1004', '1005', '1006', '1007']);
  const deposit = withTicket[0];
  assert.equal(deposit.cells[0].title, 'Deposit');
  assert.equal(deposit.cells[2].text, 'balance');
  assert.equal(deposit.cells[3].colspan, 10);
  assert.equal(deposit.cells.at(-1).text, '10 000.00');
  assert.equal(withTicket[3].cells[0].title, 'to #1005');
  assert.equal(withTicket[4].cells[0].title, 'from #1004');
  assert.equal(withTicket[1].cells.length, 14);
  assert.deepEqual(text(withTicket[1]).slice(0, 5), ['1002', '2026.03.05 09:00:00', 'buy', '0.20', 'eurusd']);
  const heads = rows.map((r) => r.cells[0]?.text);
  assert.ok(heads.includes('Closed Transactions:'));
  assert.ok(heads.includes('Open Trades:'));
  assert.ok(heads.includes('Summary:'));
  const account = rows[0];
  assert.ok(account.cells.some((c) => c.text === 'Currency: USD'));
  const bal = rows.find((r) => r.cells[0].text === 'Balance:');
  assert.equal(bal.cells[1].text, '10 074.18');
  const openHeader = rows.find((r) => r.cells[0].text === 'Ticket' && r.cells[8].text === '');
  assert.ok(openHeader, 'nbsp cell reads as empty text');
});

test('empty and table-free input', () => {
  assert.deepEqual(htmlRows(''), []);
  assert.deepEqual(htmlRows('<p>no table</p>'), []);
});

test('a 2,000-row report reads fast', () => {
  const body = Array.from({ length: 2000 }, (_, i) => `<tr><td title="t${i}">${i}</td><td>2026.03.05 09:00:00</td><td class=mspt>1 000.00</td></tr>`).join('\n');
  const t0 = Date.now();
  const rows = htmlRows(`<table>${body}</table>`);
  assert.equal(rows.length, 2000);
  assert.equal(rows[1999].cells[0].title, 't1999');
  assert.ok(Date.now() - t0 < 500);
});
