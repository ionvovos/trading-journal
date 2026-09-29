# C1: Interactive Brokers Activity Statement parser

Build per this file and `docs/architecture.md` section 2 (repo-relative). Rules: see the bottom of this file.

## Own (write only these)
- `src/import/formats/ibkr-activity.js`
- `tests/import/ibkr-activity.test.mjs`
- `tests/gen/ibkr-activity.mjs`

## Uses (already on main, read only)
- `src/import/csv.js`: `parseCsv(text, { delimiter }) → { rows: string[][], delimiter }` (RFC 4180, BOM and CRLF handled).
- `src/core/money.js`: `parseDecimal(str, decimal = '.') → number | NaN`, `roundMinor(x, digits) → integer`.
- `src/core/time.js`: `zonedToUtc('2026-03-02T09:40:00', 'America/New_York') → '2026-03-02T14:40:00.000Z'`.

## Contract
```js
export const format = { id: 'ibkr-activity', market: 'stock', labelKey: 'import.format.ibkr',
  detect(text) → number,             // ≥ 0.9 when a line starts with 'Trades,Header,DataDiscriminator'; 0 otherwise
  parse(text, { fileZone = 'America/New_York', accountCurrency = null }) → ParseResult };
```
ParseResult and Fill are defined in `docs/architecture.md` §2.2. Specifics:
- Column 1 is the section, column 2 the row type. Headers can repeat per section and per asset class; map columns by header name from the most recent `Header` row of that section.
- `Trades,Data` rows with `DataDiscriminator = Order` and `Asset Category = Stocks` become fills. Other asset categories → `skipped` with `import.skip.assetClass`. `SubTotal` and `Total` rows are ignored and not counted.
- `Date/Time` `"2026-03-02, 09:40:00"` is wall time in `fileZone` → UTC ISO.
- `Quantity` > 0 buy, < 0 sell; `size` = |Quantity|; `price` = `T. Price`; `fee` = −`Comm/Fee` (IBKR shows cost as negative); `feeCurrency` = `quoteCurrency` = `Currency`; `contractSize` 1; `openClose` = first letter of `Code` if `O` or `C`; `basis` = |`Basis`| on `C` rows; `realizedPnl` = `Realized P/L` on `C` rows.
- A non-numeric Quantity, price or date → `skipped` with `import.skip.number` or `import.skip.date`, `raw` = the row joined back.
- `Deposits & Withdrawals,Data` rows → `nonTrade` (`deposit` if Amount > 0, else `withdrawal`), except the row whose Currency is `Total`.
- `Account Information,Data,Base Currency,<ccy>` sets `accountCurrency`.
- `rowsInFile` = counted `Trades,Data` rows + counted D&W data rows. Invariant: `rowsInFile = fills + nonTrade + skipped`.
- `key` = `ibkr:<Symbol>|<Date/Time>|<Quantity>|<T. Price>|<Comm/Fee>#<n>`, n = 1-based occurrence of that same string in the file.

## Fixtures
`tests/fixtures/import/ibkr-activity.csv` and `.expected.json` (use the fill count, times, skipped reasons, nonTrade and the per-fill fields that follow from the rows; trade-level expectations in that file are for the grouping step, not for this parser, but assert that Σ over sells of (price × size) − fees matches the file's own arithmetic where the expected file states it).

## Tests to write
Detect true on the fixture and false on `tests/fixtures/import/kraken-trades.csv`; fill count 8; each fill's UTC time (DST change on 8 Mar 2026 included); the two skipped rows and reasons; the deposit; base currency; the invariant; keys unique and stable across two parses; a CRLF and BOM copy of the fixture made in the test gives the same result; `tests/gen/ibkr-activity.mjs` writes a 2,000-row file to a temp dir with a seeded mulberry32 and returns its own expected fill count and Σ Comm/Fee, and the test parses it in under 2 s.

## Done
`node --test tests/import/ibkr-activity.test.mjs` exits 0.

Rules for every cloud session (repeated in each spec):
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files your spec lists. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Money: integers in minor units from the per-trade rounding point on, via `roundMinor` from `src/core/money.js`. Compare R and ratios with tolerance 1e-9.
- Every expected value comes from the fixture's `.expected.json`; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Error and skip reasons are catalogue keys (`import.skip.number`), never English sentences.
