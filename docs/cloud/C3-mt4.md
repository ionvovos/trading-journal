# C3: MetaTrader 4 statement parser (HTML)

## Own (write only these)
- `src/import/formats/mt4-statement.js`
- `tests/import/mt4-statement.test.mjs`
- `tests/gen/mt4-statement.mjs`

## Uses (already on main, read only)
- `src/import/csv.js`: `parseCsv(text, { delimiter }) → { rows: string[][], delimiter }` (RFC 4180; BOM, CRLF; `,` or `;` detected).
- `src/import/htmlTable.js`: `htmlRows(html) → [{ cells: [{ text, title, colspan }] }]`, every `<tr>` in order, entities decoded, no DOM.
- `src/core/money.js`: `parseDecimal(str, decimal = ".") → string | null` (strips spaces and thousands separators, returns a normalised decimal string such as `"-1.5"`, null when not a number).
- `src/core/decimal.js`: exact decimal arithmetic on strings (`add`, `sub`, `mul`, `cmp`, `abs`, `isZero`, `decimalsOf`).
- `src/core/time.js`: `zonedToUtc("2026-03-02T09:40:00", zone) → "2026-03-02T14:40:00.000Z"`; zone is an IANA name or `ny+7` (New York wall time + 7 h).

## Contract
```js
export const format = { id: 'mt4-statement', market: 'forex', labelKey: 'import.format.mt4', statesZone: false,
  detect(text) → number,     // ≥ 0.9 when the text contains 'Closed Transactions:' and a row with 'Ticket' and 'Open Time'
  parse(text, { fileZone }) → ParseResult };   // server time is not in the file; the app asks once per broker account
```
MT4 writes HTML only (https://www.metatrader4.com/en/trading-platform/help/overview/terminal/terminal_account_history). Specifics:
- Account currency from a cell `Currency: USD`.
- After a row whose first cell is `Closed Transactions:`, rows whose first cell is an integer ticket are data rows until `Open Trades:` or `Summary:`; ticket rows after `Open Trades:` are open positions. Other rows (headers, subtotals, `Closed P/L:`) are ignored and not counted.
- Closed row cells: Ticket, Open Time, Type, Size, Item, Price, S / L, T / P, Close Time, Price, Commission, Taxes, Swap, Profit. Times `2026.03.05 09:00:00` in `fileZone`. Numbers may use a space as thousands separator.
- `balance` → `cash` (`deposit` if amount > 0 else `withdrawal`, amount = last cell); `credit` → `cash` `other`.
- `buy`/`sell` → two fills, open (side = type) and close (opposite side); `size` = lots; `contractSize` `"100000"` for six-letter currency pairs (`eurusd` → `EUR/USD`, quote = last three letters), else `"1"` and instrument upper-cased. On the close fill: `fee` = −(Commission + Taxes) as a decimal string, `feeCurrency` = account currency; `broker` = `{ commission, taxes, swap, profit }` as in the file. `quoteToAccount` = Profit / ((close − open) × (buy ? 1 : −1) × size × contractSize) as a number on both fills, null when open = close. `stop` = S / L and `target` = T / P when not zero, `stopSource: 'file_at_close'`.
- `buy limit`, `sell limit`, `buy stop`, `sell stop` rows → `skipped` (`import.skip.cancelled`).
- Ticket `title` `to #N` / `from #N`: `positionId` = the first ticket of the chain, on every fill of the chain.
- Open Trades rows → `openAtEnd` (open fill only).
- `fileSummary` from `Deposit/Withdrawal:`, `Closed Trade P/L:`, `Balance:`.
- `key` = `mt4:<ticket>:open` / `:close` / `:cash`. `rowsInFile` counts ticket rows in both tables; invariant `rowsInFile = closed rows turned into fills + open rows + cash + skipped`.

## Fixtures
`tests/fixtures/import/mt4-statement.htm` + `.expected.json`.

## Tests to write
Detect; account currency; 8 fills from 4 closed rows plus one open; UTC times with `ny+7` across the 8 Mar 2026 US clock change; close-fill fees, broker figures and implied `quoteToAccount` 0.006644 for USD/JPY; stops 1.08 and 150.3 with `stopSource`, none for GBP/USD; the GBP/USD chain has `positionId` `1004` on all four fills; cancelled row skipped; deposit; fileSummary; invariant; generator 2,000 closed rows parsed under 2 s.

## Done
`node --test tests/import/mt4-statement.test.mjs` exits 0.

## Rules
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files listed under Own. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Prices, sizes and money amounts in fills are decimal strings exactly as normalised by `parseDecimal`; never convert them to numbers inside a parser. Expected values in fixtures that are numbers compare numerically (`Number(actual) === expected`, or within 1e-9 for ratios).
- Every expected value comes from the fixture files; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Skip and error reasons are catalogue keys (`import.skip.number`), never English sentences.
- Contract of record: `docs/architecture.md` §2 (formats, ParseResult, Fill) and §3 (statistics), requirements at `docs/requirements.md`.

