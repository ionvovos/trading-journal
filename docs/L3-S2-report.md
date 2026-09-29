# L3 S2 report: data layer, import, broker check, statistics, journal screens

Seat S2 (`aios-nextjs-developer`), phase `nexa-build-trading-journal-2026-09-29-L3-S2`. Repo `main`, last S2 commit before this file `c25f03f`. `npm test`: 744 of 744 pass, 0 skipped (Node 22, no dependencies).

## 1. What was built

| Area | Files | Notes |
|---|---|---|
| Core (step 0, pushed first as `038cc0e`) | `src/core/{decimal,money,time,trade}.js` | Exact decimals (BigInt, 18 places); `parseDecimal` rejects `1,5` under a point decimal instead of reading 15; `parseUserDecimal` for form fields; zones by IANA name or `ny+N`; `zoneOffsetMs`, `localParts`, `inLocalWindow`. |
| Readers (step 0) | `src/import/{csv,htmlTable,registry,decode}.js` | CSV with BOM, CRLF, `,`/`;`, quotes; HTML rows without a DOM; UTF-8/UTF-16/Windows-1252 file decoding. The registry now imports the four formats statically. |
| Grouping | `src/import/{group,anomalies}.js` | Fills to trades by exact running position; eleven anomaly kinds with answers and per-trade overrides; deterministic ids from the first fill key, so an answer rebuilds from the stored raw text and keeps what the person typed on the trades. |
| Import flow | `src/import/{run,reportHtml}.js` | `runImport`, `answerAnomaly`, `commitImport`, progress events, report JSON and printable HTML (escaped, no external reference). |
| Broker check | `src/import/reconcile.js` | `realisedTotal`, `reconcile` (net P&L and balance forms), explanation search (at most 3 of 24 candidates, every amount known, no fitted residual), `reconcileQuantity`. |
| Storage | `src/storage/{idb,memory,migrate,exportImport,settings,model,actions,periods,viewkit,statsModel,summary}.js` | IndexedDB v1 and an identical memory store, migration chain, all-or-nothing export/import, delete all, manual trade builder, periods per account, `getSummary` for the dashboard. |
| Views | `src/ui/views/{accounts,cash,dataSettings,tradeForm,journal,trade,bulkStops,import,reconcile,stats,calendar,drill}.js`, `css/views/data.css` | `openTradeForm` and `renderDataSettings` exported as the contract says. |
| Catalogues | `src/i18n/{en,el}/data.js` | English final; Greek is a first draft for C6. About 520 keys, run through S1's parity and boundary tests. |

## 2. Tests (S2 paths)

