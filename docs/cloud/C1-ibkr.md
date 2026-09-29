# C1: Interactive Brokers Activity Statement parser

## Own (write only these)
- `src/import/formats/ibkr-activity.js`
- `tests/import/ibkr-activity.test.mjs`
- `tests/gen/ibkr-activity.mjs`

## Uses (already on main, read only)
- `src/import/csv.js`: `parseCsv(text, { delimiter }) → { rows: string[][], delimiter }` (RFC 4180; BOM, CRLF; `,` or `;` detected).
- `src/import/htmlTable.js`: `htmlRows(html) → [{ cells: [{ text, title, colspan }] }]`, every `<tr>` in order, entities decoded, no DOM.
- `src/core/money.js`: `parseDecimal(str, decimal = ".") → string | null` (strips spaces and thousands separators, returns a normalised decimal string such as `"-1.5"`, null when not a number).
- `src/core/decimal.js`: exact decimal arithmetic on strings (`add`, `sub`, `mul`, `cmp`, `abs`, `isZero`, `decimalsOf`).
- `src/core/time.js`: `zonedToUtc("2026-03-02T09:40:00", zone) → "2026-03-02T14:40:00.000Z"`; zone is an IANA name or `ny+7` (New York wall time + 7 h).

## Contract
```js
export const format = { id: 'ibkr-activity', market: 'stock', labelKey: 'import.format.ibkr', statesZone: false,
  detect(text) → number,     // ≥ 0.9 when a line starts with 'Trades,Header,DataDiscriminator'; 0 otherwise
  parse(text, { fileZone }) → ParseResult };   // fileZone is asked once per broker account by the app
```
ParseResult and Fill: `docs/architecture.md` §2.2. Specifics:
- Column 1 is the section, column 2 the row type. Map columns by name from the most recent `Header` row of the section (headers can repeat).
- `Trades,Data` rows with `DataDiscriminator = Order` and `Asset Category = Stocks` are fills. Other asset categories → `skipped` (`import.skip.assetClass`). `SubTotal` and `Total` rows are ignored and not counted.
- `Date/Time` `"2026-03-02, 09:40:00"` is wall time in `fileZone` → UTC.
- `Quantity` > 0 buy, < 0 sell; `size` = |Quantity|; `price` = `T. Price`; `fee` = −`Comm/Fee`; `feeCurrency` = `quoteCurrency` = `Currency`; `contractSize` `"1"`; `openClose` = `O` or `C` from the first letter of `Code`; `broker` = `{ commission: −Comm/Fee }` on every fill plus `realizedPnl` = `Realized P/L` and `basis` = |`Basis`| on `C` rows; `stop` null.
- Unreadable Quantity, price or date → `skipped` (`import.skip.number` / `import.skip.date`) with `raw`.
- `Deposits & Withdrawals,Data` rows → `cash` (`deposit` if Amount > 0, else `withdrawal`, `time` = Settle Date), except the row whose Currency is `Total`.
- `Account Information,Data,Base Currency,<ccy>` sets `accountCurrency`.
- `rowsInFile` = counted Trades data rows + counted D&W data rows; invariant `rowsInFile = fills + cash + skipped`.
- `key` = `ibkr:<Symbol>|<Date/Time>|<Quantity>|<T. Price>|<Comm/Fee>#<n>`, n = 1-based occurrence of that string in the file. `sizeStep` = smallest step among sizes (`"1"` here).

## Fixtures
`tests/fixtures/import/ibkr-activity.csv` and `.expected.json` (fill count, UTC times, skipped reasons, cash, broker figures; trade-level entries there are for the grouping step and are not asserted by this parser).

## Tests to write
Detect true on the fixture, false on `kraken-trades.csv`; 8 fills; each fill's UTC time across the 8 Mar 2026 US clock change; the two skipped rows and reasons; the deposit; base currency; broker figures on the closing rows (207, -120, 49, 98); the invariant; keys unique and stable over two parses; a CRLF and BOM copy built in the test parses the same; `tests/gen/ibkr-activity.mjs` writes a 2,000-row file (including closing rows with no opening row) to a temp dir with a seeded mulberry32 and returns its own expected fill count and Σ Comm/Fee; parsing it takes under 2 s.

## Done
`node --test tests/import/ibkr-activity.test.mjs` exits 0.

## Rules
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files listed under Own. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Prices, sizes and money amounts in fills are decimal strings exactly as normalised by `parseDecimal`; never convert them to numbers inside a parser. Expected values in fixtures that are numbers compare numerically (`Number(actual) === expected`, or within 1e-9 for ratios).
- Every expected value comes from the fixture files; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Skip and error reasons are catalogue keys (`import.skip.number`), never English sentences.
- Contract of record: `docs/architecture.md` §2 (formats, ParseResult, Fill) and §3 (statistics), requirements at `docs/requirements.md`.

