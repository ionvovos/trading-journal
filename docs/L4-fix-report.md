# L4 fix round: security findings (partial)

Phase `nexa-build-trading-journal-2026-09-29-L4fix`. Source: `reports/trading-journal/security-review.md` (ais-os), ruling `RULING-L4-F5.md`. Status: all twelve L4b findings and the app-code L4a findings are fixed (addendum below).

`npm test` after the L4b part: 899 tests, 896 pass, 3 todo (L4a defects, fixed in the addendum). Real Chrome: `node e2e/review-model-text.mjs` 15/15, `node tests/security/browser-probe.mjs` 30/30, `node e2e/delete-all.mjs` 15/15.

| ID | Fix | Where | Test |
|---|---|---|---|
| F5 (R1) | The model returns only `{"order":[ids]}`. Unknown or repeated ids are dropped, any text is dropped. Every sentence shown is a template sentence. A finding that quotes the plan rule is not sent and keeps its place. | `src/ai/prompts.js` `arrangePrompt`, `src/ai/adapter.js` `validateArrange`, `src/review/run.js` | `tests/security/boundary.test.mjs` "model gate" (both corpora, 5 reply shapes, 3 weeks, EN and EL), `tests/review/noAdvice.test.mjs`, `e2e/review-model-text.mjs` (rendered DOM) |
| F9, F10, F11 | Closed by F5. | same | `tests/security/local-model.test.mjs`: all 148 saved outputs replayed through the real provider code, none reaches the review |
| F2, F3 (R2) | Import takes an allow-list of data settings with plain values; `ai.*` is neither exported nor imported. Typed address refused with a query string, user-info or plain http off this device. `.local` is no longer local. | `src/storage/settings.js`, `src/storage/exportImport.js`, `src/ai/adapter.js` `checkBaseUrl`, `src/ui/views/aiSettings.js` | `tests/security/keys.test.mjs` (file with `ai.baseUrl` imports its trades, changes no setting), `tests/ai/adapter.test.mjs`, browser probe |
| F12 (R3) | "Use <model value>" removed. Both values are shown, the person types the value. Merged values equal the code parse. | `src/ui/views/sentence.js` | `tests/security/local-model.test.mjs` |
| F1 | Scheme is part of the key binding; a binding without scheme hands out nothing. | `src/ai/adapter.js` `keyBinding`, `src/ai/keystore.js` | `tests/security/keys.test.mjs` |
| F4 | Setup names listed as sent in the disclosure (EN, EL). | `src/ui/views/aiSettings.js`, `src/i18n/*/review.js` | `tests/security/network.test.mjs` |
| F6 | Model notes kept only when a substring of the typed sentence. | `src/sentence/assist.js` | `tests/sentence/assist.test.mjs`, boundary test |
| F7 | Plan rows validated on import; `evaluatePlan` and the hours pattern ignore malformed windows. | `src/storage/exportImport.js`, `src/plan/check.js`, `src/review/patterns.js` | boundary test |
| F8 | Restore refuses a file over 100 MB before reading it. | `src/ui/views/dataSettings.js` | `tests/security/storage.test.mjs` |

## For the Ion page

- Cut from v1: the model no longer words review sentences. It only orders findings. The AI screen and review footer say so (EN, EL).
- The Greek strings I added were written by me and need the Greek reviewer.
- A key saved before this build has no scheme in its binding and stops being used; the person types it again.

## Findings for the orchestrator

- F1. `screenModelText`, `numbersMatch` and related guard code are no longer called by the app; only tests use them.
- F2. Tests that pinned the retired reword contract were rewritten, not weakened. `tests/security/local-model/analyse.mjs` reads the saved L4b outputs with an inlined legacy parser.
- F3. Architecture 5.2 now carries a note on the order-only contract; its step table still describes the earlier flow.

## Addendum: L4a findings (test-results.md F1-F10)

