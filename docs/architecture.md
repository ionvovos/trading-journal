# Trading journal: architecture

Phase `nexa-build-trading-journal-2026-09-29-L2`, owner `aios-saas-architect`. Inputs: `BRIEF-TEAM.md` (P1-P10, Boundary, AM4, AM5), `PICK.md` K1-K4, `requirements.md` (commit `d644f989`, criteria `AC-*`, figures `S1`-`S16`, angle items `A1`-`A5`), `domain-pack.md`. Reused from thought-catcher (repo `~/Εγγραφα/thought-catcher`, same author, MIT): the no-build PWA shell, `sw.js` versioning, the IndexedDB store pattern, the AI adapter (`src/core/ai/http.js`, `anthropic.js`, `openai.js`), `e2e/lib/cdp.mjs`, `design/tools/shoot.mjs`, `tools/make-icons.mjs`, and the B2 on-device model results (`projects/thought-catcher/docs/spike-b2.md`). Repo: `~/Εγγραφα/trading-journal` → `github.com/ionvovos/trading-journal`, GitHub Pages at `https://ionvovos.github.io/trading-journal/`.

## 1. Stack

| # | Decision | Reason |
|---|---|---|
| D1 | Plain ES modules, HTML and CSS, no build step, no npm dependencies. The repo root is the site. | Pages serves the repo as-is; cloud sessions and seats need no install; `node --test` imports the pure modules directly. Thought-catcher shipped this way and its B2 spike loaded WebLLM as an ES module with no bundler. |
| D2 | Hash routing, all URLs relative. | Works under `/trading-journal/` with no 404 fallback. |
| D3 | Charts are hand-written SVG in `src/ui/charts/`, no chart library. | Four chart types (line, underwater area, bars, calendar grid); D4 needs every mark styled from the design tokens; CSP `style-src 'self'` and no third-party script on the statistics path. |
| D4 | Money is integer minor units from the per-trade rounding point on (section 3.1). Prices, sizes and rates stay JavaScript numbers. | Requirements "Money rules": a displayed total equals the sum of displayed rows. |
| D5 | Pure modules (`src/core`, `src/import`, `src/stats`, `src/plan`, `src/review`, `src/sentence`, `src/learn`, `src/i18n`, `src/storage/memory.js`, `src/storage/migrate.js`, `src/ai/*` except the worker) import nothing from the DOM; time, clock and `fetch` are injected. | Node tests with no DOM and no network. |
| D6 | No server, no account, no paid service. Read-only exchange API keys are **not** adopted. | Private exchange endpoints need a signed secret in the browser and are not CORS-enabled for third-party origins; file import covers P1; B1 asks for no credentials. |

Third-party code (install-gate per-task exception, as in thought-catcher: runtime dependencies loaded by the end user's browser after consent, none runs on Ion's machine):

| Item | Source | Licence | Pin | Path | Gate note |
|---|---|---|---|---|---|
| WebLLM | npm `@mlc-ai/web-llm`, github.com/mlc-ai/web-llm | Apache-2.0 | 0.2.85 | not vendored: `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm`, imported only inside `src/ai/worker.js` after consent; cached by the SW in `tj-cdn` | Same pin and licence check as thought-catcher B2 (2026-09-29). Weights (829 MB) cannot live in a Pages repo; the pinned jsDelivr URL is immutable. |
| Qwen2.5-1.5B-Instruct-q4f16_1-MLC weights | huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC | base model Apache-2.0 | WebLLM 0.2.85 prebuilt entry | Hugging Face, fetched by WebLLM into Cache Storage | Same as B2. |
| WebLLM model library `.wasm` | raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs | not declared (B2 finding F5, still open) | fixed by the 0.2.85 config | fetched by WebLLM | L4 security seat re-checks; if it stays undeclared the About page names it. |
| Fonts | only if L2d picks one: self-hosted OFL/Apache font files under `fonts/` | OFL or Apache | file hash in `fonts/README.md` | vendored | No font CDN (AC-P8.2 network rule). |

No other library. Parsers, CSV and HTML table reading, time-zone conversion (`Intl`), charts and tests are own code.

## 2. Import formats

### 2.1 Named formats (one per market, plus a generic template)

