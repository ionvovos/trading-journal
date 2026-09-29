# C4: generic CSV template parser

Build per this file and `docs/architecture.md` section 2 (repo-relative). Rules: see the bottom of this file.

## Own (write only these)
- `src/import/formats/generic-csv.js`
- `tests/import/generic-csv.test.mjs`
- `tests/gen/generic-csv.mjs`
- `docs/generic-template.csv` (header plus the two KO example rows from the fixture, offered for download by the app)

## Uses
`parseCsv`, `parseDecimal`, `zonedToUtc` (signatures in C1-ibkr.md).

## Contract
```js
export const format = { id: 'generic-csv', market: null, labelKey: 'import.format.generic',
  detect(text) → number,             // 0.95 when the header has time, instrument, side, size, price
  parse(text, {}) → ParseResult };
```
- Header `time,instrument,market,side,size,price,fee,fee_currency,quote_currency,id,stop,setup,notes`; only the first five are required; columns by name, any order.
- Delimiter `,` or `;` (from `parseCsv`); decimal separator per file: `,` when the delimiter is `;` and numbers match `^\d+,\d+$`, else `.`.
- `time` must be ISO 8601 with `Z` or an offset; without one → `skipped` `import.skip.timeOffset`.
- `market` stock/crypto/forex, blank → inferred: six-letter currency pair or `AAA/BBB` of two ISO currencies → forex, `/` with a non-ISO base → crypto, else stock. `contractSize` 100000 for forex, else 1.
- `fee` blank → `fee: null` (the grouping step raises `missing_fee`); `0` → 0.
- `stop`, `setup`, `notes` go on the fill as `initialStop`, `setup`, `notes` (the grouping step copies them from the first entry fill to the trade).
- `key` = `gen:<id>`, or when `id` is blank `gen:<time>|<instrument>|<side>|<size>|<price>#<n>`.

## Fixtures
`tests/fixtures/import/generic.csv` + `.expected.json`.

## Tests to write
Detect; 4 fills, 1 skipped; UTC times; blank fee is null and 0 is 0; stop, setup and notes (quoted with a comma) kept; a semicolon and decimal-comma copy built in the test gives the same fills; market inference cases (`EURUSD`, `EUR/USD`, `BTC/USDT`, `AAPL`); generator 2,000 rows under 2 s.

## Done
`node --test tests/import/generic-csv.test.mjs` exits 0.

Rules for every cloud session (repeated in each spec):
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files your spec lists. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Money: integers in minor units from the per-trade rounding point on, via `roundMinor` from `src/core/money.js`. Compare R and ratios with tolerance 1e-9.
- Every expected value comes from the fixture's `.expected.json`; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Error and skip reasons are catalogue keys (`import.skip.number`), never English sentences.