`npm test`: 900 tests, 900 pass, 0 fail, 0 todo. `e2e/smoke.mjs beginner trader offline` 60/60 (F1 and F2 gone); `e2e/greek.mjs` 11/11; `e2e/visual.mjs en` 264 screenshots, 0 findings (touch targets included); `e2e/review-model-text.mjs` and `tests/security/browser-probe.mjs` unchanged and passing earlier in this round.

| ID | Fix | Where | Test |
|---|---|---|---|
| L4a F1 | Summary module path list is `./storage/summary.js` only (the probe for `./stats/summary.js` was a 404 on every load). | `src/app.js:16` | smoke: no 404 |
| L4a F2 | `closeTime` recomputed once `keep_broker_pnl` sets `entryUnknown`. | `src/import/group.js` (line 405) | `tests/l4/defects-l4.test.mjs` F2 (was todo) |
| L4a F3 | Statistics context passed to winRate, avgWinLoss, profitFactor, feeTotals, streaks, ruleFollowing, holdingTime. | `src/storage/statsModel.js` | defects-l4 F3 (was todo) |
| L4a F4 | Trades with no entry leg are not offered for stops. | `src/ui/views/bulkStops.js` `stopCandidates` | defects-l4 F4 (was todo) |
| L4a F5 | Decision, no code: `setup`, `crypto`, `forex` join the stated Latin list (the catalogue tests already allowed them); the language name `English`, IANA zone ids and source names stay as proper names. The e2e list and `docs/architecture.md` now say so. About page is the pinned lawyer text and is not scanned. | `e2e/greek.mjs`, `docs/architecture.md` | greek e2e 11/11 |
| L4a F6 | `.link-val`, `.link-row` and calendar cells have `min-height: 44px`; calendar week-total column narrowed (0.85fr) and gap 2px. Residual: at 360 px wide a calendar cell is about 40 px wide (8 columns cannot reach 44 px). | `css/views/data.css`, `css/screens.css`, `css/charts.css` | visual sweep: 0 findings |
| L4a F7 | Re-importing the same file (same account, identical text) carries over an earlier "continue" for unreadable rows; "cancel_import" is never carried. | `src/import/run.js`, `src/ui/views/import.js` | `tests/l4/import-noise-l4.test.mjs` |
| L4a F8 | IBKR detect accepts `DataDiscriminator` anywhere in the Trades header line. | `src/import/formats/ibkr-activity.js` | import-noise reordered-columns case now asserts detection |
| L4a F9 | Not changed. The plan-check sheet after a paper save stays open across route changes; I could not confirm from the requirements that this is intended. Orchestrator decision. | | |
| L4a F10 | Not changed. The 387-link question card is long but functional; collapsing it is a design change outside this round. | | |

## V2 repair

Gate `GATE-V2.md` (BLOCK 72) and `review-V2.md`. `npm test`: 914 tests, 914 pass (14 new in `tests/shell/v2repair.test.mjs`, 2 in `tests/l4/reconcile-l4.test.mjs`). Real Chrome, all pass: `e2e/tap-points.mjs` (new, hit-test with `elementFromPoint`), `e2e/back-nav.mjs` (new), `e2e/clip-probe.mjs` (new; clipped text, header overlap and SVG text overlap, 10 routes, EN and EL, 390x844 and 360x800: 0 findings), `e2e/smoke.mjs beginner trader offline` 60/60, `e2e/greek.mjs` 11/11, `e2e/review-model-text.mjs` 15/15, `tests/security/browser-probe.mjs` 30/30, `e2e/delete-all.mjs` 15/15, `e2e/visual.mjs en` 304 screenshots, 0 findings.

