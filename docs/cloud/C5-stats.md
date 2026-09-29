# C5: statistics engine S1-S16

Build per this file and `docs/architecture.md` sections 3 and 4.1 and `docs/requirements.md` P3 (repo-relative). Rules: see the bottom of this file.

## Own (write only these)
- `src/stats/**` (`index.js` re-exports everything; split files as you like, for example `trade.js`, `sets.js`, `curve.js`, `buckets.js`, `calendar.js`, `compare.js`, `explain.js`, `sizing.js`)
- `tests/stats/**`

## Uses (already on main, read only)
- `src/core/money.js`: `roundMinor(x, digits) → integer` (half away from zero), `minorDigits(currency) → integer`.
- `src/core/time.js`: `localParts(isoUtc, zone, cutoffHour = 0) → { date: 'YYYY-MM-DD', hour, weekday }` (weekday ISO 1-7; `cutoffHour` shifts the day boundary; `hour` ignores the cutoff).

## Contract
Every function in `docs/architecture.md` §3.2, with those exact names and return shapes: `grossPnl`, `tradeMoney`, `closedSet`, `winRate`, `avgWinLoss`, `profitFactor`, `initialRisk`, `rMultiple`, `expectancy`, `equityCurve`, `drawdown`, `buckets`, `calendar`, `feeTotals`, `streaks`, `ruleFollowing`, `compareModes`, `explain`, and `positionSize`. Trades have the shape of §4.1. Pure: no clock, no I/O; `ctx` as in §3.1.
Details that decide results:
- A trade is closed when Σ entry size = Σ exit size + `writeOffSize` (default 0; relative tolerance 1e-12) and both entry and exit legs exist. Status order in `closedSet`: other mode, then `holds.length > 0` (held out, checked before any arithmetic: a held-out trade may have only exit legs), then `excluded` (user or import), then open.
- `tradeMoney`: `grossMinor = roundMinor(gross)`, `fundingMinor = roundMinor(funding)`, `netMinor = roundMinor(gross − fees + funding)`, `feesMinor = grossMinor + fundingMinor − netMinor`. Fees = Σ leg `fee × feeToAccount`; a leg with `fee: null` counts 0.
- R = (netMinor / 10^digits) / initialRisk. Win: netMinor > 0; loss: netMinor < 0; breakeven is neither and ends both streaks.
- Hour and weekday buckets use the first entry leg's time; calendar uses `closeTime` (or `closeDayOverride`); both through `localParts` with `ctx.tz` and `ctx.dayCutoffHour`.
- In `core.json` the `S12` buckets are objects keyed by bucket key as strings (`"null"` is the No-setup bucket, hours and weekdays are strings); the function returns the array form of §3.2.
- `explain(figureId, set, ctx)` returns trade ids whose values sum to the headline figure exactly (integer minor units) for money figures.

## Fixtures (hand-computed; do not edit)
- `tests/fixtures/stats/core.json`: `ctx`, ten trades, `handChecks`, and `expected` for every figure (`perTrade`, `S3`-`S16`, `S13_utc` for the zone change).
- `tests/fixtures/stats/requirements-cases.json`: drawdown 12,000 → 9,600 (20.0 %, recovery 25.0 %), expectancy 40 % × 2R − 60 % × 1R = +0.2R, stop slippage −1.2R, profit factor with no losses, rounding cases.

## Tests to write
One file per group (`s01-s08.test.mjs`, `s09-s11.test.mjs`, `s12-s16.test.mjs`, `compare.test.mjs`, `explain.test.mjs`, `requirements.test.mjs`) asserting every value in both fixtures; `invariants.test.mjs` on 250 trades from a seeded mulberry32 generator written in the test (both modes, all markets, some without stop, some breakeven, some held out and open): Σ day cells = month; Σ week rows = month; Σ over setups incl. "No setup" = total; Σ over markets = total; Σ over weekdays = total; R-known + R-unknown = |S3|; expectancy R equals the by-parts form to 1e-9; `explain` lists sum to each headline. `compareModes` on core.json plus the paper trade T10 returns `missing: null` only when both modes have closed trades in the period.

## Done
`node --test 'tests/stats/**/*.test.mjs'` exits 0.

Rules for every cloud session (repeated in each spec):
- Repo: github.com/ionvovos/trading-journal, branch from `main`. Read anything in the repo; write only the files your spec lists. Push your branch; do not merge.
- Node 22, plain ES modules (`.js` in `src/`, `.test.mjs` in `tests/`), no npm dependencies, no network, no DOM. Tests use `node:test` and `node:assert/strict`.
- Money: integers in minor units from the per-trade rounding point on, via `roundMinor` from `src/core/money.js`. Compare R and ratios with tolerance 1e-9.
- Every expected value comes from the fixture's `.expected.json`; do not change a fixture or an expected value. If you believe one is wrong, write the reason in `docs/cloud/<id>-NOTES.md` on your branch and make the test assert the fixture value anyway.
- Error and skip reasons are catalogue keys (`import.skip.number`), never English sentences.
