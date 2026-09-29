# C2: Kraken trades export parser

Build per this file and `docs/architecture.md` section 2 (repo-relative). Rules: see the bottom of this file.

## Own (write only these)
- `src/import/formats/kraken-trades.js`
- `tests/import/kraken-trades.test.mjs`
- `tests/gen/kraken-trades.mjs`

## Uses (already on main, read only)
`src/import/csv.js` `parseCsv`, `src/core/money.js` `parseDecimal`, `src/core/time.js` `zonedToUtc` (signatures in C1-ibkr.md).

## Contract
```js
export const format = { id: 'kraken-trades', market: 'crypto', labelKey: 'import.format.kraken',
  detect(text) → number,             // ≥ 0.9 when the header has txid, ordertxid, pair, time, type, price, cost, fee, vol
  parse(text, { fileZone = 'UTC' }) → ParseResult };
```
Specifics (source: https://support.kraken.com/articles/360001184886-how-to-interpret-trades-history-fields):
- Columns by header name: `txid, ordertxid, pair, time, type, ordertype, price, cost, fee, vol, margin, misc, ledgers`. Extra or reordered columns are fine.
- `time` `2026-03-04 21:30:00.1000` is UTC (keep milliseconds). `type` buy/sell. `size` = `vol`, `price` = `price`, `fee` = `fee` in the quote currency (Kraken reports it in quote even when deducted in base).
- Pair map: 8-character codes starting with `X` and with `Z` or `X` at index 4 split 4+4 and drop the leading `X`/`Z` of each half (`XXBTZUSD` → `XBT`,`USD`); `XBT` → `BTC`, `XDG` → `DOGE`; otherwise split on a known quote suffix `USDT, USDC, USD, EUR, GBP, JPY, CAD, CHF, AUD` (longest first): `SOLUSD` → `SOL`/`USD`. Instrument `BASE/QUOTE`. Unknown → `skipped` `import.skip.pair`.
- `quoteCurrency` = quote; `feeCurrency` = quote; `contractSize` 1; `positionId` null; `margin > 0` adds `notes: 'margin'` on the fill.
- Unreadable number or time → `skipped` (`import.skip.number` / `import.skip.date`).
- `key` = `kraken:<txid>`. `rowsInFile` = data lines after the header (blank lines not counted).

## Fixtures
`tests/fixtures/import/kraken-trades.csv` (+ `.expected.json`), `kraken-overlap.csv`, `kraken-month-edge.csv`.

## Tests to write
Detect; 8 fills and 1 skipped on `kraken-trades.csv`; the pair map for all four pairs plus `XDGUSD` and `ETHUSDT` built in the test; fees kept in quote currency; UTC times with milliseconds; `kraken-overlap.csv` gives the same fields as TA1-TA3 with different keys; invariant `rowsInFile = fills + skipped`; generator 2,000 rows parsed under 2 s with its own expected Σ fee.

## Done
`node --test tests/import/kraken-trades.test.mjs` exits 0.

Rules for every cloud session (repeated in each spec):
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files your spec lists. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Money: integers in minor units from the per-trade rounding point on, via `roundMinor` from `src/core/money.js`. Compare R and ratios with tolerance 1e-9.
- Every expected value comes from the fixture's `.expected.json`; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Error and skip reasons are catalogue keys (`import.skip.number`), never English sentences.