| ID | Fix | Where | Test |
|---|---|---|---|
| G1 | The plan route hides the tab bar (`chrome: 'none'`), as in the mockup. | `src/ui/routes.js` | `tap-points.mjs`: centre, top, bottom and quarter points of Save hit the button on plan and sentence at both sizes; `v2repair` G1: every route whose view has a fixed action bar has no tab bar |
| G2 | Week totals are found by the Monday a row starts on (`weekRows`), not by position in the list of weeks with trades. | `src/ui/charts/calendarGrid.js` | `v2repair` G2: September 2026 rows, and week cells sum to the month cell for 12 months in two zones |
| G3 | Display currency defaults to the currency all accounts of the mode share (`ctx.displayCurrencyFor`, refreshed on every route); an amount with no typed rate is not converted (`toDisplayMinor` returns null); an account in another currency than its display currency must carry a rate (`validateAccount`); Statistics and Home show "A rate is missing" and leave that account out of the totals. Account sheet: the first account of a mode needs no rate. | `src/ui/ctx.js`, `src/storage/viewkit.js`, `src/storage/actions.js`, `src/storage/statsModel.js`, `src/ui/views/accounts.js`, `stats.js`, `home.js` | `v2repair` G3 (four tests, including the U3 EUR case) |
| G4 | X labels thinned by measured width; one x axis (under the drawdown panel); the drawdown band with peak and low markers now drawn on the equity chart; the "0" tick label removed and the trough label kept inside the plot. | `src/ui/charts/lineChart.js`, `underwaterChart.js`, `src/ui/views/stats.js` | `v2repair` G4; `clip-probe.mjs` SVG text overlap 0 |
| G5 | Rows wrap a tag under the text instead of cutting it; two-line back-bar titles; in Greek a bar with the mode switch puts the title on its own row. | `css/components.css`, `css/app.css` | `clip-probe.mjs` (el, 390 and 360) |
| G6 | (a) Commission and swap are computed per period and named as a cause (`costs_excluded`), with the app total before them shown, so the MT4 hint is true; (b) trades left out by the person are named (`excluded`); (c) the "Answer the import questions" button shows only when questions are open. | `src/import/reconcile.js`, `src/ui/views/reconcile.js`, `src/i18n/*/data.js` | `tests/l4/reconcile-l4.test.mjs` (MT4 76.78 against 74.18 explained by 2.60; IBKR NVDA excluded) |
| G7 | Trade-form time fields take the full width at 400 px and below. | `src/ui/views/tradeForm.js`, `css/components.css` | `clip-probe.mjs` trade/new |
| G8 | The checklist overlay closes on any route change; the plan-check sheet closes on a route change after its own save navigation. (Also answers L4a F9.) | `src/ui/views/checklist.js` | `back-nav.mjs` |
| G9 | About numbers paragraph: "AI, when you turn it on, only puts the findings of a review in order and reads typed sentences. It writes no sentence of a review." (EN and EL). The sentence lives in `src/i18n/*/shell.js` (`about.numbers.body`), not in `src/about/text.js`, and is not hash-pinned; the lawyer may still want to see it. | `src/i18n/en/shell.js`, `el/shell.js` | `v2repair` G9 |
| G10 | Each review card shows 6 trade links and "and N more". | `src/review/viewkit.js`, `src/ui/views/review.js` | `v2repair` G10 |
| G11 | A chip per account of the mode on Statistics ("All accounts" first); a filter that names an account of the other mode resets to all. | `src/ui/views/stats.js` | `v2repair` G11 |
| G12 | Plural "1 win · 2 losses" in EN and EL; calendar "−0" is "0"; Session "none" reads "No session defined (crypto, non-US stocks)". | `src/i18n/*/data.js`, `calendarGrid.js` | `v2repair` G12 |
| G13 | The probe gap is closed by the new e2e scripts (SVG text, text overlap, real tap points); `flow.mjs` itself is unchanged. `reports/trading-journal/test-results.md` and `os/eval/trading-journal.json` in ais-os carry old counts (899/891) and are not mine to edit. | `e2e/clip-probe.mjs`, `e2e/tap-points.mjs` | |

Not done (LOW, from review-V2 F6, F7, F9, F12 and G12): swap or funding field on manual entry, currency suffix on forex prices, median threshold label on the review card, cancelled MT4 order counted as unreadable, period chip chevron. They change data entry or the review card and were outside the quota for this round.

Residual: at 360 px a calendar cell is about 40 px wide (eight columns).
