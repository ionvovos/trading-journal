# C5: statistics engine S1-S18

Build per this file, `docs/architecture.md` §3 and §4.1, and `docs/requirements.md` P2.6, P3 and P4.5.

## Own (write only these)
- `src/stats/**` (`index.js` re-exports everything; split files as you like, for example `trade.js`, `sets.js`, `curve.js`, `buckets.js`, `sessions.js`, `calendar.js`, `compare.js`, `explain.js`, `sizing.js`)
- `tests/stats/**`

## Uses (already on main, read only)
- `src/core/decimal.js`: exact decimal arithmetic on strings (`add`, `sub`, `mul`, `cmp`, `isZero`, `toNumber`).
- `src/core/money.js`: `roundMinor(x, digits) → integer` (half away from zero), `minorDigits(currency) → integer`.
- `src/core/time.js`: `localParts(isoUtc, zone, cutoffHour = 0) → { date: 'YYYY-MM-DD', hour, minute, weekday }` (weekday ISO 1-7 after the cutoff shift; hour and minute are wall time), `inLocalWindow(isoUtc, zone, 'HH:MM', 'HH:MM') → boolean` (start inclusive, end exclusive, wraps midnight).

## Contract
Every function of `docs/architecture.md` §3.2 with those names and return shapes: `grossPnl`, `tradeMoney`, `closedSet`, `openRisk`, `winRate`, `avgWinLoss`, `profitFactor`, `initialRisk`, `rMultiple`, `rBreakdown`, `expectancy`, `equityCurve`, `drawdown`, `buckets` (including `account` and `session`), `calendar`, `feeTotals`, `streaks`, `ruleFollowing`, `pips`, `pipsByPair`, `holdingTime`, `compareModes`, `equityAtEntry`, `explain`, `positionSize`. Trades have the shape of §4.1 (prices, sizes, fees and stops are decimal strings). Pure: no clock, no I/O; `ctx` as in §3.1.

Details that decide results:
- Closed: Σ entry size − Σ exit size, exactly (decimal), is zero or equals `dustRemainder`, and both kinds of leg exist. `closedSet` order: other mode, other account, held out (`holds.length > 0`, checked before any arithmetic: a held-out trade may have only exit legs), `excluded`, open.
- `tradeMoney`: recomputed `grossMinor = roundMinor(gross)`, `fundingMinor = roundMinor(funding)`, `recomputedNetMinor = roundMinor(gross − fees + funding)`; `netMinor` = `trade.broker.netMinor` when present (`source: 'broker'`), else the recomputed one (`source: 'app'`); `feesMinor = grossMinor + fundingMinor − recomputedNetMinor`. A leg fee of null counts 0.
- A view over several accounts converts each trade's `netMinor` with the account's `toDisplayRate` and rounds once (`roundMinor`); all fixture accounts are USD with rate 1.
- R = (netMinor / 10^digits) / initial risk. Winner > 0, loser < 0, break-even = 0 (neither; ends both streaks).
- Hour, weekday and session use the first entry leg; calendar uses `closeTime` or `closeDayOverride`; both in `ctx.tz`, weekday and day with `ctx.dayCutoffHour`. Session rules and precedence are in §3.2 ("Sessions").
- `buckets` returns rows in the fixed neutral order of §3.2 (alphabetical with "No setup" last; hours 0-23; weekdays 1-7; sessions in the listed order). It returns no rank and no "best" field (AC-B1.4).
- `rBreakdown` only when R < −1 and the stop is known; `otherR` within 1e-9 of 0 counts as 0.
- `positionSize` rounds the size down to `sizeStep` and recomputes the risk at that size; it has no default for any input.
- `explain(figureId, set, ctx)` returns trade ids whose values sum exactly (integers) to the headline money figure.

## Fixtures (hand-computed; do not edit)
- `tests/fixtures/stats/core.json`: `ctx`, ten trades in four accounts, `handChecks`, and `expected` for `perTrade`, `S3`-`S18`, `S8_breakdown`, `S12` (setup, market, weekday, hour, account, session), `S13_utc`. In `S12` the buckets are objects keyed by the bucket key as a string (`"null"` is "No setup"); the function returns the array form.
- `tests/fixtures/stats/requirements-cases.json`: drawdown 12,000 → 9,600 (20.0 %, recovery 25.0 %), trough at or below zero, expectancy 40 % × 2R − 60 % × 1R = +0.2R, stop slippage −1.2R and −1.22R with its breakdown, profit factor with no losses, the four position-size cases, rounding cases.

## Tests to write
One file per group (`s01-s08.test.mjs`, `s09-s11.test.mjs`, `s12-s18.test.mjs`, `compare.test.mjs`, `explain.test.mjs`, `sizing.test.mjs`, `requirements.test.mjs`) asserting every value in both fixtures; `invariants.test.mjs` on 250 trades from a seeded mulberry32 generator written in the test (both modes, three accounts, all markets, some without stop, some break-even, some held out and open): Σ day cells = month; Σ week rows = month; Σ over setups incl. "No setup" = total; Σ over markets, accounts, weekdays and sessions = total; R-known + R-unknown = |S3|; expectancy R equals the by-parts form to 1e-9; `explain` lists sum to each headline. `compareModes` on core.json (T10 is paper) returns both modes and `missing: null` for a period covering 2-11 March, and `missing: 'paper'` for 2-10 March.

## Done
`node --test 'tests/stats/**/*.test.mjs'` exits 0.
## Rules
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files listed under Own. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Prices, sizes and money amounts in fills are decimal strings exactly as normalised by `parseDecimal`; never convert them to numbers inside a parser. Expected values in fixtures that are numbers compare numerically (`Number(actual) === expected`, or within 1e-9 for ratios).
- Every expected value comes from the fixture files; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Skip and error reasons are catalogue keys (`import.skip.number`), never English sentences.
- Contract of record: `docs/architecture.md` §2 (formats, ParseResult, Fill) and §3 (statistics), requirements at `docs/requirements.md`.