- `tests/core` (3 files), `tests/import` (15 files), `tests/storage` (8 files), `tests/stats` (C5's 8 files plus `entryUnknown`).
- `tests/import/integration.test.mjs`: the four real parsers, grouping, both answers for NVDA, the Kraken dust threshold and EUR rate, the MT4 ticket chain, the generic template, re-import, and all `tests/fixtures/reconcile/cases.json` cases with real parsers and the real statistics engine. Every expected value is the hand-computed one; none was changed.
- `tests/import/timing.test.mjs`: 2,000 rows per format import in well under the 10 s bound (0.13 to 0.6 s each on this machine, question answering included) with progress events reaching their total; every question kind can be answered.
- `tests/import/noise.test.mjs`: 22 format-noise cases (see section 4).
- `tests/storage/summary.test.mjs`: statistics as the screens read them over `stats/core.json`, drill formulas, and export then import reproducing net, R, win rate, profit factor, expectancy, drawdown, fees, streaks, holding, calendar and all buckets (AC-P3.5).
- Headless Chrome checks by hand through `e2e/lib/cdp.mjs` (not committed, they are L4's flows): accounts, cash, data settings, trade form (saved a trade: risk 125.00 USD, result +84.00, +0.67R), journal, trade detail, bulk stops, statistics overview and buckets, calendar, drill-down, the whole IBKR import through the file input, both answers, and the broker check. No console error other than the favicon 404.

## 3. Cloud reviews (step 4)

Each branch was diffed against its merge-base (only the files its spec lists), its done command was run in a detached worktree, and the merge into `main` was `--no-ff`. The branches reached origin through the main orchestrator (the cloud sessions got a 403 on push).

| Session | Branch, sha | Done command | Result | Verdict |
|---|---|---|---|---|
| C1 | `cloud/c1-ibkr` `c319d77`, merge `1b8adc9` | `node --test tests/import/ibkr-activity.test.mjs` | 14/14 | Accepted. S2 change afterwards: `detect` also matches when every field is quoted (found by the noise test). |
| C2 | `cloud/c2-kraken` `cb2a112`, merge `8e9181b` | `node --test tests/import/kraken-trades.test.mjs` | 12/12 | Accepted. Throws a plain `Error('import.error.columns')` for missing columns; the import screen reads `error.message` as the catalogue key. |
| C3 | `cloud/c3-mt4` `b8220a0`, merge `f5704fa` | `node --test tests/import/mt4-statement.test.mjs` | 20/20 | Accepted. The opening fill carries `fee: null` (the spec puts commission on the closing row); `group.js` treats `mt4:*:open` as fee 0 instead of asking a missing-fee question that would hold every MT4 trade (found by the integration test). |
| C4 | `cloud/c4-generic` `0165c3b`, merge `2c213b1` | `node --test tests/import/generic-csv.test.mjs` | 11/11 | Accepted. S2 change afterwards: `contract_value` now reaches the trade; a blank quote or fee currency means the account currency instead of a rate question. |
| C5 | `cloud/c5-stats` `8febd19`, merge `3512552` | `node --test 'tests/stats/**/*.test.mjs'` | 77/77 | Accepted. S2 change afterwards: a trade whose opening lies before the file and whose broker figure was kept (`entryUnknown`) counts as closed with the broker net and R unknown (before, it fell out of every statistic and disagreed with the broker check). `firstEntry` falls back to the earliest exit for such a trade. New test `tests/stats/entryUnknown.test.mjs`. |

After the four merges `npm test` was green apart from tests belonging to other shards that were still in progress; at the end of the stage it is 744/744.

## 4. Local model (AM5)

oMLX was not up (`tools/aios-lane-liveness.mjs`: local-model DOWN) and no go came from the orchestrator, so the model was not used: 0 variants generated, 0 accepted, 0 rejected. The stage's purpose, showing that format noise does not change what a parser reads, was covered by code instead: `tests/import/noise.test.mjs` builds variants by named transformations (BOM, CRLF, blank lines, BOM+CRLF+blank, semicolon delimiter, extra column, reordered columns, every field quoted) of the Kraken, generic and IBKR fixtures and compares fills, cash, funding, skipped reasons and `sizeStep` with the plain file. 22 cases pass. The MT4 HTML has its own encoding cases in `tests/import/decode.test.mjs` (UTF-16 with and without BOM). Nothing generated by a model is committed.

## 5. Acceptance criteria tagged to S2 paths

Unit or headless-by-script coverage in `npm test`, by criterion:

- P1: 1.2-1.4 `actions.test`, `group.test`; 1.7 `actions.test` (`openTradeToAsk`) and the journal banner; 1.8-1.11 `integration.test`, `run.test`, `viewModels.test`.
- P3.5 and P8.3: `summary.test`, `export.test`. P8.4: `migrate.test` (synthetic v2 keeps all other fields). P8.5, P8.9: `actions.test` (`exportDue`, `deleteAllData`), data settings view.
- A1-A5: `reconcile.test`, `integration.test` (all cases of `reconcile/cases.json`), `reportHtml.test`, `summary.test` (drill lists sum to the headline, formulas carry this journal's numbers).
- U2.1: `timing.test`.
- The `[screenshot]`, `[phone]` and browser-flow criteria of these screens (P1.1 timer, P3.7, D-series, U-series, AC-P8.2 network log, offline) are L4's flows and were only spot-checked as described in section 2.

## 6. Findings for the orchestrator

- **F1** S1's `createSettings` reads only its own keys at boot, so a key added by another shard is lost on reload. S2 reads `lastExportAt` from the store directly. S1 could pass the extra keys.
- **F2** `sw.js` precache list: S2 ran `tools/shell-list.mjs` after adding files as S1 asked; the list must be regenerated again after the last file of any shard (S1 owns it).
- **F3** Two scratch git worktrees remain registered under `/private/tmp/claude-501/` (`wt-m1`, `wt-review`); removing a worktree with uncommitted merge state needs `--force`, which the no-touch hook blocks. They are outside the repo and harmless; `git worktree prune` after deleting the directories clears them.
- **F4** `getSummary` returns `exportDue`; the home dashboard does not show it yet. S2 shows the export reminder in Settings > Your data only.
- **F5** MT4 hedging accounts: fills are grouped by `positionId` when set, otherwise by instrument, so two overlapping tickets on the same pair net into one trade. Real statements were not available (Q2).
- **F6** IBKR and MT4 file time zones are still unverified on real files (R1); the question is asked once per account and can be changed.
- **F7** Greek text in `src/i18n/el/data.js` is a first draft. The Greek delete word is «ΔΙΑΓΡΑΦΗ»; C6 should keep the `data.delete.word` key.
- **F8** `stats.rMultiple`, `rBreakdown` and `tradeMoney` take the statistics context as second argument (currency digits); all views pass it. S3 code that calls them without it would round a JPY account as 2 digits.
- **F9** The trade form shows dates and times as plain `YYYY-MM-DD HH:MM` text fields; native date controls were clipped at 390 px and break AC-D4.1. A styled picker is an L4 or design decision.
- **F10** `docs/generic-template.csv` is linked as `./docs/generic-template.csv`; it is served by Pages but not precached by `sw.js`, so the template download needs a connection the first time.
