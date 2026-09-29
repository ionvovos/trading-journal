# C2: Kraken trades export parser

## Own (write only these)
- `src/import/formats/kraken-trades.js`
- `tests/import/kraken-trades.test.mjs`
- `tests/gen/kraken-trades.mjs`

## Uses (already on main, read only)
- `src/import/csv.js`: `parseCsv(text, { delimiter }) → { rows: string[][], delimiter }` (RFC 4180; BOM, CRLF; `,` or `;` detected).
- `src/import/htmlTable.js`: `htmlRows(html) → [{ cells: [{ text, title, colspan }] }]`, every `<tr>` in order, entities decoded, no DOM.
- `src/core/money.js`: `parseDecimal(str, decimal = ".") → string | null` (strips spaces and thousands separators, returns a normalised decimal string such as `"-1.5"`, null when not a number).
- `src/core/decimal.js`: exact decimal arithmetic on strings (`add`, `sub`, `mul`, `cmp`, `abs`, `isZero`, `decimalsOf`).
- `src/core/time.js`: `zonedToUtc("2026-03-02T09:40:00", zone) → "2026-03-02T14:40:00.000Z"`; zone is an IANA name or `ny+7` (New York wall time + 7 h).

## Contract
```js
export const format = { id: 'kraken-trades', market: 'crypto', labelKey: 'import.format.kraken', statesZone: true,
  detect(text) → number,     // ≥ 0.9 when the header has txid, ordertxid, pair, time, type, price, cost, fee, vol
  parse(text, { fileZone = 'UTC' }) → ParseResult };
```
Source: https://support.kraken.com/articles/360001184886-how-to-interpret-trades-history-fields . Specifics:
- Columns by header name: `txid, ordertxid, pair, time, type, ordertype, price, cost, fee, vol, margin, misc, ledgers`; extra or reordered columns are fine.
- `time` `2026-03-04 21:30:00.1000` is UTC; keep milliseconds. `type` buy/sell. `size` = `vol`, `price` = `price`, `fee` = `fee` in the quote currency (Kraken shows it in quote even when deducted in base). `broker` null (no realised P&L in this export).
- Pairs: 8-character codes starting with `X` with `Z` or `X` at index 4 split 4+4 and drop the leading `X`/`Z` of each half (`XXBTZUSD` → `XBT`,`USD`); `XBT` → `BTC`, `XDG` → `DOGE`; otherwise split on a quote suffix `USDT, USDC, USD, EUR, GBP, JPY, CAD, CHF, AUD` (longest first): `SOLUSD` → `SOL/USD`. Unknown → `skipped` (`import.skip.pair`).
- `quoteCurrency` = `feeCurrency` = quote; `contractSize` `"1"`; `positionId` null; `margin` > 0 sets `notes: 'margin'`.
- Unreadable number or time → `skipped` (`import.skip.number` / `import.skip.date`).
- `key` = `kraken:<txid>`. `rowsInFile` = non-blank lines after the header. `sizeStep` = 10^-(most decimals in `vol`), here `"0.00000001"`.

## Fixtures
`tests/fixtures/import/kraken-trades.csv` (+ `.expected.json`), `kraken-overlap.csv`, `kraken-month-edge.csv`, `kraken-quantity.csv`.

## Tests to write
Detect; 8 fills and 1 skipped on `kraken-trades.csv`; the pair map for the four fixture pairs plus `XDGUSD` and `ETHUSDT` built in the test; fee strings kept in quote currency; UTC times with milliseconds; `sizeStep`; `kraken-overlap.csv` gives the same fields as TA1-TA3 with different keys; `kraken-quantity.csv` gives 3 fills whose sizes are exactly `"0.3"`, `"0.2"`, `"0.2"`; invariant `rowsInFile = fills + skipped`; generator 2,000 rows parsed under 2 s with its own expected Σ fee.

## Done
`node --test tests/import/kraken-trades.test.mjs` exits 0.

## Rules
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files listed under Own. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Prices, sizes and money amounts in fills are decimal strings exactly as normalised by `parseDecimal`; never convert them to numbers inside a parser. Expected values in fixtures that are numbers compare numerically (`Number(actual) === expected`, or within 1e-9 for ratios).
- Every expected value comes from the fixture files; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Skip and error reasons are catalogue keys (`import.skip.number`), never English sentences.
- Contract of record: `docs/architecture.md` §2 (formats, ParseResult, Fill) and §3 (statistics), requirements at `docs/requirements.md`.

