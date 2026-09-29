# Trading journal: architecture

Phase `nexa-build-trading-journal-2026-09-29-L2`, owner `aios-saas-architect`. Inputs: `BRIEF-TEAM.md` (P1-P10, Boundary, AM4, AM5), `PICK.md` K1-K4, `requirements.md` at commit `c1510c2d` (L1b: criteria `AC-*`, figures `S1`-`S18`, angle items `A1`-`A5`), `legal-review.md` (§2 phrasing rules, W1-W10, §4 texts, §5 data facts), `domain-pack.md`. Reused from thought-catcher (repo `~/Εγγραφα/thought-catcher`, same author, MIT): the no-build PWA shell, `sw.js` versioning, the IndexedDB store pattern, the AI adapter (`src/core/ai/http.js`, `anthropic.js`, `openai.js`), `e2e/lib/cdp.mjs`, `design/tools/shoot.mjs`, `tools/make-icons.mjs`, and the B2 on-device model results (`projects/thought-catcher/docs/spike-b2.md`). Repo: `~/Εγγραφα/trading-journal` → `github.com/ionvovos/trading-journal`, GitHub Pages at `https://ionvovos.github.io/trading-journal/`.

## 1. Stack

| # | Decision | Reason |
|---|---|---|
| D1 | Plain ES modules, HTML and CSS, no build step, no npm dependencies. The repo root is the site. | Pages serves the repo as-is; cloud sessions and seats need no install; `node --test` imports the pure modules directly. Thought-catcher shipped this way and its B2 spike loaded WebLLM as an ES module with no bundler. |
| D2 | Hash routing, all URLs relative. | Works under `/trading-journal/` with no 404 fallback. |
| D3 | Charts are hand-written SVG in `src/ui/charts/`, no chart library. | Four chart types (line, underwater area, bars, calendar grid); D4 needs every mark styled from the design tokens; CSP `style-src 'self'`; no third-party script on the statistics path. |
| D4 | Prices and sizes are stored as decimal strings exactly as in the source. Sizes and quantities are added and compared exactly (`src/core/decimal.js`, BigInt scaled to 18 places). P&L arithmetic runs in binary64 and becomes integer minor units at one rounding point per trade (section 3.1). | Money rules of requirements P3: exact storage, at least 8 decimals for crypto size; a position is zero or not by exact arithmetic; a displayed total equals the sum of displayed rows. |
| D5 | Pure modules (`src/core`, `src/import`, `src/stats`, `src/plan`, `src/review`, `src/sentence`, `src/learn`, `src/i18n`, `src/storage/memory.js`, `src/storage/migrate.js`, `src/ai/*` except the worker) import nothing from the DOM; clock and `fetch` are injected. | Node tests with no DOM and no network. |
| D6 | No server, no account, no paid service, no analytics, no tracking storage (AC-P8.8). Read-only exchange API keys are **not** adopted. | Private exchange endpoints need a signed secret in the browser and are not CORS-enabled for third-party origins; file import covers P1; B1 asks for no credentials. |

Third-party code (install-gate per-task exception, as in thought-catcher: runtime dependencies loaded by the end user's browser after consent, none runs on Ion's machine):

| Item | Source | Licence | Pin | Path | Gate note |
|---|---|---|---|---|---|
| WebLLM | npm `@mlc-ai/web-llm`, github.com/mlc-ai/web-llm | Apache-2.0 | 0.2.85 | not vendored: `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm`, imported only inside `src/ai/worker.js` after consent; cached by the SW in `tj-cdn` | Same pin and licence check as thought-catcher B2 (2026-09-29). Weights (829 MB) cannot live in a Pages repo; the pinned jsDelivr URL is immutable. |
| Qwen2.5-1.5B-Instruct-q4f16_1-MLC weights | huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC | base model Apache-2.0 | WebLLM 0.2.85 prebuilt entry | Hugging Face, fetched by WebLLM into Cache Storage | Same as B2. |
| WebLLM model library `.wasm` | raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs | not declared (B2 finding F5, still open) | fixed by the 0.2.85 config | fetched by WebLLM | L4 security re-checks; if it stays undeclared the About page names it. |
| Fonts | only if L2d picks one: self-hosted OFL/Apache font files under `fonts/` | OFL or Apache | file hash in `fonts/README.md` | vendored | No font CDN (AC-P8.2). |

No other library. Parsers, CSV and HTML table reading, decimal and time-zone arithmetic (`Intl`), charts and tests are own code.

## 2. Import formats

### 2.1 Named formats (one per market, plus a generic template)

