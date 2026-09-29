# C4: generic CSV template parser

## Own (write only these)
- `src/import/formats/generic-csv.js`
- `tests/import/generic-csv.test.mjs`
- `tests/gen/generic-csv.mjs`
- `docs/generic-template.csv` (the header plus the deposit and two KO rows of the fixture, offered for download by the app)

## Uses (already on main, read only)
- `src/import/csv.js`: `parseCsv(text, { delimiter }) → { rows: string[][], delimiter }` (RFC 4180; BOM, CRLF; `,` or `;` detected).
- `src/import/htmlTable.js`: `htmlRows(html) → [{ cells: [{ text, title, colspan }] }]`, every `<tr>` in order, entities decoded, no DOM.
- `src/core/money.js`: `parseDecimal(str, decimal = ".") → string | null` (strips spaces and thousands separators, returns a normalised decimal string such as `"-1.5"`, null when not a number).
- `src/core/decimal.js`: exact decimal arithmetic on strings (`add`, `sub`, `mul`, `cmp`, `abs`, `isZero`, `decimalsOf`).
- `src/core/time.js`: `zonedToUtc("2026-03-02T09:40:00", zone) → "2026-03-02T14:40:00.000Z"`; zone is an IANA name or `ny+7` (New York wall time + 7 h).

## Contract
```js
export const format = { id: 'generic-csv', market: null, labelKey: 'import.format.generic', statesZone: true,
  detect(text) → number,     // 0.95 when the header has time, instrument, side, size, price
  parse(text, {}) → ParseResult };
```
- Header `time,type,instrument,market,side,size,price,fee,fee_currency,quote_currency,amount,currency,contract_value,id,stop,setup,notes`; columns by name, any order; only `time`, `instrument`, `side`, `size`, `price` are required for a trade row.
- `type`: blank or `trade` → fill; `funding` → `funding` entry (`instrument`, `amount` signed, `currency`); `deposit`, `withdrawal` → `cash`; `cash` → `cash` kind `other`.
- Delimiter `,` or `;` (from `parseCsv`); decimal separator per file: `,` when the delimiter is `;` and numbers match `^-?\d+,\d+$`, else `.`.
- `time` must be ISO 8601 with `Z` or an offset; without one → `skipped` (`import.skip.timeOffset`).
- `market` stock/crypto/forex; blank → inferred: six-letter pair or `AAA/BBB` of two ISO currencies → forex; `/` or `-PERP` with a non-ISO base → crypto; else stock. `contractSize` `"100000"` for forex, else `"1"`; `contract_value` fills `contractValue` (crypto contracts).
- `fee` blank → `fee: null` (the grouping step raises `missing_fee`); `0` → `"0"`.
- `stop`, `setup`, `notes` go on the fill (`stop` with `stopSource: 'file_initial'`).
- `key` = `gen:<id>`, or when `id` is blank `gen:<time>|<type>|<instrument>|<side>|<size>|<price>#<n>`. `rowsInFile` = non-blank lines after the header; invariant `rowsInFile = fills + cash + funding + skipped`.

## Fixtures
`tests/fixtures/import/generic.csv` + `.expected.json`.

## Tests to write
Detect; 4 fills, 1 cash, 1 funding, 1 skipped; UTC times; blank fee is null and 0 is `"0"`; a blank `type` is a trade; stop, setup and notes (quoted with a comma) kept; a semicolon and decimal-comma copy built in the test gives the same result; market inference (`EURUSD`, `EUR/USD`, `BTC/USDT`, `BTC-PERP`, `AAPL`); generator 2,000 rows under 2 s.

## Done
`node --test tests/import/generic-csv.test.mjs` exits 0.

## Rules
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files listed under Own. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Prices, sizes and money amounts in fills are decimal strings exactly as normalised by `parseDecimal`; never convert them to numbers inside a parser. Expected values in fixtures that are numbers compare numerically (`Number(actual) === expected`, or within 1e-9 for ratios).
- Every expected value comes from the fixture files; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Skip and error reasons are catalogue keys (`import.skip.number`), never English sentences.
- Contract of record: `docs/architecture.md` §2 (formats, ParseResult, Fill) and §3 (statistics), requirements at `docs/requirements.md`.

