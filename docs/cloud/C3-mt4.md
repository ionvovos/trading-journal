# C3: MetaTrader 4 statement parser (HTML)

Build per this file and `docs/architecture.md` section 2 (repo-relative). Rules: see the bottom of this file.

## Own (write only these)
- `src/import/formats/mt4-statement.js`
- `tests/import/mt4-statement.test.mjs`
- `tests/gen/mt4-statement.mjs`

## Uses (already on main, read only)
- `src/import/htmlTable.js`: `htmlRows(html) → [{ cells: [{ text, title, colspan }] }]`, every `<tr>` in document order, entities decoded, tags stripped, whitespace collapsed. No DOM.
- `src/core/money.js` `parseDecimal` (strip the space thousands separator first: `10 000.00`), `src/core/time.js` `zonedToUtc(local, zone)` which accepts IANA names and `ny+7` (New York wall time + 7 h).

## Contract
```js
export const format = { id: 'mt4-statement', market: 'forex', labelKey: 'import.format.mt4',
  detect(text) → number,             // ≥ 0.9 when the text contains 'Closed Transactions:' and a row with 'Ticket' and 'Open Time'
  parse(text, { fileZone }) → ParseResult };   // fileZone required: server time is not in the file
```
MT4 has no CSV export; "Save as Report" / "Save as Detailed Report" write HTML (https://www.metatrader4.com/en/trading-platform/help/overview/terminal/terminal_account_history). Specifics:
- Account currency from a cell `Currency: USD`.
- After a row whose first cell is `Closed Transactions:`, rows whose first cell is an integer ticket are data rows until a row starting `Open Trades:` or `Summary:`; rows after `Open Trades:` with an integer ticket are open positions. Other rows (headers, subtotals, `Closed P/L:`) are ignored and not counted.
- Closed row cells: Ticket, Open Time, Type, Size, Item, Price, S / L, T / P, Close Time, Price, Commission, Taxes, Swap, Profit. Times `2026.03.05 09:00:00` in `fileZone`.
- `balance` → `nonTrade` (`deposit` if amount > 0 else `withdrawal`), amount = last cell. `credit` → `nonTrade` `other`.
- `buy`/`sell` → two fills: open (side = type) and close (opposite side), `size` = lots, `contractSize` 100000 for six-letter currency pairs (`eurusd` → `EUR/USD`), else 1 and instrument upper-cased (`gold` → `GOLD`). Commission and Taxes as a positive `fee` on the close fill (they are negative costs in the file), `feeCurrency` = account currency, `feeToAccount` 1; Swap goes to the close fill as `funding` (signed as in the file: negative = paid); `pnlAccount` = Profit; `quoteToAccount` = Profit / ((close − open) × (buy ? 1 : −1) × size × contractSize), null if the prices are equal; `stopAtClose` / `targetAtClose` from S / L, T / P when not 0.
- `buy limit`, `sell limit`, `buy stop`, `sell stop` rows (cancelled or expired) → `skipped` `import.skip.cancelled`.
- Ticket `title` `to #N` / `from #N`: `positionId` = the first ticket of the chain, on both fills of every ticket in it.
- Open Trades rows → `openAtEnd` fills (open side only).
- `fileSummary` from the Summary rows `Deposit/Withdrawal:`, `Closed Trade P/L:`, `Balance:`.
- `key` = `mt4:<ticket>:open` / `:close`. `rowsInFile` counts ticket rows in both tables. Invariant `rowsInFile = rows turned into fills + nonTrade + skipped` (an open row counts once).

## Fixtures
`tests/fixtures/import/mt4-statement.htm` + `.expected.json`.

## Tests to write
Detect; account currency; 8 fills from 4 closed rows plus one open; UTC times with `ny+7` across the 8 Mar 2026 US clock change; fees, funding and implied `quoteToAccount` 0.006644 for USD/JPY; the GBP/USD chain gets `positionId` `1004` on all four fills; cancelled row skipped; deposit; fileSummary; invariant; generator 2,000 closed rows parsed under 2 s.

## Done
`node --test tests/import/mt4-statement.test.mjs` exits 0.

Rules for every cloud session (repeated in each spec):
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files your spec lists. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Money: integers in minor units from the per-trade rounding point on, via `roundMinor` from `src/core/money.js`. Compare R and ratios with tolerance 1e-9.
- Every expected value comes from the fixture's `.expected.json`; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Error and skip reasons are catalogue keys (`import.skip.number`), never English sentences.