| Id | Market | Source file | Format source | Time zone | Broker figures in the file |
|---|---|---|---|---|---|
| `ibkr-activity` | stocks | Interactive Brokers Activity Statement, CSV download | Header row `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code`; only `DataDiscriminator = Order` rows are fills (https://www.macroption.com/interactive-brokers-statements-database/ via search summary; public sample https://github.com/volodymyr-kovtun/Pitly/blob/main/samples/sample-activity-statement.csv, MIT, read 2026-09-29). Many sections in one file; column 1 is the section, column 2 `Header`/`Data`/`SubTotal`/`Total`. `Date/Time` looks like `"2026-03-02, 10:00:00"`. | Statement time, US Eastern by IBKR's statement cutoffs (https://www.ibkrguides.com/clientportal/performanceandstatements/statements.htm). **Unverified on a real file**: asked once per broker account, prefilled `America/New_York`. | `Comm/Fee` (negative = cost), `Realized P/L` and `Basis` on closing rows. |
| `kraken-trades` | crypto | Kraken → History → Export → Trades, CSV | Columns `txid, ordertxid, pair, time, type, ordertype, price, cost, fee, vol, margin, misc, ledgers`; one row per fill (https://support.kraken.com/articles/360001184886-how-to-interpret-trades-history-fields, read 2026-09-29; sample https://github.com/dcdpr/taxcount/blob/main/references/kraken-tests/trades.csv). | UTC (stated by Kraken), no question. | `fee`, always shown in the quote currency even when deducted in base (same page). No realised P&L. |
| `mt4-statement` | forex | MetaTrader 4 → Account History → "Save as Report" / "Save as Detailed Report" (HTML; MT4 has no CSV export: https://www.metatrader4.com/en/trading-platform/help/overview/terminal/terminal_account_history) | Table after `Closed Transactions:` with columns `Ticket, Open Time, Type, Size, Item, Price, S / L, T / P, Close Time, Price, Commission, Taxes, Swap, Profit`; `balance` rows are deposits and withdrawals; the ticket cell's `title` holds the order comment (`to #1005`, `from #1004` on partial closes); table `Open Trades:`; `Summary:` with `Deposit/Withdrawal`, `Closed Trade P/L`, `Balance`; space thousands separator (`10 000.00`); times `2025.12.19 09:53:33`; account currency from `Currency: USD`. Layout checked on a real statement (github.com/fujunzibo/mt4 `test/DetailedStatement2.htm`, no licence, read only, not copied). | Broker server time, not in the file: asked once per broker account; options any IANA zone or `ny+7` (New York time plus 7 hours, the common "UTC+2 winter, UTC+3 summer" server clock). | `Commission`, `Taxes`, `Swap`, `Profit` in account currency. |
| `generic-csv` | any | The app's own template, downloadable from the import screen | Header `time,type,instrument,market,side,size,price,fee,fee_currency,quote_currency,amount,currency,contract_value,id,stop,setup,notes`; only `time`, `instrument`, `side`, `size`, `price` required for a trade row. `type` trade (default), `funding`, `deposit`, `withdrawal`, `cash` (other cash items). `time` ISO 8601 with offset. `fee` blank = missing (anomaly), `0` = no fee. `contract_value` for crypto contracts such as perpetual swaps. Delimiter `,` or `;`, decimal `.` or `,` detected per file. | From the offset in each `time`. | Whatever the user put in `fee` and `amount`. |

Deferred, named for later rungs: IBKR Flex Query CSV (its field set is chosen by the user per query; names not verified on a real query), Binance (order-history column names not confirmed, domain pack F1), MT5 HTML report, Trading 212 CSV, Kraken ledger CSV (would give funding and transfers per asset).

### 2.2 Parser contract (`src/import/formats/<id>.js`)

```js
export const format = {
  id: 'kraken-trades', market: 'crypto', labelKey: 'import.format.kraken', statesZone: true,   // false → ask once per account
  detect(text) → number,                       // 0..1; registry picks the highest ≥ 0.6, else asks the user
  parse(text, { fileZone, accountCurrency }) → ParseResult,
};
// ParseResult
{ rowsInFile, fills: [Fill], cash: [{ row, kind: 'deposit'|'withdrawal'|'other', amount: '1000', currency, time, key }],
  funding: [{ row, instrument, time, amount: '-1.50', currency, key }],
  skipped: [{ row, reasonKey, raw }], openAtEnd: [Fill],            // MT4 "Open Trades" rows
  fileSummary: null | { closedPnl, deposits, balance, currency },   // MT4 only; a cross-check, never the broker figure
  accountCurrency: 'USD' | null, sizeStep: '0.00000001' }            // smallest quantity step seen: default dust threshold
// Fill: one execution, already in UTC. Prices, sizes and money are decimal strings as in the file.
{ key, time: '2026-03-04T21:30:00.100Z', instrument: 'BTC/USD', market: 'crypto', side: 'buy'|'sell',
  size: '0.05', price: '60000', fee: '3' | null, feeCurrency: 'USD', quoteCurrency: 'USD', contractSize: '1',
  positionId: null | '1004',            // MT4 ticket chain root; null = group by instrument
  openClose: null | 'O' | 'C',          // IBKR Code
  broker: null | { realizedPnl, basis, commission, taxes, swap, profit },   // figures the broker states for this fill
  stop: null | '1.08', stopSource: null | 'file_at_close' | 'file_initial', target: null,
  quoteToAccount: null | number,        // MT4: implied from Profit; others null (rate from account or anomaly)
  setup: null, notes: null, row: 12 }
```

`rowsInFile` counts data rows (IBKR: `Trades,Data,*` plus `Deposits & Withdrawals,Data,*` except its `Total` row; Kraken and generic: non-blank lines after the header; MT4: rows whose first cell is an integer ticket in Closed Transactions and Open Trades). Invariant tested per format: `rowsInFile = rows turned into fills + cash rows + funding rows + skipped rows`. Keys: IBKR `ibkr:<Symbol>|<Date/Time>|<Quantity>|<T. Price>|<Comm/Fee>#<n>` (n = occurrence within the file); Kraken `kraken:<txid>`; MT4 `mt4:<ticket>:open` / `:close` / `mt4:<ticket>:cash`; generic `gen:<id>`, or the IBKR-style content hash when `id` is blank.

Format specifics. IBKR reads only `Trades`, `Deposits & Withdrawals` and `Account Information` (`Base Currency`); `Asset Category` other than `Stocks` is skipped (`import.skip.assetClass`); on `C` rows `broker.realizedPnl` and `broker.basis`, on every row `broker.commission = −Comm/Fee`. Kraken pairs map `XXBTZUSD → BTC/USD`, `XETHZEUR → ETH/EUR`, `SOLUSD → SOL/USD` (8-character `X…Z…`/`X…X…` codes split 4+4 with the leading `X`/`Z` dropped; `XBT → BTC`, `XDG → DOGE`; otherwise a known quote suffix `USDT, USDC, USD, EUR, GBP, JPY, CAD, CHF, AUD`, longest first); `margin > 0` adds `notes: 'margin'`. MT4 emits two fills per closed row (open and close); Commission and Taxes are the close fill's fee, Swap is the close fill's `broker.swap`, Profit its `broker.profit`; S / L becomes `stop` with `stopSource: 'file_at_close'` (AC-P1.11: shown as "stop at close, may not be the initial stop"); `contractSize` 100000 for six-letter currency pairs, else 1 with value per unit carried by `quoteToAccount = Profit / ((close − open) × sign × size × contractSize)`; when open = close the value per unit is unknown and anomaly `contract_size_missing` asks once per symbol per account (S1). `buy limit`/`sell stop`/… rows are skipped (`import.skip.cancelled`); `positionId` follows `from #`/`to #` comments back to the first ticket.

### 2.3 Fills to round-trip trades (`src/import/group.js`)

`groupFills({ fills, funding, account, mode, existingKeys, dustThreshold, declaredZone, fileZone }) → { trades, anomalies, matched }`. `dustThreshold` per instrument, default `sizeStep` of the file, editable per instrument and stored on the account.

1. Drop fills whose `key` is in `existingKeys` of this broker account; count them as `matched` (AC-P1.10, no question).
2. Group by `positionId` when set, else by `instrument`; sort by `time`, then file row. Every trade gets `accountId`.
3. Walk each group with an exact signed running position. The first fill opens a trade (long for buy, short for sell). Same-direction fills are entry legs, opposite fills are exit legs. The trade closes when |position| < `dustThreshold`; a non-zero remainder is stored as `trade.dustRemainder` and shown on the trade. `trade.funding` = Σ fills' `broker.swap` plus matched funding entries; `trade.broker.netMinor` = Σ closing fills' `broker.realizedPnl` (IBKR) or Σ (`profit` + `commission` + `taxes` + `swap`) (MT4), when the file states them; `initialStop` and `stopSource` come from the first entry fill with a stop.
4. Checks, each an anomaly kind. Anomalies of one kind in one import form one question listing every affected trade, with one answer for all and a per-trade override (AC-A2.2). Every kind except `unreadable_rows` and `funding_unmatched` puts its id into each affected trade's `holds`; a trade with non-empty `holds` is held out (S3); an answer removes the id; `exclude` sets `trade.excluded = { by: 'import', anomalyId }` and keeps the trade, flagged (AC-A2.3).

| Kind | Raised when | Answers |
|---|---|---|
| `flip` | a fill crosses zero; it is split at zero, fee pro rata by size, the rest opens a new trade | `split` (default), `exclude` |
| `dust` | a trade closed with `dustRemainder > 0` | `close_with_remainder`, `keep_open` |
| `opened_before_file` | a fill would open a position but is a close by its source (IBKR `openClose = 'C'`; a Kraken sell with `margin = 0`, spot cannot be short) | `enter_open` (price and date typed), `keep_broker_pnl` (IBKR: net = Σ `broker.realizedPnl`, R unknown; disabled where the file has no realised P&L), `exclude` |
| `tz_edge` | `fileZone ≠ declaredZone` and the close lies within \|offset difference\| + 1 hour of a month boundary in the declared zone | `month_before`, `month_after` (sets `closeDayOverride`) |
| `missing_fee` | a fee field present in the format is blank (a fee of 0 is not an anomaly) | `fee_zero`, `enter_fee`, `exclude` |
| `rate_missing` | quote or fee currency differs from the account base currency and no rate is known | `rate` (one value per currency for the import, per-trade override) |
| `contract_size_missing` | MT4 symbol with unknown value per unit | `value` (stored per symbol per account) |
| `broker_mismatch` | a trade's broker net and recomputed net differ by more than the reconcile tolerance per trade | `use_broker` (default per money rules), `exclude` |
| `near_duplicate` | same instrument, side, size and price within 1 second as an earlier import's fill, different key | `merge`, `keep_both` |
| `funding_unmatched` | a funding entry with no open trade on that instrument at that time (matched ones are added to `trade.funding`) | `attach` (pick a trade), `ignore` |
| `unreadable_rows` | `skipped.length > 0` | `continue`, `cancel_import` |

A format with `statesZone: false` asks its file zone once per broker account; the answer is stored on the account and prefilled next time (AC-A2.1).

### 2.4 Fixtures and adding a format

In `tests/fixtures/import/`: `ibkr-activity.csv`, `kraken-trades.csv`, `mt4-statement.htm`, `generic.csv`, each with `<name>.expected.json` (rows, fills, cash, trades with averages, fees, gross and net, broker figures, anomalies by kind and the values after each answer, hand-computed), plus `kraken-overlap.csv` (the BTC fills again under new txids), `kraken-month-edge.csv` (a close at 22:30 UTC on 31 March) and `kraken-quantity.csv` (the AC-A1.5 case). `tests/fixtures/reconcile/cases.json` holds the reconcile cases (section 5.1). Their AAPL/MSFT/TSLA, BTC, EURUSD/USDJPY and KO rows reproduce the trades of `tests/fixtures/stats/core.json`, so parser and statistics tests share the arithmetic. Two-thousand-row files per format (AC-U2.1, with trades lacking stops and positions opened before the file) come from `tests/gen/<id>.mjs`, a seeded generator (mulberry32) that writes the file and its own expected totals from simple arithmetic; generated files are not committed.

Adding a format: one module in `src/import/formats/`, one line in `src/import/registry.js`, one fixture pair, one test file `tests/import/<id>.test.mjs`. No other file changes. Each format is one cloud session (section 11).

## 3. Statistics engine (`src/stats/`, pure, never AI)

### 3.1 Money, accounts and context

`ctx = { mode, accountIds | 'all', displayCurrency, digitsOf(ccy), tz, dayCutoffHour, smallSampleMin = 30, accounts: { [id]: { baseCurrency, startBalance, toDisplayRate } }, cash: [CashMovement] }`. `minorDigits(ccy)` from `Intl.NumberFormat(…, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits`, 2 for a code `Intl` rejects (USDT). `roundMinor(x, d)`: scale by 10^d, round half away from zero with a relative epsilon of 1e-12, return an integer (1.005 → 101, −2.675 → −268, 0.5 at 0 digits → 1).

Per trade, in the account's base currency, rounded once: recomputed `grossMinor = roundMinor(S1)`, `fundingMinor = roundMinor(funding)`, `netMinor = roundMinor(gross − fees + funding)`, `feesMinor = grossMinor + fundingMinor − netMinor`. When the trade carries broker figures (`trade.broker.netMinor`, from IBKR `Realized P/L`, or MT4 `Profit + Commission + Taxes + Swap`), `netMinor` is the broker figure and both are stored; a gap above tolerance was already raised as `broker_mismatch`. A view over several accounts converts each trade's rounded `netMinor` with the account's `toDisplayRate` (1 when base = display; otherwise typed by the user in account settings, per-trade override) and rounds once more (`displayMinor`); every aggregate sums integers. R uses base-currency `netMinor / 10^d` and base-currency risk.

### 3.2 Functions (`src/stats/index.js` re-exports all)

| Figure | Signature | Definition and edge cases |
|---|---|---|
| S1 | `grossPnl(trade) → number \| null` | Σ exit legs (exit − average entry) × exit size × `contractSize` (or `contractValue`) × exit leg `quoteToAccount`, sign reversed for short; average entry size-weighted. Open trade → null. |
| S2 | `tradeMoney(trade, ctx) → { grossMinor, feesMinor, fundingMinor, netMinor, recomputedNetMinor, source: 'broker'\|'app' }` | Fees = Σ leg `fee × feeToAccount` (null fee counts 0). Null for an open trade or a null rate. |
| S3 | `closedSet(trades, { mode, accountIds, filter }) → { included, excluded: { open, heldOut, userExcluded, otherMode, otherAccount } }` | Order: other mode, other account, held out (checked before any arithmetic), excluded, open. |
| — | `openRisk(trade) → { amountMinor, r } \| null` | Open trade with a current stop: size × stop distance; enters no statistic (S3). |
| S4 | `winRate(set) → { value, wins, losses, breakEven, n }` | Winner netMinor > 0, loser < 0, break-even = 0 is neither; `n = 0` → null. |
| S5 | `avgWinLoss(set) → { avgWin, avgLoss, nWin, nLoss, avgWinR, avgLossR, nWinR, nLossR }` | avgLoss positive magnitude; R over R-known trades. |
| S6 | `profitFactor(set) → { value, reason }` | `no_losses` / `no_trades` → null, never Infinity. |
| S7 | `initialRisk(trade) → { value, perLeg: [{ legId, value }], reason }` | Σ entry legs \|entry − initialStop\| × size × contract size × that leg's rate; reasons `no_stop`, `stop_at_entry`, `stop_profit_side` → null. |
| S8 | `rMultiple(trade) → number \| null`; `rBreakdown(trade) → { r, base: -1, slippageR, costsR, otherR } \| null` | R = net / initial risk, not clipped. `rBreakdown` only when R < −1 and the stop is known: `slippageR` = (average exit − stop) × closed size × contract size × rate × sign / risk; `costsR` = (net − gross) / risk; `otherR` = R − (−1 + slippageR + costsR), shown only when not 0 (fixture: −1.22 = −1 − 0.20 − 0.02). |
| S9 | `expectancy(set, ctx) → { r: { value, n, rMissing, byParts }, money: { valueMinor, n }, smallSample }` | Both R forms agree to 1e-9 on the same trades. |
| S10 | `equityCurve(set, ctx) → { points: [{ t, kind: 'start'\|'trade', ref, equityMinor }] }` | Requirements S10: start = Σ starting balances of the accounts in view (display currency), then one point per trade close (ties by id) at start plus cumulative net. Cash movements are not points. |
| S11 | `drawdown(curve, { cash }) → { maxMinor, maxPct, peak, trough, recovery, currentMinor, currentPct, recoveryGainPct, note }` | Amounts, peak, trough and recovery come from the S10 curve only. Percent denominators use equity including cash: `E(t)` = curve value at `t` + Σ deposits − withdrawals of the accounts in view up to `t`. `maxPct = maxMinor / E(peak)`; `recoveryGainPct = maxMinor / E(trough)` (equals peak / trough − 1 with no cash); `currentPct` likewise. `note: 'includes_cash'` when a cash movement falls in the range; percents need `E(peak) > 0`; `E(trough) ≤ 0` → `recoveryGainPct` null with `note: 'equity_at_or_below_zero'`. Fixture: `requirements-cases.json` `drawdownWithWithdrawal`. |
| S12 | `buckets(set, by, ctx) → [{ key, n, netMinor, winRate, expectancyR, rKnown, tradeIds }]` | `by` ∈ `setup` ("No setup" = null key), `market`, `instrument`, `account`, `hour`, `weekday`, `session`. Hour, weekday and session from the first entry leg in `ctx.tz`; weekday uses `dayCutoffHour`. Rows in fixed neutral order (AC-B1.4): alphabetical for setup, market, instrument, account, with "No setup" after the named setups because it is not a setup name (the design follows this, G19); 0-23, ISO 1-7; sessions in the order listed below. No ranking field. |
| S13 | `calendar(set, { year, month }, ctx) → { days: [{ date, netMinor, n }], weeks: [{ start, netMinor }], monthMinor }` | Close day in `ctx.tz` with `dayCutoffHour`; `closeDayOverride` wins; weeks start Monday and sum only their days in the month. |
| S14 | `feeTotals(set) → { feesMinor, fundingMinor, feesR, fundingR, nR }` | R figures = Σ over R-known trades of cost / risk. |
| S15 | `streaks(set) → { longestWin, longestLoss, current: { kind, length } }` | Close order; break-even ends both runs. |
| S16 | `ruleFollowing(set) → { value, followed, marked, unmarked, tradeIds }` | followed / marked. |
| S17 | `pips(trade) → { resultPips, stopPips, pipSize } \| null`; `pipsByPair(set) → [{ instrument, pips, n }]` | Forex only; pip 0.01 when the quote currency is JPY, else 0.0001; summed only within one pair. |
| S18 | `holdingTime(set) → { winners: { avgSeconds, n }, losers: { avgSeconds, n } }` | First entry to close. |
| P4.5 | `compareModes(trades, { from, to, lossWindowMin = 30 }, ctxByMode) → { real, paper, missing }` | Per mode: S16, median risk % of equity at entry (null without a starting balance), trades per active day, share opened within `lossWindowMin` of a losing close; each with n and trade ids. |
| — | `equityAtEntry(trade, ctx) → minor \| null` | Account start balance + net of its trades closed before the entry + deposits − withdrawals before it; null without a start balance ("needs a starting balance"). |
| A5 | `explain(figureId, set, ctx) → { formulaKey, params, includedIds, excluded: [{ id, reason }] }` | Listed trades sum exactly to the headline (AC-A5.2). |
| P2.6 | `positionSize({ market, equity, riskPct, entry, stop, stopPips, pipValuePerLot, contractSize, quoteToAccount, sizeStep }) → { size, riskAmount, pipSize }` | Every input typed by the user; no default percent (W5); size rounded down to `sizeStep`, risk recomputed at that size. Fixtures: 50 shares, 0.0833 coin, 0.2 lot. |

Sessions (S12): forex trades get the first match of `london_ny_overlap` (08:00-17:00 Europe/London and 08:00-17:00 America/New_York both), `london` (08:00-17:00 Europe/London), `new_york` (08:00-17:00 America/New_York), `tokyo` (00:00-09:00 UTC), `sydney` (22:00-07:00 UTC), else `outside`; London and New York follow their own daylight saving through `Intl`. US stocks: `us_regular` (09:30-16:00 America/New_York), `us_extended` (04:00-09:30 and 16:00-20:00), else `outside`. Crypto and other stocks: `none`. Start inclusive, end exclusive. Sources: domain pack §5.1.

### 3.3 Fixtures

`tests/fixtures/stats/core.json` holds ten trades in four broker accounts (seven closed real trades across the three markets with fees, a stop-out slipped past the stop, one short, one without a stop, one break-even; plus one open, one held out, one paper) and every expected S1-S18 value, hand-computed, in declared zone `Europe/Athens`. `tests/fixtures/stats/requirements-cases.json` holds the 12,000 → 9,600 drawdown (20.0%, 25.0%), 40% × 2R − 60% × 1R = +0.2R, the −1.22R breakdown, drawdown with a withdrawal before and after the peak (`drawdownWithWithdrawal`), profit factor with no losses, the three position-size cases and the rounding cases. AC-P3.2 invariants (days, weeks, setups, markets, accounts, weekdays, R-known + R-unknown) run on 250 trades from a seeded generator in the test.

## 4. Storage

### 4.1 IndexedDB `trading-journal`, version 1

| Store | keyPath | Indexes | Row |
|---|---|---|---|
| `accounts` | `id` | — | `{ id, name, mode, baseCurrency, startBalance, toDisplayRate, fileZones: { [formatId]: zone }, dustThresholds: { [instrument]: '0.0001' }, contractValues: { [symbol]: '100' }, existingKeys omitted (derived), createdAt }`; paper trades belong to a paper account |
| `trades` | `id` | `by_account_close` [`accountId`, `closeTime`], `by_mode_close` [`mode`, `closeTime`], `by_import` | Trade below |
| `cash` | `id` | `by_account_time` | `{ id, accountId, time, kind: 'deposit'\|'withdrawal'\|'other', amount, currency, importId, key, note }` |
| `imports` | `id` | `by_time` | `{ id, accountId, createdAt, fileName, formatId, fileZone, rawText, report, anomalies: [Anomaly], matched }` |
| `reconciliations` | `id` = `<accountId>:<from>:<to>` or `…:qty:<asset>` | — | `{ id, accountId, from, to, form: 'net_pnl'\|'balance'\|'quantity', state, broker, oursMinor, openLegsMinor, differenceMinor, toleranceMinor, explanations, updatedAt }` |
| `plans`, `reviews` | `id` | `by_time` for reviews | plan `{ id, name, active, items, setups, hours, dailyCap, riskPct, dailyLossLimitPct }` (no defaults for the last two); Review (section 5.2) |
| `blobs` | `id` | — | screenshots, 1600 px JPEG 0.8 |
| `settings` | `key` | — | `lang`, `tz`, `dayCutoffHour`, `displayCurrency.real`, `displayCurrency.paper`, `smallSampleMin`, `openReminderDays`, `exportReminderEvery`, `reconcileCap` (default `'1.00'`, base currency units), `thresholds.*`, `ai.*`, `firstRunDone`, `schema.version` |

Anomaly: `{ id, kind, importId, accountId, tradeIds, detail, answer: null | { optionId, value, at }, overrides: { [tradeId]: { optionId, value } } }`.

Trade:
```json
{ "id": "uuid", "accountId": "acc-ibkr", "mode": "real", "market": "stock", "instrument": "AAPL", "side": "long",
  "contractSize": "1", "contractValue": null, "quoteCurrency": "USD",
  "legs": [{ "id": "uuid", "kind": "entry", "time": "2026-03-02T14:40:00Z", "zone": "Europe/Athens",
             "price": "50", "size": "30", "fee": "1", "feeCurrency": "USD", "feeToAccount": 1, "quoteToAccount": 1,
             "broker": null, "source": { "importId": null, "row": null, "key": null } }],
  "initialStop": "48", "stopSource": "user", "stopMoves": [], "target": null, "funding": 0,
  "broker": null, "setup": "breakout", "plan": { "planId": "uuid", "followed": true, "items": {}, "auto": {}, "confirmedByUser": true },
  "notes": "", "moodBefore": null, "moodAfter": null, "screenshotId": null, "leverage": null,
  "importId": null, "holds": [], "excluded": null, "dustRemainder": "0", "closeDayOverride": null,
  "closeTime": "2026-03-02T20:30:00Z", "createdAt": "…", "updatedAt": "…", "entry": "manual" }
```
`trade.broker = { netMinor, commissionMinor, swapMinor, source: 'ibkr'|'mt4' }` when the file states them. `closeTime` is denormalised for the index (null while open). Status and money are derived on read.

The own key lives only in `localStorage['trading-journal.ai-key']`, bound to provider and host as in thought-catcher v1.0.1, never in IndexedDB, so no export can contain it.

Store interface (`createIdbStore(indexedDB)` and `createMemoryStore()`, identical): `accounts`, `trades`, `cash`, `imports`, `reconciliations`, `plans`, `reviews`, `blobs`, each `{ getAll, get, put, putMany, delete }` where it applies; `getSetting`, `setSetting`, `transaction(fn)` (an import writes trades, cash and the import row in one transaction), `clearAll()`. Delete all (AC-P8.9, legal-review §5 item 6): Settings → Data (S2 `dataSettings`) offers "Delete all data on this device"; the confirm step names what is lost, offers an export first and needs the word typed; then `clearAll()` empties every store, the own key is removed from `localStorage`, the WebLLM caches are deleted when the user ticks "also delete the downloaded model", and the app returns to first run. The app-shell cache holds no journal data and stays. `e2e/delete-all.mjs` checks that IndexedDB, `localStorage` and journal-bearing caches are empty afterwards. When IndexedDB is refused, the app runs on the memory store and shows the storage-refused state.

Paper and real stay apart by `trade.mode`, by paper trades belonging only to paper accounts, by `closedSet` filtering mode first, and by reconciliation existing only for real accounts. No function takes both modes except `compareModes`, which returns them separately.

### 4.2 Migrations (`src/storage/migrate.js`, pure)

`MIGRATIONS = [{ to: 1, stores(db, tx) {…}, record: { trades(r) → r, … } }]`. `openDb` runs `stores` for every `to` in (`oldVersion`, `DB_VERSION`] inside `onupgradeneeded`, then rewrites records with each `record` function in order. `migrateExport(json)` applies the same record functions to an export file. A migration never deletes a field it does not understand; each has a fixture of the previous version and a test that every trade's `netMinor` and R and every S1-S18 figure are unchanged (AC-P8.4). The test injects a synthetic `to: 2` (renames `leverage` to `leverageUsed`) to prove the chain on v1 data; `e2e/migration.mjs` exercises the IDB path.

### 4.3 Export and import file

```json
{ "format": "trading-journal-export", "version": 1, "exportedAt": "ISO", "appVersion": "1.0.0",
  "settings": {}, "accounts": [], "trades": [], "cash": [], "imports": [], "reconciliations": [],
  "plans": [], "reviews": [], "blobs": [{ "id": "…", "type": "image/jpeg", "dataUrl": "data:image/jpeg;base64,…" }] }
```
`parseExport` is all-or-nothing (not JSON, wrong `format`, `version` above current, any invalid row → message, no writes); older versions go through `migrateExport`. Merge by `id`: "added N, kept M". A test asserts no export contains the key string. The import report (A4) also saves alone as JSON and as a printable HTML view.

## 5. Agents

User-facing names follow W10 and AC-B1.6: "Import check", "Broker check", "Review", "review questions". No string says agent, advisor, coach, assistant, signal, insight, analysis, research or outlook; `tests/shell/strings-boundary.test.mjs` enforces it. "Agent" below is an internal term only.

### 5.1 Import check and broker check (the angle, K1): code only

It does the user's checking work: reads the file, builds trades, finds what does not add up, asks one question per anomaly kind, holds affected trades out, compares with the broker's own figure and names the trades that explain a difference. Every number, question and explanation comes from code and fixed templates in both languages. No model is involved, so no model can change a money figure.

```js
// src/import/run.js
runImport({ text, fileName, formatId?, account, fileZone, declaredZone, existingKeys, now }, { bus })
  → { importRecord, trades, cash, report }  // report: rowsInFile, rowsRead, tradesBuilt, matched, skipped, cash, anomalies, rKnownShare, period
answerAnomaly(importRecord, trades, anomalyId, { optionId, value?, tradeId? }) → { importRecord, trades }   // tradeId = override
// src/import/reconcile.js
realisedTotal({ trades, accountId, period, ctx }) →   // period: { from, to, zone }
  { closedMinor, openLegsMinor, openLegs: [{ tradeId, legId, amountMinor }] }
reconcile({ trades, cash, account, period, broker, cap = '1.00', ctx })
  → { state, oursMinor, openLegsMinor, brokerMinor, differenceMinor, toleranceMinor, explanations: [Explanation], needsInput: [NeedsInput], unexplainedMinor }
// broker: { form: 'net_pnl', valueMinor } | { form: 'balance', startMinor, endMinor, depositsMinor, withdrawalsMinor, otherMinor, noOpenPositionsConfirmed: true }
reconcileQuantity({ fills, cash, account, asset, startQty = '0', brokerQty, period }) → { impliedQty, differenceQty, explanations }
// Explanation: { cause, tradeIds | fillKeys | cashIds, amountMinor | qty, anomalyId }   (always a known amount)
// NeedsInput: { cause: 'missing_fee' | 'rate_missing', tradeIds, anomalyId }            (no amount, never counted)
```

Realised total (AC-A1.2): each trade's `netMinor` is allocated to its exit legs by size with the largest-remainder method so the parts sum exactly to the trade figure; open trades get per-exit-leg realised amounts at average cost (entry fees pro rata by exited size) or the leg's broker figure when stored. `closedMinor` = trades with every exit leg inside the period; `openLegsMinor` = exit legs inside the period of trades still open at period end or closing outside it, shown on its own line and never entering a statistic. The app total is their sum.

Period: `{ from, to, zone }`, inclusive local dates. For a check started from an import the zone defaults to the broker account's file zone (UTC for Kraken, the stored answer for IBKR and MT4), because a statement cuts days in the broker's zone (V1-F10); for hand-entered trades it is the declared zone. The period line names the zone ("IBKR · 1-29 Sep 2026 · New York time · USD") and the user may change it. Which figure to type, per format (AC-A1.1 hint): IBKR, the `Total` row of `Realized P/L` in the Trades section, which includes commissions ("Realized P/L is calculated by adding the proceeds of the closing trade plus commissions and then adding the basis", https://www.ibkrguides.com/reportingreference/reportguide/trades_default.htm, read 2026-09-29); MT4, `Closed Trade P/L` in the statement Summary (whether it includes commission and swap is not verified on a real file, so the screen shows the app's Profit + Commission + Taxes + Swap total and the plain Profit total beside it); Kraken, no realised figure exists, so the quantity form is offered first (AC-A1.5).

Match: |difference| ≤ min(1 minor unit of the base currency × closed trades, `reconcileCap`, default 1.00 in base currency units). For USD or EUR that is 0.01 per trade as AC-A1.2 states; for a currency without minor units such as JPY it is 1 per trade, since 0.01 JPY cannot be represented; the exact difference is always shown and the state reads "reconciled within X". The balance form is offered only after the user confirms no position was open at the period start or end; `difference = (end − start − deposits + withdrawals − other) − ours`, deposits and withdrawals prefilled from stored cash movements (AC-A1.4). Hand-entered periods use the same `reconcile` from the dashboard, with no import anomalies (AC-A1.1, AC-U3.2). Paper accounts never reconcile (AC-P4.4).

Explanation search. Candidates with a known amount: a held-out trade adds the netMinor it would have (cause = its anomaly kind; `dust` as closed with remainder, `opened_before_file` from the broker's realised P&L, `flip` as split, `broker_mismatch` as broker figure; `rate_missing` has no amount and is never a candidate); a near-duplicate answered `keep_both` subtracts its netMinor (`duplicate`); a `tz_edge` trade moved out of the period adds its netMinor (`tz_edge`); an exit leg counted in `openLegsMinor` subtracts its amount (`partial_exit_open`); with the balance form, `other` cash movements in the period not entered as "other" (`cash_items`). The smallest subset (≤ 3 of at most 24 candidates) whose sum equals the difference within tolerance is named. Held-out trades whose amount depends on a number the user has not given (`missing_fee`, `rate_missing`) are never candidates and no amount is fitted to them: they appear in `needsInput` as "fee field empty, type the fee from your statement; the difference is recomputed" (or the rate), with no amount, and are not counted in the header "N trades add up to the whole difference" (AC-A3.2, V1-F1). Otherwise `unexplainedMinor` = difference, the screen says "unexplained difference of X" and lists nothing (AC-A3.2); with the balance form it also names "cash items outside trades" as a category to check, without an amount. Explanations are shown, never applied. After any answer `reconcile` reruns (AC-A3.3).

Quantity form (AC-A1.5, crypto): `impliedQty` = start + Σ base bought − Σ base sold − fees charged in the asset + asset deposits − withdrawals + (as quote) Σ sale proceeds − Σ purchase costs, all exact decimals. Candidates: each fill's fee converted to base at its price (Kraken shows fees in quote even when deducted in base), and stored transfers; exact subset search as above. Fixture `kraken-quantity.csv`: 0.5 BTC bought in two fills, 0.2 sold, broker ending 0.2995 → implied 0.3, difference −0.0005, explained by the two buy fills' fees in BTC (0.0003 + 0.0002).

Events on `bus`: `import-progress { done, total }` every 200 rows, `import-done`, `anomaly-answered`, `reconcile-changed { id, state }`.

### 5.2 Review (P5): code decides, AI may reword

```js
// src/review/run.js
runReview({ trades, cash, accounts, plans, settings, mode, period, lang, now }, { engine, bus }) → Promise<Review>
// Review
{ id, mode, period, createdAt, lang, engine: 'rules'|'on-device'|'own-key', engineNote,
  left: { open, heldOut, userExcluded },
  processOutcome: { followed: { n, avgR, rKnown, tradeIds }, offPlan: { … }, unmarked },
  findings: [{ id, pattern, titleKey, n, tradeIds, facts, basis: 'r'|'position_value_pct', threshold: { value, from: 'plan'|'placeholder' },
               text, textBy: 'rules'|'model', question }],
  optional: { largest: …, monthsByCount: …, lossSequence: … },   // AC-P5.10
  checked: [pattern ids], noPattern: false }
```

Patterns (`src/review/patterns.js`, AC-P5.1), each titled by the behaviour, never by a label: `plan_not_followed`; `entry_after_loss` (entry within `lossWindowMin` of a losing close after two consecutive losses, or risk above the user's median after a losing close, on a trade marked not followed); `busy_days` (days above the user's median trade count; days over the plan cap; share with no setup tag); `size_rising` ("position size rose from .. to .."); `added_while_losing` (entry legs added while the position showed a loss at the leg's price); `stop_moved_or_missing`; `holding_and_target` (average holding time of winners and losers; plan target against where winners closed); `outside_set_hours`; `after_daily_loss_limit`. Behavioural thresholds default and are labelled "placeholder you set, not a recommendation"; risk-based patterns use R, or position value as percent of equity at entry for R-missing trades, and name the basis and its count. A finding with no trade ids is dropped. Process versus outcome (AC-P5.9) is two figures side by side with no linking sentence.

| Step | Who | Detail |
|---|---|---|
| Trades, patterns, n, trade ids, facts | code | as above |
| Sentence and review question per finding | code, `src/review/templates.js` (EN, EL) | Fixed templates, written to legal-review §2 rules 1-8; always produced; the fallback. |
| Rewording | model, optional | Input per finding `{ id, pattern, facts, ruleText, lang }` plus a system prompt that repeats rules 1-8; output `{ "items": [{ "id": "f1", "text": "…" }] }`. The model sees facts and the rule sentence, never raw trades or notes, and never writes the question. |
| Guard every sentence | code, `src/review/guard.js` | Below. A failing model sentence is replaced by the template sentence; `textBy: 'rules'`. |

Engine ladder (thought-catcher spike-b2 §5): 1. own key when set and online (Anthropic Messages or OpenAI-compatible; `src/ai/http.js`, `anthropic.js`, `openai.js` from thought-catcher, default `claude-haiku-4-5-20251001`); before it is turned on the screen lists what is sent and says the provider applies its own terms (AC-P9.2); 2. on-device WebLLM `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` in a module worker when `navigator.gpu` gives an adapter with `shader-f16` and the user agreed to the 830 MB download; 3. rules. For Greek, rung 2 is skipped unless L4 rates the model's Greek on the three seeded weeks acceptable (B2 measured English only). The engine is shown on every review. `bus` event `ai-state { engine, state, progress }`; a 150 s load watchdog turns a silent WebLLM hang into `failed`.

Boundary in code (legal-review §2, AC-P5.4-P5.6, AC-P4.7, AC-B1.1, AC-B1.6), `src/review/guard.js` with lists in `src/review/banned.js`:
- `check(text, lang, { scope, key? }) → { ok, hits: [{ class, match }] }`. Text is split into sentences; a quoted span is removed before checking (below). Two kinds of rule:
  - **Word-list classes** match a listed word or phrase anywhere in the sentence (word boundary, case-insensitive, Greek matched on stems): `modal` (EN should, must, need to, consider, try, avoid, focus on, stick with; EL πρέπει, θα έπρεπε, να αποφεύγετε, προτείνεται, σκεφτείτε να, δοκιμάστε); `future` (EN will, 'll, going to, shall; EL the particle θα); `ranking` (better, worse, best, worst, do more, do less, good entry, not for you; EL καλύτερ, χειρότερ); `platform` (recommend or suggest followed within five words by broker, exchange, platform, wallet or a broker name; EL προτείν/συνιστ likewise); `label` (you are a, you're a, revenge, overtrading, disposition effect, gambler, undisciplined; EL είσαι, εκδικητικ, υπερσυναλλαγ); `promise` (guaranteed, risk-free, you will recover, edge is proven; EL εγγυημέν, χωρίς ρίσκο); `readiness` (ready, not ready, suitable, go live; EL έτοιμ, κατάλληλ; scope `comparison` adds start and stop, AC-P4.7); `benchmark` (Barber, Odean, study shows); `screen_word` (analysis, research, outlook, advisor, coach, assistant, signal, insight; EL ανάλυση αγοράς, έρευνα, προοπτικ, σύμβουλ, προπονητ, βοηθ, σήμα).
  - **Sentence-initial classes** look only at the first word of a sentence: `instruction` (an imperative trade verb: buy, sell, hold, close, avoid, trade, short, go long, add to, cut, size, move, pause, stop trading; EL αγοράστε, πουλήστε, κρατήστε, κλείστε, αποφύγετε, σταματήστε, μετακινήστε, αυξήστε, μειώστε); `imperative` (any imperative from a longer EN and EL verb list, scopes `review` and `comparison` only, since interface buttons such as "Export" or "Log a trade" are imperatives about the app, not about a trade); `leading_question` (a question that does not start with an open-question word what, how, which, when, where / τι, πώς, ποια, πότε, πού, or that starts with why did you / γιατί).
  - Scopes: `review` and `comparison` run every class; `ui` runs every class except `imperative`, and keys under `label.side.*` ("Buy", "Sell") and `label.stop.*` ("Stop") skip `instruction`; `learn` allows the `label` terms revenge trading, overtrading and disposition effect, and skips `imperative` for worked-example steps under `learn.*.steps`; `legal` accepts a string only if its SHA-256 equals one of the pinned hashes in `src/review/legalTexts.js` (the legal-review §4 first-run and About texts, EN and EL, verbatim), and rejects any other string. The texts that legal-review mandates therefore ship unchanged and any edit fails the test until the lawyer's new text and hash replace them (G2).
  - Quoted spans: the user's own plan rule is inserted into templates through the placeholder `{quote:rule}`, rendered inside “ ” (EN) or « » (EL) and passed to `check` as a separate quoted segment that is not scanned, because P5 allows quoting the user's own rule ("Your plan says: “The stop only moves toward profit.” 5 of 6 trades followed it."). Only template placeholders produce quoted segments; model text never does, and a model sentence containing quotation marks is checked in full.
  - Interface wording avoids the readiness words: "Your first review is here", "until the download finishes" (V1-F22).
- `numbersMatch(text, facts, lang)`: every number in model text (locale parsing, `%`, `R`) equals a fact value after the same formatting, else the model sentence is dropped (AC-P5.6).
- `entitiesMatch(text, facts)`: tickers and pairs must be instruments in `facts`.
- Model sentences over 280 characters are dropped.
- `tests/fixtures/review/legal-table.json` carries legal-review §2's banned-versus-safe table, W2-W8 wordings, the mandated §4 texts (scope `legal`), a plan quote, and the V1 conflict strings, with the class each banned row must hit: every banned row fails with that class and every safe row passes (L2 wrote the English rows; S3 adds Greek rows in the same file).
- Tests: `guard.test.mjs`, `legalTable.test.mjs`, `noAdvice.test.mjs` (three seeded losing weeks, one per market, rules and a stub model emitting every banned class, a wrong number, an invented ticker), `stubModel.test.mjs` (garbage, timeout, invalid JSON leave figures and findings unchanged, AC-P9.4).

### 5.3 Sentence entry (P1.5): code parses, AI may add setup and notes

`src/sentence/parse.js`: `parseSentence(text, { lang, setups, instruments, now }) → { fields, missing: ['entry'], ambiguous: [{ field, readings: ['1.085', '1085'] }] }`. Side words (`bought|buy|long|sold|sell|short`, `αγόρασα|αγορά|πούλησα|πώληση|long|short`), a number followed by an instrument token, `at|@|στα|στο|στις` + price, `stop|sl|στοπ` + price, `target|tp|στόχος` + price, `fee|fees|προμήθεια` + amount, remaining words matched to the user's setups. Decimals `0,2` and `0.2`; in Greek input a dot followed by exactly three digits is `ambiguous` and the confirm step shows both readings and asks (AC-P7.2). Market: currency pair → forex, a crypto list (`src/sentence/crypto.js`) → crypto, else stock. A model may only fill `setup` and `notes`; a differing number field is shown beside the code value, which stays until the user picks (AC-P1.6).

### 5.4 Plan checks, position size, learn

`src/plan/check.js`: `evaluatePlan(trade, plan, { sameDayTrades, equityAtEntryMinor, tz }) → { auto: { hours, dailyCap, risk, dailyLossLimit, stop, setup }, suggestedFollowed }`, values `pass|fail|unknown` (risk and loss limit `unknown` without a starting balance). The position-size screen (S3 view) calls `positionSize` (3.2) with typed inputs only; example numbers are labelled "example numbers only". Example plans leave risk per trade and daily loss limit empty with "your number" (AC-P2.5). `src/learn/`: `entries.en.js`, `entries.el.js` (T1-T25; T26+ when research adds them; paper-trading limits; the CFD entry in the exact AC-P6.4 wording with no number), `explain(figureId, explainResult, lang) → { title, plain, formulaWithNumbers }`. Learn text is authored; the user's numbers are filled by code.

## 6. PWA, offline, CSP, i18n

- Manifest: `name` "Trading Journal", `short_name` "Journal", `id` `./`, `start_url` `./#/home`, `scope` `./`, `display` `standalone`, icons 192, 512, maskable 512, `apple-touch-icon` 180 (`tools/make-icons.mjs` from thought-catcher, drawn from L2d's SVG), shortcut "Log a trade" → `./#/trade/new`.
- `sw.js` from thought-catcher: `VERSION = 'tj-v1'` bumped per release; `SHELL` lists every loaded file and `tests/shell/pwa.test.mjs` fails on a missing one; `tools/shell-list.mjs` regenerates it; `tj-cdn` and WebLLM caches survive releases; provider requests and non-GET are never intercepted.
- CSP meta: `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob: https://cdn.jsdelivr.net; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'`. No inline styles; user text only through `textContent`.
- Network allowlist, asserted by `e2e/smoke.mjs` (AC-P8.2): same origin; after model consent `cdn.jsdelivr.net`, `huggingface.co` and its file CDN, `raw.githubusercontent.com`; the own-key host only when set. No other request.
- Offline after first load except the model download and own-key calls; `navigator.onLine` false shows the offline state; `navigator.storage.persist()` on first real write, refusal shown (AC-P8.5).
- About (S1): the legal-review §4 texts verbatim in both languages, the §5 data facts (AC-P10.2), links to S1-S18 definitions, licence, code link. First-run sentence of §4 once before the first entry (AC-B1.5).
- i18n: `src/i18n/i18n.js` `t(key, params)`, `setLang`, `onLang`; catalogues split by owning shard, `src/i18n/{en,el}/{shell,data,review}.js`, flat `{ key: 'text' }` with `{name}` placeholders and `{n, plural, one {…} other {…}}` via `Intl.PluralRules`. `tests/shell/i18n.test.mjs` fails on a key or placeholder present in one language only. Language switch re-renders without reload. Latin terms kept in Greek (AC-P7.3): `R`, `pip`, `lot`, `stop`, `spread`, `funding`, `swap`, `long`, `short`, `broker`, `setup`, `crypto`, `forex`. Kept as proper names: the language name `English` in the language chooser, IANA zone ids such as `Europe/Athens`, and source names in Learn.
- Formats (`src/i18n/format.js`): `en-GB` or `el-GR` (English follows `navigator.language` when it starts with `en`); `money(minor, ccy)` with `signDisplay: 'exceptZero'`, `num`, `pct`, `r` (`+1.48R`), `pips`, `duration`, `date`, `time` in the declared zone. Sign and arrow carry gain and loss besides colour.

## 7. Market data

None. No view needs prices: every figure comes from the user's fills; conversion uses stored rates (from the file, MT4's implied rate, or typed by the user); open risk uses the user's stop. A price or FX feed would break AC-P8.2.

## 8. Sync and sharing (later rung, design only)

- Rung 1, no server: "share a snapshot" exports a filtered, read-only file; the receiver opens it in a read-only view, never merged. Transport is the user's own channel.
- Rung 2, device to device: the export encrypted with a passphrase (Web Crypto AES-GCM, PBKDF2 600,000 iterations), moved by file or QR chunks; merge by `id` and `updatedAt`, conflicts listed.
- Rung 3, a relay, only if rungs 1-2 fail users: a Cloudflare Worker with KV on the free tier storing ciphertext only for 24 hours. Before building it, legal-review §5 applies in full (Art 13 notice, contact address, processor contract, breach process) and requirements Q1.7 must be answered. Not built; nothing in the UI suggests it (AC-P8.7).

## 9. Tests

- Unit, `npm test` = `node --test 'tests/**/*.test.mjs'` (Node 22 expands the glob; a directory argument does not work). Files: `tests/core/{decimal,money,time}.test.mjs`, `tests/import/{csv,htmlTable,group,run,reconcile,quantity,<format id>}.test.mjs`, `tests/stats/{s01-s08,s09-s11,s12-s18,invariants,compare,explain,sizing,requirements}.test.mjs`, `tests/storage/{memory,migrate,export}.test.mjs`, `tests/plan/check.test.mjs`, `tests/review/{patterns,guard,legalTable,noAdvice,stubModel,templates}.test.mjs`, `tests/sentence/parse.test.mjs` (40 phrases, half Greek, the ambiguous-dot case), `tests/ai/{adapter,providers}.test.mjs`, `tests/learn/entries.test.mjs`, `tests/shell/{i18n,pwa,static,strings-boundary}.test.mjs`. `strings-boundary` runs `guard.check` over every catalogue string, template, learn entry and the About text in both languages with the right scope: keys under `legal.*` (first-run sentence, About text) use `legal`, `review.*` templates `review`, `compare.*` `comparison`, `learn.*` `learn`, everything else `ui`.
- Headless flows, `node e2e/<flow>.mjs`, zero dependencies, `e2e/lib/cdp.mjs` from thought-catcher with a `gpu` option, run outside the Bash sandbox: `smoke` (manual trade, statistics, reload, offline, network allowlist), `import` (each fixture, report, questions with one answer and an override, broker figure per account, explanation), `reconcile-manual` (hand-entered period in two screens, AC-U3.2), `bulk-stops` (AC-P1.11), `roundtrip` (AC-P3.5), `migration`, `persona-u1`, `persona-u2` (three accounts), `persona-u3`, `timing` (AC-P1.1 30 s, AC-U2.1 10 s per 2,000-row file with visible progress).
- Test scenes: `?scene=<name>` loads `e2e/scenes/<name>.json` into the memory store with a fixed clock, only on `127.0.0.1` or `localhost`. One scene per D5 state plus the populated dashboard.
- Visual check for L4, `node e2e/visual.mjs [scene …]` (from `design/tools/shoot.mjs`): CDP device metrics 390x844 and 360x800, scale 2, light and dark, every scene; writes `e2e/.out/screens/<scene>-<w>x<h>-<theme>.png` and `e2e/.out/visual.json` with horizontal overflow, clipped text, touch targets under 44 px, text contrast under 4.5:1 and chart marks under 3:1 (computed colours), smallest chart label, default-looking controls, untranslated strings in `el`, and highlighted or reordered bucket rows (AC-B1.4). Exit 1 on any finding; PNGs are compared with L2d's `design/screens/`.

## 10. Build split: three shards, disjoint write paths

| Shard | Owns (write) |
|---|---|
| S1 shell, design system, i18n core, navigation, settings, about, dashboard | `index.html`, `manifest.webmanifest`, `sw.js`, `css/**` except `css/views/data.css` and `css/views/review.css`, `fonts/**`, `icons/**`, `tools/**`, `src/app.js`, `src/ui/{router,routes,dom,bus,ctx}.js`, `src/ui/components/**`, `src/ui/charts/**`, `src/ui/views/{home,settings,about,firstRun}.js`, `src/i18n/{i18n,format}.js`, `src/i18n/{en,el}/shell.js`, `src/about/**`, `tests/shell/**`, `e2e/lib/**` |
| S2 data layer, import, broker check, statistics, journal screens | `src/core/**`, `src/import/**`, `src/stats/**`, `src/storage/**`, `src/ui/views/{journal,trade,tradeForm,bulkStops,accounts,cash,import,reconcile,stats,calendar,drill,dataSettings}.js`, `src/i18n/{en,el}/data.js`, `css/views/data.css`, `tests/{core,import,stats,storage}/**`, `tests/fixtures/{core,import,stats,reconcile}/**`, `tests/gen/**`; minus the cloud carve-outs below |
| S3 plan, position size, review, AI, sentence entry, learn | `src/plan/**`, `src/review/**`, `src/ai/**`, `src/sentence/**`, `src/learn/**`, `src/ui/views/{plan,checklist,sizing,review,learn,sentence,aiSettings}.js`, `src/i18n/{en,el}/review.js`, `css/views/review.css`, `tests/{plan,review,ai,sentence,learn}/**`, `tests/fixtures/review/**` |

Carve-outs and handovers (G14):
- Cloud sessions C1-C5 own, while they run, `src/import/formats/**`, `tests/import/{ibkr-activity,kraken-trades,mt4-statement,generic-csv}.test.mjs`, `tests/gen/**`, `src/stats/**` and `tests/stats/**`. The S2 brief excludes these paths from S2's writes until each branch is merged; S2 then merges the branch as reviewer (the merge is the only S2 write to them) and owns them again for fixes.
- CSS: S1 turns every class of `design/components.css` into `css/` (the mockups' inline styles become classes there, L2d F2). A view that needs a class S1 has not shipped adds it to its shard's own file, `css/views/data.css` (S2) or `css/views/review.css` (S3), using only tokens from `css/tokens.css`; S1 folds repeated ones into `css/` after L3.
- Greek: during L3 each shard writes its own Greek catalogue file as first drafts (`src/i18n/el/{shell,data,review}.js`, `src/learn/entries.el.js` for S3). C6 starts only after the L3 shards are closed; ownership of `src/i18n/el/**` and `src/learn/entries.el.js` then passes to C6 alone. After the C6 merge those files pass to whoever repairs at L4 by file, with no other writer at the same time.

Not owned by a shard: `docs/**` (architect), `design/**` (L2d), `e2e/*.mjs` and `e2e/scenes/**` (L4), `README.md` (L6). `package.json`, `LICENSE`, `.gitignore`, `.nojekyll` are fixed.

Shared contracts (fixed here; each shard codes against them before the other lands):
- S1 gives every view `ctx = { store, bus, t, fmt, lang, mode, setMode, accountFilter, setAccountFilter, settings: { get, set }, navigate(hash, state?), ui }`. Views export `render(root, ctx, params) → cleanup | void`. Routes: `#/home`, `#/journal`, `#/trade/new`, `#/trade/:id`, `#/stops`, `#/accounts`, `#/cash`, `#/import`, `#/import/:id`, `#/reconcile/:accountId`, `#/stats/:tab`, `#/calendar`, `#/drill/:figure`, `#/plan`, `#/sizing`, `#/review`, `#/review/:id`, `#/learn/:term`, `#/sentence`, `#/settings`, `#/about`. `bus` events: `trades-changed`, `mode-changed`, `account-filter-changed`, `lang-changed`, `ai-state`, `import-progress`, `import-done`, `anomaly-answered`, `reconcile-changed`.
- S1 `ui`: `button`, `field`, `segmented`, `sheet`, `listRow`, `figure({ labelKey, value, n, note, tone, onOpen })`, `modeBadge`, `accountBadge`, `stateBanner`, `emptyState`, `progress`, `toast`; charts `lineChart`, `underwaterChart`, `barList({ rows: [{ label, value, n }] })` (renders rows in the given order, one colour, no highlight), `calendarGrid`. All return DOM nodes.
- S2 step 0 helpers for the cloud sessions: `src/import/csv.js` `parseCsv(text, { delimiter }) → { rows, delimiter }` (RFC 4180, BOM, CRLF, `,`/`;`); `src/import/htmlTable.js` `htmlRows(html) → [{ cells: [{ text, title, colspan }] }]`; `src/core/decimal.js` `dec(str)`, `add`, `sub`, `mul`, `cmp`, `abs`, `isZero`, `toString`, `toNumber`, `decimalsOf(str)`; `src/core/money.js` `parseDecimal(str, decimal = '.') → string | null` (normalised decimal string), `roundMinor`, `minorDigits`; `src/core/time.js` `zonedToUtc(localIsoNoOffset, zone)` (IANA and `ny+7`), `localParts(isoUtc, zone, cutoffHour = 0) → { date, hour, minute, weekday }`, `inLocalWindow(isoUtc, zone, from, to)` (tested against `tests/fixtures/core/time-cases.json`, including the 2026 weeks when New York and Athens are 6 hours apart, V1-F9); `src/import/registry.js` `formats`, `detectFormat(text)`.
- S2 provides `store`, `stats`, `runImport`, `answerAnomaly`, `reconcile`, `realisedTotal`, `reconcileQuantity`, `openTradeForm(ctx, draft)`, `renderDataSettings(root, ctx)`, `getSummary(ctx) → { mode, netMinor, curve, expectancy, reconcileStates: [{ accountId, period, state }], counts: { open, heldOut, excluded } }`.
- S3 provides `runChecklist(ctx, draft) → Promise<planMark | null>`, `evaluatePlan`, `parseSentence`, `runReview`, `latestReview(ctx)`, `renderAiSettings(root, ctx)`, `learn.explain`, `guard`.

Order: S2 step 0 (local seat, first 30-40 minutes) commits the helpers above with tests (the fixtures are in the repo from L2) and pushes; cloud sessions C1-C5 start from that commit. S1, S3 and the rest of S2 run in parallel from the start.

## 11. Lanes

Cloud sessions (AM4): `claude --cloud "Build per docs/cloud/<file>.md"` from the repo. Each spec names the files the session owns, the contract, the fixtures and the done command; the session reads the whole repo and writes only its own files.

| Session | Spec | Owns | Done |
|---|---|---|---|
| C1 | `docs/cloud/C1-ibkr.md` | `src/import/formats/ibkr-activity.js`, `tests/import/ibkr-activity.test.mjs`, `tests/gen/ibkr-activity.mjs` | `node --test tests/import/ibkr-activity.test.mjs` |
| C2 | `docs/cloud/C2-kraken.md` | the same three paths for `kraken-trades` | `node --test tests/import/kraken-trades.test.mjs` |
| C3 | `docs/cloud/C3-mt4.md` | the same three paths for `mt4-statement` | `node --test tests/import/mt4-statement.test.mjs` |
| C4 | `docs/cloud/C4-generic.md` | the same three paths for `generic-csv`, plus `docs/generic-template.csv` | `node --test tests/import/generic-csv.test.mjs` |
| C5 | `docs/cloud/C5-stats.md` | `src/stats/**`, `tests/stats/**` | `node --test 'tests/stats/**/*.test.mjs'` |
| C6 (after L3) | `docs/cloud/C6-greek.md` (S1 writes it when the English catalogues are final) | `src/i18n/el/**`, `src/learn/entries.el.js` | `node --test tests/shell/i18n.test.mjs tests/shell/strings-boundary.test.mjs` |

Each branch is reviewed as a diff by the S2 seat (S1 for C6) and its tests run locally before merge.

Local model (AM5, oMLX; a Claude seat reviews every output before commit): first drafts of learn entries T1-T25 in both languages (S3 checks them against domain pack §4.4, the guard and AC-P6.5); the 40 sentence-entry test phrases (S3); format-noise variants of each import fixture (BOM, CRLF, semicolons, extra columns, blank lines, quoted commas) with the transformation named (S2); Greek rows of `legal-table.json` as drafts only (S3 and the L4 lawyer pass decide). Not for the local model: expected values and generators.

## 12. Risks

| # | Risk | Fallback |
|---|---|---|
| R1 | A real broker file differs from the sampled layout. | Columns by header name; unknown columns ignored; the generic template for anything else; requirements Q2 asks Ion for real exports. |
| R2 | The IBKR or MT4 file zone is wrong. | Asked once per account and editable; `tz_edge` catches edge effects; re-import replaces the import's trades (raw text kept). |
| R3 | Users skip the broker figure (PICK R2). | The step is in the import flow and on the dashboard, skippable with one tap; "not reconciled" per account and period until answered. |
| R4 | The explanation search misattributes a difference. | Only candidates with an amount known from the file or the user's answers; exact subset match within tolerance, at most 3 items; no residual is ever fitted to an empty field; shown as a possible cause with links; nothing applied. |
| R5 | IBKR broker realised P&L uses FIFO lots while the app groups round trips; `broker_mismatch` fires on scale-in and scale-out trades. | Money rules make the broker figure the net; the question is asked once per import with one answer for all; the recomputed figure stays visible. |
| R6 | On-device model too big or absent on phones (830 MB, 1.6 GB GPU memory, phones unverified). | Rules write every review; the model only rewords; the engine and state are always shown. |
| R7 | A paraphrase passes the guard. | Template sentences are the default and the fallback; future tense and imperatives are rejected wholesale; the legal table is a test fixture; L4 adds any phrase found in reading to `banned.js`. |
| R8 | 2,000-row imports block the UI. | Chunks of 200 rows with `await` and progress events; a Worker next if `timing` fails. |
| R9 | iOS evicts site data. | `storage.persist()`, export reminder every 50 trades, About text. |
| R10 | Float error in money. | Exact decimal storage and size arithmetic; one rounding point per trade; integer sums; half-case tests. |
| R11 | Cloud sessions blocked. | The specs are self-contained; an S2 seat builds them locally in the same order. |
| R12 | Shards collide on shared files. | Section 10 ownership; catalogues split per shard; `sw.js` list regenerated by script. |
