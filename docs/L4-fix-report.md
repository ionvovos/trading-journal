# L4 fix round: security findings (partial)

Phase `nexa-build-trading-journal-2026-09-29-L4fix`. Source: `reports/trading-journal/security-review.md` (ais-os), ruling `RULING-L4-F5.md`. Status: all twelve L4b findings are fixed; the L4a items are not started (L4a's `test-results.md` had not landed).

`npm test`: 899 tests, 896 pass, 0 fail, 3 todo. The 3 todo are L4a's `tests/l4` defects (F2, F3, F4 of that seat), not touched. Real Chrome: `node e2e/review-model-text.mjs` 15/15, `node tests/security/browser-probe.mjs` 30/30, `node e2e/delete-all.mjs` 15/15.

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

- F1. Not done: the L4a items (`reports/trading-journal/test-results.md` was absent). The 3 todo tests in `tests/l4` remain.
- F2. Not done: architecture section 5.2 still describes rewording.
- F3. `screenModelText`, `numbersMatch` and related guard code are no longer called by the app; only tests use them.
- F4. Tests that pinned the retired reword contract were rewritten, not weakened. `tests/security/local-model/analyse.mjs` reads the saved L4b outputs with an inlined legacy parser.
- F5. Envelope not recorded (usage limit).

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