| Id | Market | Source file | Format source | Time zone | Fees |
|---|---|---|---|---|---|
| `ibkr-activity` | stocks | Interactive Brokers Activity Statement, CSV download | Header row `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code`; only `DataDiscriminator = Order` rows are fills (https://www.macroption.com/interactive-brokers-statements-database/ via search summary; public sample file https://github.com/volodymyr-kovtun/Pitly/blob/main/samples/sample-activity-statement.csv, MIT, read 2026-09-29). Many sections in one file; column 1 is the section, column 2 `Header`/`Data`/`SubTotal`/`Total`. `Date/Time` looks like `"2026-03-02, 10:00:00"`. | Statement time, US Eastern by IBKR's statement cutoffs (https://www.ibkrguides.com/clientportal/performanceandstatements/statements.htm). **Unverified on a real file**: the import step asks, prefilled `America/New_York`. | `Comm/Fee` negative, in the row `Currency`. |
| `kraken-trades` | crypto | Kraken → History → Export → Trades, CSV | Columns `txid, ordertxid, pair, time, type, ordertype, price, cost, fee, vol, margin, misc, ledgers`; one row per fill; `ordertxid` shared by fills of one order (https://support.kraken.com/articles/360001184886-how-to-interpret-trades-history-fields, read 2026-09-29; sample https://github.com/dcdpr/taxcount/blob/main/references/kraken-tests/trades.csv). `time` like `2024-02-01 22:21:03.815`. | UTC (Kraken page: "in UTC timezone"). | `fee` always in the quote currency, even when deducted in base (same page). |
| `mt4-statement` | forex | MetaTrader 4 → Account History → "Save as Report" or "Save as Detailed Report" (HTML; MT4 has no CSV export: https://www.metatrader4.com/en/trading-platform/help/overview/terminal/terminal_account_history) | Table after the text `Closed Transactions:` with columns `Ticket, Open Time, Type, Size, Item, Price, S / L, T / P, Close Time, Price, Commission, Taxes, Swap, Profit`; `balance` rows are deposits and withdrawals; the ticket cell's `title` attribute holds the order comment (`to #1005`, `from #1004` on partial closes); table `Open Trades:`; `Summary:` with `Deposit/Withdrawal`, `Closed Trade P/L`, `Balance`; numbers use a space as thousands separator (`10 000.00`); times `2025.12.19 09:53:33`. Layout checked on a real statement (github.com/fujunzibo/mt4 `test/DetailedStatement2.htm`, no licence, read only, not copied). Account currency from the header line `Currency: USD`. | Broker server time, not stated in the file. The import step asks; options: any IANA zone, or `ny+7` (New York time plus 7 hours, the common "UTC+2 winter, UTC+3 summer" server clock). | `Commission`, `Taxes`, `Swap` columns in account currency; `Profit` already in account currency. |
| `generic-csv` | any | The app's own template, downloadable from the import screen | Header `time,instrument,market,side,size,price,fee,fee_currency,quote_currency,id,stop,setup,notes`; `time` ISO 8601 with offset; `side` buy/sell; `market` stock/crypto/forex; `fee` blank = missing (anomaly), `0` = no fee. Comma or semicolon delimiter, `.` or `,` decimal detected per file. | From the offset in each `time`. | `fee` in `fee_currency`. |

Deferred, named for later rungs: Binance (the order-history column names were not confirmed, domain pack F1), MT5 HTML report, Trading 212 CSV.

### 2.2 Parser contract (`src/import/formats/<id>.js`)

```js
export const format = {
  id: 'kraken-trades', market: 'crypto', labelKey: 'import.format.kraken',
  detect(text) → number,                       // 0..1; registry picks the highest ≥ 0.6, else asks the user
  parse(text, { fileZone, accountCurrency }) → ParseResult,
};
// ParseResult
{ rowsInFile, fills: [Fill], nonTrade: [{ row, kind: 'deposit'|'withdrawal'|'balance'|'other', amount, currency }],
  skipped: [{ row, reasonKey, raw }], openAtEnd: [Fill],            // MT4 "Open Trades" rows
  fileSummary: null | { closedPnl, deposits, balance, currency },   // MT4 only; a cross-check, never the broker total
  accountCurrency: 'USD' | null }
// Fill: one execution, already in UTC
{ key, time: '2026-03-04T21:30:00.100Z', instrument: 'BTC/USD', market: 'crypto', side: 'buy'|'sell',
  size: 0.05, price: 60000, fee: 3.0, feeCurrency: 'USD', quoteCurrency: 'USD', contractSize: 1,
  positionId: null | '1004',      // MT4 ticket chain root; null = group by instrument
  openClose: null | 'O' | 'C',    // IBKR Code
  basis: null | number, realizedPnl: null | number,                 // IBKR, account currency
  stopAtClose: null | number, targetAtClose: null | number,         // MT4 S/L, T/P at close, never the initial stop
  pnlAccount: null | number,      // MT4 Profit: the parser also returns the implied quoteToAccount rate
  quoteToAccount: null | number, funding: 0,                         // MT4 Swap on the close fill, signed (− = paid)
  initialStop: null, setup: null, notes: null,                      // generic template only
  row: 12 }                       // fee: null means "blank in the file" (anomaly missing_fee)
```

`rowsInFile` counts data rows (IBKR: `Trades,Data,*` plus `Deposits & Withdrawals,Data,*` except its `Total` row; Kraken and generic: non-blank lines after the header; MT4: rows whose first cell is an integer ticket in Closed Transactions and Open Trades). Invariant, tested per format: `rowsInFile = rows turned into fills + nonTrade rows + skipped rows`. Keys: IBKR `ibkr:<symbol>|<Date/Time>|<Quantity>|<T. Price>|<Comm/Fee>#<n>` (n = occurrence within the file, so two identical fills in one file stay two); Kraken `kraken:<txid>`; MT4 `mt4:<ticket>:open` and `:close`; generic `gen:<id>` or the IBKR-style hash when `id` is blank.

Format specifics: IBKR ignores every section except `Trades`, `Deposits & Withdrawals` (nonTrade) and `Account Information` (`Base Currency`); `Asset Category` other than `Stocks` is skipped with reason `import.skip.assetClass`. Kraken pairs map `XXBTZUSD → BTC/USD`, `XETHZEUR → ETH/EUR`, `SOLUSD → SOL/USD` (8-character `X…Z…`/`X…X…` codes split 4+4 with the leading `X`/`Z` dropped; `XBT → BTC`, `XDG → DOGE`; otherwise split on a known quote suffix `USD, EUR, GBP, USDT, USDC, JPY, CAD, CHF, AUD`); a row with `margin > 0` is kept and flagged `margin` in `notes`. MT4 emits two fills per closed row (open and close; Commission and Taxes as the close fill's fee, Swap as its `funding`), `contractSize` 100,000 for six-letter currency pairs and 1 otherwise, `quoteToAccount = Profit / ((close − open) × sign × size × contractSize)` (null when the prices are equal), `buy limit`/`sell stop`/… rows with `cancelled` are skipped with `import.skip.cancelled`; `positionId` follows `from #`/`to #` comments back to the first ticket.

### 2.3 Fills to round-trip trades (`src/import/group.js`, `groupFills(fills, { mode, existingKeys, dustRatio = 0.001 }) → { trades, anomalies, matched }`)

1. Drop fills whose `key` is in `existingKeys` (earlier imports); count them as `matched` (AC-P1.10: no question).
2. Group by `positionId` when set, else by `instrument`; sort each group by `time`, then file row.
3. Walk each group with a signed running position. The first fill opens a trade (`side` long for buy, short for sell). Same-direction fills are entry legs (scale-in); opposite fills are exit legs (partial exits). Size reaching zero (relative tolerance 1e-12) closes the trade.
4. A fill that crosses zero is split in two legs at the zero point, fee split pro rata by size; the second part opens a new trade. Both trades get anomaly `flip`.
5. A fill that would open a position but is a close by its source (IBKR `openClose = 'C'`, or a Kraken sell with `margin = 0`, since spot cannot be short) → anomaly `opened_before_file`: answers `use_basis` (IBKR: entry = `basis / size`, the basis already includes the opening fee), `enter_entry_price`, or `exclude`. In MT4 and the generic template a sell with no position opens a short.
6. After the last fill, a remaining size ≤ `dustRatio` × the trade's largest size → anomaly `dust` (answers `close_as_zero`, which sets `trade.writeOffSize` to the remainder, or `keep_open`). A larger remainder is an ordinary open trade, no question.
7. Legs get `quoteToAccount` from the fill, or 1 when `quoteCurrency = accountCurrency`; otherwise anomaly `rate_missing` (one question per currency per import: "rate from EUR to USD for this file?", optional per-trade override).
8. A fee field that is blank (generic) → anomaly `missing_fee`; `feeCurrency ≠ accountCurrency` with no rate → `rate_missing`.
9. When `fileZone` differs from the declared zone, trades closing within |offset difference| + 1 hour of a month boundary in the declared zone → anomaly `tz_edge` (answers `month_before`, `month_after`; the answer sets `closeDayOverride` on the trade).
10. `skipped.length > 0` → anomaly `unreadable_rows` (answers `continue`, `cancel_import`); it holds no trade.
11. Same instrument, side, size and price within 1 second as an earlier import's fill but a different key → anomaly `near_duplicate` (answers `merge`, `keep_both`).

Every anomaly except `unreadable_rows` lists `tradeIds` and puts its id into each trade's `holds`. A trade with a non-empty `holds` is held out (S3). Answering removes the id; `exclude` sets `trade.excluded = { by: 'import', anomalyId }`, the trade stays in the journal, flagged (AC-A2.3).

### 2.4 Fixtures and adding a format

Fixtures live in `tests/fixtures/import/`: `ibkr-activity.csv`, `kraken-trades.csv`, `mt4-statement.htm`, `generic.csv`, each with `<name>.expected.json` (rows, fills, trades with average entry and exit, fees, gross and net in account currency, anomalies by kind and the values after each answer, hand-computed), plus `kraken-overlap.csv` (the BTC fills again under new txids) and `kraken-month-edge.csv` (a close at 22:30 UTC on 31 March). `tests/fixtures/reconcile/cases.json` holds seven reconcile cases built on them: held out, missing fee, kept duplicate, time-zone edge, unexplained, balance form, match within tolerance. Their AAPL/MSFT/TSLA, BTC, EURUSD/USDJPY and KO rows reproduce the trades of `tests/fixtures/stats/core.json` (section 3), so parser and statistics tests share the arithmetic. Two-thousand-row files per format for AC-U2.1 come from `tests/gen/<id>.mjs`, a seeded generator (mulberry32, seed in the file name) that writes the file and its own expected totals from simple arithmetic; generated files are not committed.

Adding a format: one module in `src/import/formats/`, one line in `src/import/registry.js`, one fixture pair, one test file `tests/import/<id>.test.mjs`. No other file changes. Each format is one cloud session (section 11).

## 3. Statistics engine (`src/stats/`, pure, never AI)

### 3.1 Money and context

`ctx = { accountCurrency, minorDigits, tz, dayCutoffHour, smallSampleMin = 30, startBalanceMinor | null }`. `minorDigits` from `new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits`; 2 for a code `Intl` rejects (USDT). `roundMinor(x, d)`: scale by 10^d, round half away from zero with a relative epsilon of 1e-12, return an integer (tests: 1.005 → 101, −2.675 → −268, JPY 0.5 → 1). Per-trade money is rounded once (`netMinor`, `grossMinor`, `feesMinor`, `fundingMinor`, and `netMinor = grossMinor − feesMinor + fundingMinor` holds exactly by computing `netMinor = roundMinor(gross − fees + funding)` and `feesMinor = grossMinor + fundingMinor − netMinor`); every aggregate sums integers. R uses `netMinor / 10^d`.

### 3.2 Functions (`src/stats/index.js` re-exports all)

| Figure | Signature | Definition and edge cases |
|---|---|---|
| S1 | `grossPnl(trade) → number` | Σ over exit legs of (exit price − average entry) × exit size × `contractSize` × exit leg `quoteToAccount`, sign reversed for short. Average entry is size-weighted over entry legs. Open trade → null (no unrealised P&L, S3). |
| S2 | `tradeMoney(trade, ctx) → { grossMinor, feesMinor, fundingMinor, netMinor }` | Fees = Σ leg fee × `feeToAccount`; funding signed (+ received, − paid). Null for an open trade or any leg with a null rate. |
| S3 | `closedSet(trades, { mode, filter }) → { included, excluded: { open, heldOut, userExcluded, otherMode } }` | `filter` = `{ from, to, setup, market, instrument }` on close time. Excluded lists hold trade ids. |
| S4 | `winRate(set) → { value, wins, n }` | wins = netMinor > 0; breakeven is a trade, not a win; `n = 0` → value null. |
| S5 | `avgWinLoss(set) → { avgWin, avgLoss, nWin, nLoss, avgWinR, avgLossR, nWinR, nLossR }` | avgLoss is a positive magnitude; R averages over trades with known R. |
| S6 | `profitFactor(set) → { value, reason }` | reason `no_losses` → value null (UI: "undefined, no losses"); `no_trades` likewise. |
| S7 | `initialRisk(trade, ctx) → { value, reason }` | Σ entry legs \|entry − initialStop\| × size × contractSize × quoteToAccount; reasons `no_stop`, `stop_at_entry`, `stop_profit_side` → value null. |
| S8 | `rMultiple(trade, ctx) → number \| null` | netMinor / 10^d / initial risk, not clipped. |
| S9 | `expectancy(set, ctx) → { r: { value, n, rMissing, byParts }, moneyMinor: { value, n }, smallSample }` | `r.value` = mean R; `byParts` = winRate×avgWinR − lossRate×avgLossR on the same R-known trades (tests assert both agree to 1e-9). Money = mean netMinor (unrounded mean, display rounds). `smallSample` = n < `smallSampleMin`. |
| S10 | `equityCurve(set, ctx) → [{ t, tradeId, equityMinor }]` | Start point at `startBalanceMinor` or 0; ordered by close time, ties by trade id. |
| S11 | `drawdown(curve, ctx) → { maxMinor, maxPct, peak, trough, recovery, currentMinor, currentPct, recoveryGainPct }` | Percents null unless start balance > 0; `recovery` null = "not recovered"; `recoveryGainPct = peak / trough − 1`. |
| S12 | `buckets(set, by, ctx) → [{ key, n, netMinor, winRate, expectancyR, rKnown }]` | `by` ∈ `setup` (`null` key = "No setup"), `market`, `instrument`, `hour`, `weekday` (ISO 1-7) of the first entry leg in `ctx.tz`. |
| S13 | `calendar(set, { year, month }, ctx) → { days: [{ date, netMinor, n }], weeks: [{ start, netMinor }], monthMinor }` | Day of close time in `ctx.tz` shifted by `dayCutoffHour`; `closeDayOverride` wins. Weeks start Monday; a week sums only its days in the month. |
| S14 | `feeTotals(set, ctx) → { feesMinor, fundingMinor, feesR, fundingR, nR }` | R figures = Σ over R-known trades of cost / initial risk. |
| S15 | `streaks(set) → { longestWin, longestLoss, current: { kind, length } }` | Close order; a breakeven trade ends both runs. |
| S16 | `ruleFollowing(set) → { value, followed, marked, unmarked, tradeIds }` | followed / trades with a mark. |
| P4.5 | `compareModes(trades, { from, to, lossWindowMin = 30 }, ctxByMode) → { real, paper, missing }` | Per mode: S16, median risk % of equity at entry (needs a start balance, else null), trades per active day, share of trades opened within `lossWindowMin` of a losing close; each with n and trade ids. `missing` names a mode with no closed trades. |
| A5 | `explain(figureId, set, ctx) → { formulaKey, params, includedIds, excluded: [{ id, reason }] }` | The drill-down; `params` fill the formula sentence; the listed trades sum to the headline (AC-A5.2). |

`sizing.js`: `positionSize({ equity, riskPct, entry, stop, contractSize, quoteToAccount }) → { size, riskAmount }` for the plan helper (domain pack §7 items 9-10); it computes the user's own numbers and never proposes a percent.

### 3.3 Fixtures

`tests/fixtures/stats/core.json` holds ten trades (seven closed real trades across the three markets with fees, a stop-out slipped past the stop, one short, one without a stop, one breakeven; plus one open, one held out, one paper) and every expected S1-S16 value, hand-computed, in declared zone `Europe/Athens`. `tests/fixtures/stats/requirements-cases.json` holds the 12,000 → 9,600 case (20.0%, 25.0%) and the 40% × 2R − 60% × 1R = +0.2R expectancy case, the −1.2R stop slippage, profit factor with no losses and the rounding cases. AC-P3.2 invariants run on 250 trades generated in the test with a seeded generator. Section 9 lists the test files.

## 4. Storage

### 4.1 IndexedDB `trading-journal`, version 1

| Store | keyPath | Indexes | Row |
|---|---|---|---|
| `trades` | `id` | `by_mode_close` [`mode`, `closeTime`], `by_import` `importId` | Trade below |
| `imports` | `id` | `by_time` `createdAt` | `{ id, createdAt, fileName, formatId, fileZone, mode, accountCurrency, rawText, report, anomalies: [Anomaly], matched }` (raw text kept so a fixed parser can re-read it) |
| `reconciliations` | `id` = `<mode>:<from>:<to>` | — | `{ id, mode, from, to, state: 'reconciled'\|'difference_open'\|'skipped'\|'not_asked', broker, oursMinor, differenceMinor, toleranceMinor, explanations, updatedAt }` |
| `plans` | `id` | — | `{ id, name, active, items: [{ id, text }], setups, hours: [{ from, to }], dailyCap, riskPct, dailyLossLimitPct, createdAt }` |
| `reviews` | `id` | `by_time` | Review object (section 5.2) |
| `blobs` | `id` | — | `{ id, type, data: Blob }` screenshots, downscaled to 1600 px JPEG 0.8 |
| `settings` | `key` | — | `{ key, value }`: `lang`, `tz`, `dayCutoffHour`, `accountCurrency.real`, `accountCurrency.paper`, `startBalance.real`, `startBalance.paper`, `smallSampleMin`, `openReminderDays`, `exportReminderEvery`, `thresholds.*`, `ai.engine`, `ai.provider`, `ai.model`, `ai.baseUrl`, `firstRunDone`, `schema.version` |

Trade:
```json
{ "id": "uuid", "mode": "real", "market": "stock", "instrument": "AAPL", "side": "long",
  "contractSize": 1, "quoteCurrency": "USD",
  "legs": [{ "id": "uuid", "kind": "entry", "time": "2026-03-02T08:00:00Z", "zone": "Europe/Athens",
             "price": 50, "size": 30, "fee": 1, "feeCurrency": "USD", "feeToAccount": 1, "quoteToAccount": 1,
             "source": { "importId": null, "row": null, "key": null } }],
  "initialStop": 48, "stopMoves": [{ "time": "…", "price": 49 }], "target": 56, "funding": 0,
  "setup": "breakout", "plan": { "planId": "uuid", "followed": true, "items": { "i1": "ticked" }, "auto": { "hours": "pass" }, "confirmedByUser": true },
  "notes": "", "moodBefore": null, "moodAfter": null, "screenshotId": null, "leverage": null,
  "importId": null, "holds": [], "excluded": null, "writeOffSize": 0, "closeDayOverride": null, "stopAtClose": null,
  "closeTime": "2026-03-02T15:00:00Z", "createdAt": "…", "updatedAt": "…", "entry": "manual" }
```
A trade is closed when Σ entry size = Σ exit size + `writeOffSize` (relative tolerance 1e-12). `closeTime` is denormalised (null while open) for the index. Status, averages and money are derived on read, never stored.

The own key is stored only in `localStorage['trading-journal.ai-key']`, bound to provider and host as in thought-catcher v1.0.1 (G1 fix), never in IndexedDB, so no export can contain it.

Store interface (`createIdbStore(indexedDB)` and `createMemoryStore()`, identical): `trades.{getAll, get, put, putMany, delete}`, `imports.{getAll, get, put}`, `reconciliations.{getAll, put}`, `plans.{getAll, put, delete}`, `reviews.{getAll, put}`, `blobs.{get, put, delete}`, `getSetting(key, fallback)`, `setSetting(key, value)`, `transaction(fn)` for an import (trades + import row in one IDB transaction), `clearAll()`. When IndexedDB is refused, the app runs on the memory store and shows the storage-refused state (D5).

Paper and real are separated by `trade.mode` on every row, one account currency and start balance per mode, `closedSet` filtering by mode first, reconciliation ids prefixed by mode, and an import carrying one mode for all its trades. No function takes trades of both modes except `compareModes`, which returns them in separate objects.

### 4.2 Migrations (`src/storage/migrate.js`, pure)

`MIGRATIONS = [{ to: 1, stores(db, tx) {…}, record: { trades(r) → r, … } }]`. `openDb` runs `stores` for every `to` in (`oldVersion`, `DB_VERSION`] inside `onupgradeneeded`, then rewrites records with each `record` function in order. `migrateExport(json) → json` applies the same `record` functions to an export file from `version` up to current. Rules: a migration never deletes a field it does not understand; each migration has a fixture of the previous version and a test that every trade's `netMinor` and R, and every S1-S16 figure, are unchanged (AC-P8.4). The test injects a synthetic `to: 2` migration (renames `leverage` to `leverageUsed`) to prove the chain on v1 data; the IDB path is exercised in `e2e/migration.mjs` (seed a v1 database, reopen with the injected v2).

### 4.3 Export and import file

```json
{ "format": "trading-journal-export", "version": 1, "exportedAt": "ISO", "appVersion": "1.0.0",
  "settings": { "…": "all settings except ai key" }, "trades": [], "imports": [], "reconciliations": [],
  "plans": [], "reviews": [], "blobs": [{ "id": "…", "type": "image/jpeg", "dataUrl": "data:image/jpeg;base64,…" }] }
```
`parseExport` is all-or-nothing (not JSON, wrong `format`, `version` above current, or any invalid trade → message, no writes); an older `version` goes through `migrateExport`. Merge by `id`: new rows added, existing ids kept, "added N, kept M". A test asserts the serialised export never contains the key string. File name `trading-journal-YYYY-MM-DD.json`. The import report (A4) also saves alone as `import-report-<file>-<date>.json` and as a printable HTML view.

## 5. The agents

### 5.1 Import and reconcile agent (the angle, K1): code only

It does the user's checking work: reads the file, builds trades, finds what does not add up, asks one question per anomaly, holds affected trades out, compares with the broker's own total and names the trades that explain a difference. Every number, question and explanation comes from code and fixed templates in both languages. No model is involved at any step, so no model can change a money figure.

```js
// src/import/run.js
runImport({ text, fileName, formatId?, fileZone, mode, accountCurrency, declaredZone, existingKeys, now })
  → { importRecord, trades, report }            // report: { rowsInFile, rowsRead, tradesBuilt, matched, skipped, nonTrade, anomalies, period: { from, to } }
answerAnomaly(importRecord, trades, anomalyId, { optionId, value? }) → { importRecord, trades }   // pure; value = rate, entry price
// src/import/reconcile.js
reconcile({ trades, mode, period, broker, toleranceMinorPerTrade = 1, ctx })
  → { state, oursMinor, brokerMinor, differenceMinor, toleranceMinor, explanations: [Explanation], unexplainedMinor }
// broker: { kind: 'net_pnl', valueMinor } | { kind: 'balance', startMinor, endMinor, flowsMinor }
// Explanation: { cause: <anomaly kind holding the trade> | 'duplicate' | 'tz_edge', tradeIds, amountMinor, anomalyId }
```

Rules: difference = broker − Σ netMinor of the period's included closed trades (balance form: end − start − flows first, AC-A1.4); match when |difference| ≤ tolerance × closed trades. Explanation search. Candidates with a known amount: a held-out trade adds the netMinor it would have (`dust` as if closed at zero, `opened_before_file` from IBKR `realizedPnl`, `flip` as split; `rate_missing` has no amount and is never a candidate); a near-duplicate answered `keep_both` subtracts its netMinor (cause `duplicate`); a `tz_edge` trade placed outside the period by its answer adds its netMinor. Find the smallest subset (size ≤ 3, at most 24 candidates) whose sum equals the difference within tolerance. A `missing_fee` trade is a range candidate, from its netMinor with blank fees as 0 down to that minus 1% of its notional; if no exact subset exists, a subset that includes it and leaves the difference inside its range names it with the implied fee. Otherwise `unexplainedMinor` = difference and the screen says "unexplained difference of X", listing nothing (AC-A3.2). The explanation is shown, never applied: amounts are never folded into fees or any figure. After any answer, `reconcile` reruns (AC-A3.3). Paper mode never calls `reconcile` (AC-P4.4). Events on `ctx.bus`: `import-progress { done, total }` every 200 rows (AC-U2.1 progress), `import-done { importId }`, `anomaly-answered { anomalyId }`, `reconcile-changed { id, state }`.

### 5.2 Review agent (P5): code decides, AI may phrase

```js
// src/review/run.js
runReview({ trades, plans, settings, mode, period, lang, now }, { engine, bus }) → Promise<Review>
// Review
{ id, mode, period, createdAt, lang, engine: 'rules'|'on-device'|'own-key', engineNote,
  left: { open, heldOut, userExcluded },
  processOutcome: { followed: { n, avgR, rKnown, tradeIds }, offPlan: { … }, unmarked },
  findings: [{ id, pattern, n, tradeIds, facts: { …numbers }, threshold: { value, from: 'plan'|'default' },
               text, textBy: 'rules'|'model', question }],
  checked: ['rule_break','loss_chase','overtrading_day','size_creep','stop_moved','stop_missing','disposition','outside_hours'],
  noPattern: false }
```

| Step | Who | Detail |
|---|---|---|
| Choose trades, compute every pattern, n, trade ids, facts, thresholds | code, `src/review/patterns.js` | Signals of domain pack §3: rule breaks (plan mark false), loss chase (entry within `thresholds.lossWindowMin` = 30 of a losing close and risk > 1.2 × own median), overtrading day (> 2 × own median trades per active day, or above the plan cap), size creep (risk > 1.5 × own median of the previous 20), stop moved away or missing, disposition (winners' realised R < 0.5 × planned R in most winners, and losers held longer than winners), outside plan hours. Thresholds are settings labelled "your rule, adjustable". A finding with no trade ids is dropped (AC-P5.2). |
| Rule sentence and open question per finding | code, `src/review/templates.js` (EN and EL) | Fixed templates, numbers formatted by locale. Always produced; they are the fallback. |
| Rewording | model, optional | Input per finding `{ id, pattern, facts, ruleText, lang }`; output `{ "items": [{ "id": "f1", "text": "…" }] }`. The model sees facts and the rule sentence, never raw trades or notes. |
| Guard every sentence | code, `src/review/guard.js` | Below. A failing model sentence is replaced by the rule sentence and the finding shows `textBy: 'rules'`. |

Engine ladder (reuses thought-catcher §5 of spike-b2): 1. own key when set and online (Anthropic Messages or OpenAI-compatible; `src/ai/http.js`, `anthropic.js`, `openai.js` copied from thought-catcher, default model `claude-haiku-4-5-20251001`); 2. on-device WebLLM `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` in a module worker when `navigator.gpu` gives an adapter with `shader-f16` and the user agreed to the 830 MB download; 3. rules. For Greek (`lang = 'el'`) rung 2 is skipped and rules write the review unless L4 rates the model's Greek on the three seeded weeks as acceptable (F4): the B2 spike measured English only. Each review and the review screen show the engine (AC-P5.7, AC-P9.3). Engine state events on `bus`: `ai-state { engine, state: 'ready'|'downloading'|'unavailable'|'failed', progress }`. A load watchdog of 150 s turns a silent WebLLM hang into `failed` (B2 §3).

Boundary in code (AC-P5.4-P5.6, AC-B1.1):
- `guard.check(sentence, lang) → { ok, hits: [ruleId] }` with rule lists per language in `src/review/banned.js`: instructions (`\b(buy|sell|hold|avoid|close|short|go long|size up|increase|reduce|move your stop|cut|add to)\b` addressed to the user, `\byou should\b`, `\bconsider\b`, `\btry\b`, `\bneed to\b`, `\bmust\b`; EL `αγόρασ`, `πούλησ`, `κράτα`, `απόφυγ`, `κλείσ`, `πρέπει να`, `θα έπρεπε`, `δοκίμασε`, `σκέψου`), predictions (`\bwill (go|rise|fall|drop|recover|win|lose)\b`, `\bexpect\b`, `\blikely to\b`; EL `θα (ανέβ|πέσ|ανακάμψ|κερδίσ|χάσ)`, `αναμέν`), promises (`guarantee`, `risk-free`, `sure`, `certain`; EL `εγγυ`, `χωρίς ρίσκο`, `σίγουρ`), preference (`better for you`, `best (setup|time|market|instrument) for you`, `do more`, `your edge`; EL `καλύτερ… για σένα`, `περισσότερ…`), person labels (`you are a`, `you're a`, `revenge trader`, `gambler`; EL `είσαι (ένας|μια)?`), readiness (`ready for real`, `ready to trade real`; EL `έτοιμ`), study benchmarks (`Barber`, `Odean`, `study shows`). The rule templates are written to pass these lists; the lists are tested against the rule templates, the learn entries, the About text and every catalogue string (catalogue keys under `label.side.*` are exempt from the instruction list only, so "Buy"/"Sell" as a side label pass).
- `guard.numbersMatch(text, facts, lang) → boolean`: every number in the model text (locale parsing, `%`, `R`) must equal a value in `facts` after the same formatting; any extra number drops the model sentence (AC-P5.6).
- `guard.entitiesMatch(text, facts)`: an upper-case token of 2-10 letters, or a pair like `EUR/USD`, must be an instrument in `facts`.
- Length ≤ 280 characters; the question keeps the rule template's question (the model never writes the question).
- Tests: `tests/review/guard.test.mjs` (lists, both languages), `tests/review/noAdvice.test.mjs` (three seeded losing weeks, one per market, rules and a stub model that emits every banned class, a wrong number and an invented ticker; each output passes or falls back), `tests/review/stubModel.test.mjs` (garbage, timeout, invalid JSON leave figures and findings unchanged, AC-P9.4).

### 5.3 Sentence entry (P1.5): code parses, AI may add setup and notes

`src/sentence/parse.js`: `parseSentence(text, { lang, setups, instruments, now }) → { fields: { side, size, instrument, market, entry, stop, target, fees, setup, time }, missing: ['entry'], unreadable: [] }`. Grammar: side words (`bought|buy|long|sold|sell|short`, `αγόρασα|αγορά|πούλησα|πώληση|long|short`), a number followed by an instrument token, `at|@|στα|στο|στις` + price, `stop|sl|στοπ` + price, `target|tp|στόχος` + price, `fee|fees|προμήθεια` + amount, remaining words matched to the user's setups; decimals `0,2` and `0.2`, thousands `60.000`/`60,000` read by position (a group of exactly three digits after the separator with another separator or none, and `lang` decides). Market: six-letter currency pair → forex, a crypto list (`src/sentence/crypto.js`, top 50 tickers) → crypto, else stock. A model (engine ladder) may only fill `setup` and `notes` from free words; if it returns a number field that differs from the code field, the confirm screen shows both and uses the code value until the user picks (AC-P1.6).

### 5.4 Plan checks and learn layer

`src/plan/check.js`: `evaluatePlan(trade, plan, { sameDayTrades, equityAtEntryMinor, tz }) → { auto: { hours, dailyCap, risk, stop, setup }, suggestedFollowed }` with values `pass|fail|unknown`. `src/learn/`: `entries.en.js`, `entries.el.js` (T1-T25 plus the paper-trading limits and the ESMA base-rate entry, wording from the lawyer review), `learn.explain(figureId, explainResult, lang) → { title, plain, formulaWithNumbers }`. Learn text is authored, not generated; the user's numbers are filled by code from `explain()`.

## 6. PWA, offline, CSP, i18n

- Manifest `manifest.webmanifest`: `name` "Trading Journal", `short_name` "Journal", `id` `./`, `start_url` `./#/home`, `scope` `./`, `display` `standalone`, icons 192, 512, maskable 512, `apple-touch-icon` 180 (generated by `tools/make-icons.mjs`, copied from thought-catcher and redrawn from L2d's SVG), shortcut "Log a trade" → `./#/trade/new`.
- `sw.js` from thought-catcher: `VERSION = 'tj-v1'` bumped on every release; `SHELL` lists every file the page loads and `tests/shell/pwa.test.mjs` fails when a file under `src/`, `css/`, `icons/`, `fonts/` is missing from it; `tools/shell-list.mjs` regenerates the list; caches kept across releases: `tj-cdn` (pinned jsDelivr) and WebLLM's own caches; provider requests and non-GET never intercepted.
- CSP meta: `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob: https://cdn.jsdelivr.net; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'`. `connect-src https:` is needed for a user-chosen OpenAI-compatible host and the model download; `worker-src` includes jsDelivr (B2 §3: without it WebLLM hangs silently). No inline styles; `element.style` from script where needed. User text only through `textContent`.
- Network allowlist, asserted by `e2e/smoke.mjs`: same origin always; the own-key host only when set; `cdn.jsdelivr.net`, `huggingface.co` and its redirect CDN, `raw.githubusercontent.com` only after the user consents to the model download, and those requests carry no journal data (F2 on AC-P8.2 wording).
- Offline: after first load everything except model download and own-key calls works; `navigator.onLine` false shows the offline state; `navigator.storage.persist()` on first real data write, refusal shown (AC-P8.5).
- i18n: `src/i18n/i18n.js` exports `t(key, params)`, `setLang(lang)`, `onLang(fn)`; catalogues are split by owning shard, `src/i18n/{en,el}/{shell,data,coach}.js`, each a flat `{ key: 'text' }` with `{name}` placeholders and plural forms `{n, plural, one {…} other {…}}` resolved with `Intl.PluralRules`. `tests/shell/i18n.test.mjs` fails when a key exists in one language only or a placeholder differs. Language switch re-renders the current view with no reload (AC-P7.1). Latin-term list for Greek (AC-P7.3): `R`, `pip`, `lot`, `stop`, `spread`, `funding`, `swap`, `long`, `short` stay Latin; everything else is translated.
- Formats (`src/i18n/format.js`): locale `en-GB` or `el-GR` (English follows `navigator.language` when it starts with `en`); `money(minor, ccy, { sign })` with `Intl.NumberFormat` currency and `signDisplay: 'exceptZero'`; `num`, `pct` (one decimal), `r` (`+1.48R`, two decimals), `date`, `time`, `dateTime` in the declared zone. The arrow and sign carry gain and loss besides colour (AC-D1.1).

## 7. Market data

None. No view needs prices: requirements exclude live prices and market charts, every figure comes from the user's fills, and currency conversion uses the rate stored per leg (from the file, MT4's implied rate, or the one the user types). A price or FX feed would also break the AC-P8.2 network rule.

## 8. Sync and sharing (later rung, design only)

- Rung 1, no server: "share a snapshot" exports a filtered, read-only file (chosen period and mode, notes and screenshots optional); the receiver opens it in a separate read-only view, never merged into their journal. Transport is the user's own channel.
- Rung 2, device to device: the export encrypted with a passphrase (Web Crypto AES-GCM, PBKDF2 600,000 iterations) and moved by file or QR chunks; merge by `id` and `updatedAt` (last write wins per trade, conflicts listed).
- Rung 3, a relay, only if rungs 1-2 fail users: a Cloudflare Worker with KV on the free tier storing ciphertext only for 24 hours. Justification needed then: no journal data readable server-side, no account, cost 0. Not built, and nothing in the UI suggests it (AC-P8.7).

## 9. Tests

- Unit, `npm test` = `node --test 'tests/**/*.test.mjs'` (Node 22 expands the glob; a directory argument does not work, thought-catcher finding). Files by owner: `tests/core/{money,time,model}.test.mjs`, `tests/import/{csv,htmlTable,group,checks,reconcile,run,<format id>}.test.mjs`, `tests/stats/{s01-s08,s09-s11,s12-s16,invariants,compare,explain}.test.mjs`, `tests/storage/{memory,migrate,export}.test.mjs`, `tests/plan/check.test.mjs`, `tests/review/{patterns,guard,noAdvice,stubModel,templates}.test.mjs`, `tests/sentence/parse.test.mjs` (40 phrases, half Greek), `tests/ai/{adapter,providers}.test.mjs` (mocked `fetch`), `tests/learn/entries.test.mjs`, `tests/shell/{i18n,pwa,static,strings-boundary}.test.mjs`. `strings-boundary` runs `guard.check` over every catalogue string, template, learn entry and the About text in both languages (AC-B1.1).
- Headless flows, `node e2e/<flow>.mjs`, zero dependencies, `e2e/lib/cdp.mjs` from thought-catcher with a `gpu` option (B2: `--disable-gpu` removes the WebGPU adapter), run outside the Bash sandbox: `smoke` (log a manual trade, statistics, reload, offline, network allowlist), `import` (each format fixture, report, anomaly questions, broker total, explanation, AC-A1-A4), `roundtrip` (export, clear, import, identical S1-S16, AC-P3.5), `migration`, `persona-u1`, `persona-u2`, `persona-u3` (AM3 scripts for V2 and MV), `timing` (AC-P1.1 30 s and AC-U2.1 10 s with visible progress).
- Test scenes: `?scene=<name>` loads `e2e/scenes/<name>.json` into the memory store and fixes the clock, only when `location.hostname` is `127.0.0.1` or `localhost`. One scene per D5 state (AC-D5.1 list) plus the populated dashboard.
- Visual check for L4, `node e2e/visual.mjs [scene …]` (from `design/tools/shoot.mjs`): CDP `Emulation.setDeviceMetricsOverride` at 390x844 and 360x800, `deviceScaleFactor` 2, `prefers-color-scheme` light and dark, every scene; writes `e2e/.out/screens/<scene>-<w>x<h>-<theme>.png` and `e2e/.out/visual.json` with, per shot: horizontal overflow (`scrollWidth − innerWidth`), clipped text (elements with `scrollWidth > clientWidth` and hidden overflow), touch targets under 44 px, text contrast under 4.5:1 and chart marks under 3:1 (computed colours against the resolved background), smallest chart label size, default-looking controls (`appearance` not `none` on inputs and selects), untranslated strings in `el` (text nodes matching an English catalogue value). Exit 1 on any finding; the PNGs go side by side with L2d's `design/screens/`.

## 10. Build split: three shards, disjoint write paths

| Shard | Owns (write) |
|---|---|
| S1 shell, design system, i18n, navigation, settings, about, dashboard | `index.html`, `manifest.webmanifest`, `sw.js`, `css/**`, `fonts/**`, `icons/**`, `tools/**`, `src/app.js`, `src/ui/{router,routes,dom,bus,ctx}.js`, `src/ui/components/**`, `src/ui/charts/**`, `src/ui/views/{home,settings,about,firstRun}.js`, `src/i18n/i18n.js`, `src/i18n/format.js`, `src/i18n/{en,el}/shell.js`, `src/about/**`, `tests/shell/**`, `e2e/lib/**` |
| S2 data layer, import, statistics, journal screens | `src/core/**`, `src/import/**`, `src/stats/**`, `src/storage/**`, `src/ui/views/{journal,trade,tradeForm,import,reconcile,stats,calendar,drill,dataSettings}.js`, `src/i18n/{en,el}/data.js`, `tests/{core,import,stats,storage}/**`, `tests/fixtures/{import,stats,reconcile}/**`, `tests/gen/**` |
| S3 plan, review agent, AI, sentence entry, learn | `src/plan/**`, `src/review/**`, `src/ai/**`, `src/sentence/**`, `src/learn/**`, `src/ui/views/{plan,checklist,review,learn,sentence,aiSettings}.js`, `src/i18n/{en,el}/coach.js`, `tests/{plan,review,ai,sentence,learn}/**`, `tests/fixtures/review/**` |

Not owned by a shard: `docs/**` (architect), `design/**` (L2d), `e2e/*.mjs` and `e2e/scenes/**` (L4), `README.md` (L6). `package.json`, `LICENSE`, `.gitignore`, `.nojekyll` are fixed; no shard edits them.

Shared contracts (signatures fixed here; each shard codes against them before the other lands):
- S1 provides `ctx` to every view: `{ store, bus, t, fmt, lang, mode, setMode(mode), settings: { get(key, fb), set(key, v) }, navigate(hash, state?), ui }`. Views export `render(root, ctx, params) → cleanup | void`; `routes.js` maps `#/home`, `#/journal`, `#/trade/new`, `#/trade/:id`, `#/import`, `#/import/:id`, `#/reconcile/:id`, `#/stats/:tab`, `#/calendar`, `#/drill/:figure`, `#/plan`, `#/review`, `#/review/:id`, `#/learn/:term`, `#/sentence`, `#/settings`, `#/about`. `bus` is an `EventTarget` with events `trades-changed`, `mode-changed`, `lang-changed`, `ai-state`, `import-progress`, `import-done`, `anomaly-answered`, `reconcile-changed`.
- S1 `ui` components: `button({ label, kind, onClick })`, `field({ label, type, value, inputmode, error, onInput })`, `segmented({ options, value, onChange })`, `sheet({ title, content, actions })`, `listRow({ title, meta, value, tone, onClick })`, `figure({ labelKey, value, n, note, tone, onOpen })`, `modeBadge(mode)`, `stateBanner({ kind, text, action })`, `emptyState({ title, text, actions })`, `progress({ value, label })`, `toast(text)`. Charts: `lineChart({ points: [{ x, y }], zeroLine, shadeBelowPeak, formatY })`, `underwaterChart({ points })`, `barList({ rows: [{ label, value, n }], formatValue })`, `calendarGrid({ year, month, days, onDay })`. All return DOM nodes.
- S2 step 0 provides helpers the cloud sessions import: `src/import/csv.js` `parseCsv(text, { delimiter }) → { rows, delimiter }` (RFC 4180, BOM, CRLF, `,` or `;` detected); `src/import/htmlTable.js` `htmlRows(html) → [{ cells: [{ text, title, colspan }] }]` (no DOM); `src/core/money.js` `parseDecimal(str, decimal = '.')`, `roundMinor(x, digits)`, `minorDigits(ccy)`; `src/core/time.js` `zonedToUtc(localIsoNoOffset, zone) → isoZ` (IANA names and `ny+7`), `localParts(isoUtc, zone, cutoffHour = 0) → { date, hour, weekday }`; `src/import/registry.js` `formats`, `detectFormat(text)`.
- S2 provides `store` (section 4.1), `stats` (section 3.2), `runImport`, `answerAnomaly`, `reconcile` (5.1), `openTradeForm(ctx, draft)`, `renderDataSettings(root, ctx)`, `getSummary(ctx) → { mode, netMinor, curve, expectancy, reconcileState, counts: { open, heldOut, excluded } }` for the dashboard.
- S3 provides `runChecklist(ctx, draft) → Promise<planMark | null>` (called by S2's trade form), `evaluatePlan` (5.4), `parseSentence` (5.3), `runReview` (5.2), `latestReview(ctx) → Review | null` for the dashboard, `renderAiSettings(root, ctx)`, `learn.explain` (5.4), `guard` (5.2).

Order: S2 step 0 (local seat, first 30-40 minutes) commits `src/core/{model,money,time}.js`, `src/import/{csv,htmlTable,registry}.js` with tests (the fixtures of 2.4 and 3.3 are already in the repo from L2), and pushes; the cloud sessions of section 11 start from that commit. S1, S3 and the rest of S2 run in parallel from the start.

## 11. Lanes

Cloud sessions (AM4): one per task, `claude --cloud "<text>"` from the repo, each text = "Build per docs/cloud/<file>.md". Each spec file in the repo names the files the session owns, the contract, the fixtures and the done command, and says the session may read the whole repo but writes only its own files.

| Session | Spec | Owns | Done |
|---|---|---|---|
| C1 | `docs/cloud/C1-ibkr.md` | `src/import/formats/ibkr-activity.js`, `tests/import/ibkr-activity.test.mjs`, `tests/gen/ibkr-activity.mjs` | `node --test tests/import/ibkr-activity.test.mjs` exits 0 |
| C2 | `docs/cloud/C2-kraken.md` | `…/kraken-trades.*` equivalents | `node --test tests/import/kraken-trades.test.mjs` |
| C3 | `docs/cloud/C3-mt4.md` | `…/mt4-statement.*` equivalents | `node --test tests/import/mt4-statement.test.mjs` |
| C4 | `docs/cloud/C4-generic.md` | `…/generic-csv.*` equivalents, `docs/generic-template.csv` | `node --test tests/import/generic-csv.test.mjs` |
| C5 | `docs/cloud/C5-stats.md` | `src/stats/**`, `tests/stats/**` | `node --test 'tests/stats/**/*.test.mjs'` |
| C6 (after L3) | `docs/cloud/C6-greek.md` (written by S1 when the English catalogues are final) | `src/i18n/el/**`, `src/learn/entries.el.js` | `node --test tests/shell/i18n.test.mjs tests/shell/strings-boundary.test.mjs` |

Each branch is reviewed as a diff by the S2 seat (S1 for C6) and its tests are run locally before merge (AM4).

Local model (AM5, oMLX, a Claude seat reviews every output before commit): first drafts of the 25 learn entries T1-T25 in English and Greek (S3 reviews against domain pack §4.4 and the guard); the 40 sentence-entry test phrases in both languages (S3); format-noise variants of each import fixture (BOM, CRLF, semicolons, extra columns, blank lines, quoted commas) with the transformation named per file (S2). Not for the local model: the hand-computed expected values and the 2,000-row generators, which must stay exact.

## 12. Risks

| # | Risk | Fallback |
|---|---|---|
| R1 | A real broker file differs from the sampled layout (IBKR field set, MT4 localisation, Kraken new columns). | Parsers find columns by header name, not position; unknown columns ignored; an unmatched file offers the generic template; Q2 in requirements asks Ion for real exports. |
| R2 | IBKR statement time zone assumption is wrong. | The zone is asked on import, prefilled, editable; `tz_edge` catches period-edge effects; re-import with another zone replaces the import's trades (raw text is kept). |
| R3 | Users skip the broker total (PICK R2). | Reconcile is inside the import flow, skippable with one tap; dashboard shows "not reconciled" per period until answered (AC-A1.3). |
| R4 | The explanation search misattributes a difference. | Subset search capped and exact within tolerance; the result is labelled as a possible cause with trade links; nothing is applied to figures. |
| R5 | On-device model too big or absent on phones (B2: 830 MB, 1.6 GB GPU memory, phones unverified). | Rules write every review; the model only rewords; the engine and its state are always shown. |
| R6 | Greek model wording poor. | Greek uses rules unless L4 accepts the model's Greek (F4). |
| R7 | A banned phrase passes the guard. | Rule templates are the default text; the guard lists are tested on a stub model emitting each class; L4 adds any phrase found in manual reading to `banned.js` and its tests. |
| R8 | 2,000-row imports block the UI on a phone. | Parse and group in chunks with `await` between 200-row batches and progress events; a Worker is the next step if `timing` fails. |
| R9 | iOS evicts site data. | `storage.persist()`, export reminder every 50 trades, About advice. |
| R10 | Float error in money. | One rounding point per trade, integer sums, rounding tests including half cases. |
| R11 | Cloud sessions blocked (pty, GitHub connection, credit). | The same spec files are self-contained, so an S2 seat builds them locally in the same order. |
| R12 | Shards collide on shared files. | Section 10 ownership; catalogues split per shard; `sw.js` list regenerated by S1 at the end by script. |
