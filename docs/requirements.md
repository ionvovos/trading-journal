# Requirements: trading journal (L1)

Phase `nexa-build-trading-journal-2026-09-29-L1`. Author: aios-product-manager. Inputs: `BRIEF-TEAM.md` (P1-P10, Boundary, AM3), `PICK.md` K1-K4, `ANGLES.md` Angle 1 and the A2 verdict, `domain-pack.md` (§2 definitions, §3 signals, §5 markets, §6 boundary, §7 grading list). No stack or design decisions are made here.

## 1. Who it is for and the job

Three kinds of people keep a trade record in this app: a beginner who has not traded yet and starts on paper, friends and family who trade now and then from a phone, and experienced traders with a year or more of history. Markets are stocks, crypto and forex. The job, stated through the picked angle: the journal whose numbers you can check against your broker. After an import the app asks for the broker's own period total, compares it with its own, holds every unexplained trade out of the statistics until the user answers one question per anomaly, and names the trades that explain any difference. Every figure opens to the trades and arithmetic behind it, so a beginner also learns each term from their own numbers. Paper-versus-real comparison and one-sentence entry ship as features (K2), not as the angle.

Conventions. Each criterion is tagged `[unit]` (computed figure or stored-data fact checked by code against a hand-computed fixture), `[headless]` (scripted user flow in a headless browser), `[screenshot]` or `[phone]` (fact read from a screenshot at 390x844 or 360x800, light and dark unless stated). "Mode" means paper or real. Working terms:
- **Leg**: one fill or manual entry or exit. **Trade**: the legs of one instrument, one direction, one mode, from the first entry to the leg that brings size to zero. **Closed trade**: a trade whose size is zero. **Open trade**: any other.
- **Held-out trade**: a trade with an unanswered import anomaly. Held-out and open trades appear in no statistic (S-rules in P3).
- **Account currency**: one per mode, set by the user. **Declared timezone**: one per journal, set by the user, default the device zone.

## P1. Journal

Log a trade by hand in seconds, by one typed sentence, or by importing broker and exchange files. Manual and sentence entry work with no broker connection and offline.

- AC-P1.1 `[headless]` From the home screen a trade with instrument, market, side, size, entry, stop, exit and fees is saved in 30 seconds or fewer by a scripted user (timer recorded).
- AC-P1.2 `[unit]` The record holds: instrument, market, mode, side, size in the market's native unit (shares, coins, lots), each leg's price and time (UTC, plus the declared timezone at entry), initial stop, later stop moves, target, fees, funding or swap as separate fields, setup, plan-followed mark, notes, mood before and after, one screenshot. Only instrument, side, size, entry price and entry time are required.
- AC-P1.3 `[unit]` A trade saved without an initial stop is stored, shows "R unknown" wherever R would appear and is counted in the R-missing figure (S8).
- AC-P1.4 `[headless]` Partial exits and scale-ins entered as several legs combine into one trade with the correct size-weighted average entry and exit (fixture: buy 30 at 50, buy 20 at 52, sell 50 at 55 gives average entry 50.80).
- AC-P1.5 `[headless]` One-sentence entry ("bought 0.2 ETH at 2410, stop 2350, breakout"; same sentence in Greek with decimal comma) is parsed by code first. The parsed trade is shown field by field and saved only after one tap. A field that cannot be read stays empty and is asked for, one question at a time; the app never guesses a number.
- AC-P1.6 `[unit]` Sentence parsing works with no model and no network. When a model refines free text, the number fields shown in the confirm step still come from the code parser; a mismatch between the two is shown to the user, not resolved silently.
- AC-P1.7 `[headless]` A trade left open for a user-set number of days (default 7) appears in an "open trades" list asking for the exit; after 7 days without any entry the app shows one question, not repeated reminders.
- AC-P1.8 `[headless]` Import accepts at least one common file format per market (stocks, crypto, forex). Each format named in `architecture.md` loads a fixture file, produces the import report (A4) and builds trades with the same average entry, exit, fees and net P&L as a hand-computed expectation.
- AC-P1.9 `[unit]` Deposit, withdrawal and balance rows are never trades. Rows the parser cannot read are skipped and listed with the reason.
- AC-P1.10 `[headless]` Importing the same file twice creates no duplicate trade; the second report says how many rows matched earlier imports.

## P2. Plan before the trade

The user writes their own rules. Before a trade the app shows the user's checklist; afterwards it records whether the trade followed the plan. The app never proposes a rule as recommended.

- AC-P2.1 `[headless]` A plan holds checklist items (free text, tick or not), allowed setups, allowed hours in the declared timezone, a daily trade cap, a risk per trade in percent of equity and a daily loss limit. Every field is optional and editable.
- AC-P2.2 `[headless]` Starting a new trade with a plan active shows the checklist first; items may be ticked, left, or the step skipped with one tap. Skipping never blocks saving the trade.
- AC-P2.3 `[unit]` After saving, checks the code can decide (entry outside allowed hours, daily cap exceeded, risk above the plan percent, no stop, setup not in the allowed list) are computed. The user confirms or overrides the plan-followed mark; the mark and the per-item results are stored.
- AC-P2.4 `[unit]` Rule-following rate = trades marked followed / closed trades that carry a mark, with the count of unmarked trades beside it. The trades behind the rate open from the figure.
- AC-P2.5 `[screenshot]` Example plans offered to a beginner are labelled "an example, yours to change", none is preselected, and no example names an instrument.

## P3. Honest statistics

Every figure is computed by code from stored trades and unit-tested against hand-computed fixtures. AI never produces or edits a number. All figures are per mode; no screen shows a paper and real combined figure. Definitions below are the contract for the architect and the test engineer.

Money rules. Each closed trade's net P&L is rounded once to the minor unit of the account currency and every aggregate is a sum of those rounded values, so a displayed total equals the sum of the displayed rows exactly. A leg priced in another currency stores the conversion rate to account currency; a missing rate is an import anomaly (A2). Pips are never summed across pairs.

- **S1 Gross P&L** of a closed trade: sum over closed size of (exit price minus average entry price) x size x value per unit, sign reversed for shorts, in account currency. Value per unit: 1 for stocks and spot crypto, lot units for forex converted to account currency.
- **S2 Net P&L** = S1 minus fees minus funding or swap paid (funding or swap received adds). Fee charged in coin is converted at the leg's rate. All statistics use net P&L unless they say gross.
- **S3 Closed-trade set**: closed trades in the chosen mode and filter, minus held-out and user-excluded trades. Open trades are listed with their count ("N open trades, not in statistics") and no unrealised P&L is computed.
- **S4 Win rate** = trades with net P&L greater than 0 / trades in S3. A trade with net P&L of exactly 0 is a trade, not a win. Shown only next to expectancy and the trade count.
- **S5 Average win and average loss**: mean net P&L of winners; mean net P&L of losers shown as a positive magnitude; both also in R over trades with known R.
- **S6 Profit factor** = sum of winners' net P&L / absolute sum of losers' net P&L. With no losing trade it shows "undefined, no losses", never a large number or infinity.
- **S7 Initial risk** of a trade = sum over entry legs of |leg entry price minus initial stop| x leg size x value per unit, in account currency. If the stop is missing, equals the entry price, or lies on the profit side, initial risk is unknown and the reason is stored.
- **S8 R-multiple** = net P&L / initial risk, not clipped: a stop filled past its price gives less than -1R (fixture: entry 50, stop 48, 50 shares, exit 47.60 gives -120 / 100 = -1.2R). A trade with unknown initial risk has R null. It is excluded from every R statistic and counted as "R missing on N trades" beside each one; it is never counted as 0R.
- **S9 Expectancy** in R = arithmetic mean of R over trades with known R; it equals win rate x average win R minus loss rate x average loss R on the same trades (both forms are tested and must agree; fixture 40% x 2R minus 60% x 1R = +0.2R). Expectancy in currency = mean net P&L over all trades in S3. Every average shows its trade count; below a user-editable count (default 30) a "small sample" note appears.
- **S10 Equity curve**: starting balance (optional, set by the user per mode) plus cumulative net P&L of closed trades ordered by close time, one point per trade close, ties broken by trade id.
- **S11 Maximum drawdown**: largest peak-to-later-trough fall on the S10 points, in currency and as percent of that peak (percent needs a starting balance above 0 and shown only then). Also shown: current drawdown, peak date, trough date, recovery date or "not recovered", and recovery gain needed = peak / trough minus 1 (fixture: peak 12,000, low 9,600 gives 2,400, 20.0%, recovery 25.0%). Granularity is closed trades; intra-trade swings are not measured, and the screen says so.
- **S12 Buckets** by setup (untagged = "No setup"), market, instrument, hour of day and weekday of the entry time in the declared timezone. Each bucket shows n, net P&L, win rate, expectancy R with its R-known count. Changing the declared timezone or the day cut-off changes the buckets and the screen says it did.
- **S13 Calendar** by day of the close time in the declared timezone with a user-set day cut-off hour (default 00:00). A day cell is the sum of net P&L of trades closed that day. A week row is the sum of its days that fall in the displayed month; a month cell is the sum of its days.
- **S14 Fees view**: total fees and total funding or swap, separately, as amount and as R where R is known.
- **S15 Streaks**: longest run of consecutive winning and of consecutive losing trades in close order.
- **S16 Rule-following rate** as in AC-P2.4.

Acceptance criteria:
- AC-P3.1 `[unit]` S1-S16 each match a hand-computed fixture per market: stock (entry 50, stop 48, 50 shares, exits 55 and 48), crypto (60,000 entry, 58,800 stop, 0.0833 coin, fee 0.1% per side), forex (EUR/USD 0.2 lot, 50 pips, 10 per pip per standard lot; USD/JPY pip value about 6.67 at 150), each with fees, and one stop-out with slippage past the stop.
- AC-P3.2 `[unit]` Invariants hold on a generated set of at least 200 trades: sum of day cells = month cell; sum of week rows = month cell; sum over setups (including "No setup") = total; sum over markets = total; sum over weekdays = total; sum of R-known and R-unknown counts = trades in S3.
- AC-P3.3 `[unit]` A trade with no stop is excluded from S8, S9 R and the R-based bucket figures, present in S4, S6 and currency figures, and the R-missing count equals the number of such trades.
- AC-P3.4 `[unit]` Held-out, open and user-excluded trades appear in no figure; the count of each is shown on every statistics screen.
- AC-P3.5 `[headless]` Export then import (P8) reproduces identical net P&L and R for every trade and identical S1-S16 figures.
- AC-P3.6 `[unit]` The equity curve and drawdown of a fixture with peak 12,000 and low 9,600 show 20.0% and a 25.0% recovery gain; with no starting balance the percent is absent and the screen offers to set one.
- AC-P3.7 `[headless]` Switching mode changes every figure to that mode's trades; no statistics screen can be reached without a visible mode label.

## P4. Paper trades first

A beginner journals simulated trades with exactly the same flow as real ones. Paper and real are kept apart; the comparison between them uses the user's own measures (K2).

- AC-P4.1 `[headless]` Paper entry uses the same fields, plan checklist and review as real entry. Prices are typed by the user; no market data is required.
- AC-P4.2 `[screenshot]` Every screen that shows trades or figures carries a visible mode label, and paper is distinguishable from real by text and colour at both phone sizes.
- AC-P4.3 `[headless]` A paper trade may carry simulated fees and a slippage estimate; the entry form says paper results omit real fills, emotions and often costs.
- AC-P4.4 `[unit]` Paper mode has no broker total, so the reconcile state (A1) is not shown as "not reconciled" for paper.
- AC-P4.5 `[unit]` The paper-versus-real comparison shows, side by side, over a chosen period: rule-following rate, risk per trade as percent of equity at entry, trades per day, and share of trades opened within a user-set number of minutes (default 30) after a losing close. Each figure carries n and opens to its trades.
- AC-P4.6 `[headless]` The comparison appears only when both modes have closed trades in the period; otherwise it says which mode lacks trades.
- AC-P4.7 `[headless]` No text in the comparison says the user is ready or not ready for real money, or should start or stop real trading.

## P5. Review agent

Weekly and on demand, the agent reviews the user's own closed trades in a chosen period and mode, using the pattern signals of `domain-pack.md` §3. It states data, names a pattern in neutral words, asks an open question, and links the trades.

What it may say: past observations of the user's closed trades with the count n; comparisons of the user against themselves; neutral side-by-side data with sample sizes; a quote of the user's own plan rule; open questions ("what was going on?").
What it may not say (B1): any instruction to buy, sell, hold, avoid, close, size up or move a stop; any statement about future prices or outcomes; any statement that a market, instrument or setup is better for the user or should be done more or less; a label on the person; a promise ("guaranteed", "risk-free", "you will recover"); readiness for real money; a study figure (for example Barber and Odean) as a benchmark for the user.

- AC-P5.1 `[unit]` The review computes these patterns by code on seeded data: rule breaks, trades soon after a loss with larger size, overtrading days against the user's own median, size creep against the user's own median, moved or missing stops, winners closed short of the planned target with losers held longer, trades outside the user's hours. Thresholds are editable defaults labelled "your rule, adjustable".
- AC-P5.2 `[headless]` Each pattern claim shows n and opens to the trades behind it. A claim with no linked trades cannot be shown.
- AC-P5.3 `[headless]` When the data contains none of the patterns the review says "no pattern found" and lists what it checked; it invents nothing.
- AC-P5.4 `[unit]` Every sentence shown passes an automated check against the banned patterns above (English and Greek lists). A failing sentence is replaced by the rule-based sentence for the same finding, and the review is labelled as such.
- AC-P5.5 `[unit]` Three seeded losing weeks (one per market) produce reviews with no instruction, no prediction and no person label; the same test runs on model-written text with a stub model that emits banned phrases.
- AC-P5.6 `[unit]` Every figure inside model-written text equals the computed figure for that claim; a mismatch drops the model text for that claim.
- AC-P5.7 `[headless]` With no model available the review is produced by rules and says "written by rules, no model available". Which engine wrote it (rules, on-device model, own key) is shown on every review.
- AC-P5.8 `[unit]` Held-out and open trades are not analysed; the review states how many were left out.
- AC-P5.9 `[headless]` The review opens with process versus outcome for the period (rule-following trades against off-plan trades, each with average R and n), so a stop-out that followed the plan is shown as a followed-plan trade.

## P6. Learn as you go

Plain-language explanations of the terms the app shows, in context, for a beginner.

- AC-P6.1 `[headless]` R, R-multiple, expectancy, drawdown, recovery gain, win rate, profit factor, risk-reward, position sizing, spread, slippage, pip, lot, leverage, funding rate, swap and the others listed as T1-T25 in `domain-pack.md` §4.4 each have an entry in English and Greek.
- AC-P6.2 `[headless]` From any figure, one tap opens its explanation, and one more tap opens the calculation with the user's own numbers (A5).
- AC-P6.3 `[unit]` No learn entry contains a banned pattern from P5 or a sizing or stop level recommendation; entries state facts and the user's own result.
- AC-P6.4 `[headless]` Paper-trading limits (no emotion, instant fills, missing costs) and the base rate of losing retail CFD accounts (`domain-pack.md` §4.3, wording set by the lawyer review) each appear once in the learn layer.

## P7. Languages

- AC-P7.1 `[headless]` English and Greek cover every visible string, review sentence, learn entry, error and the About page; switching language at runtime changes all of them without reload.
- AC-P7.2 `[unit]` Numbers and dates follow the language (decimal comma and point, date order), and sentence entry parses both `0,2` and `0.2`.
- AC-P7.3 `[headless]` The market terms pip, lot, stop, R and funding are either translated with the Latin term shown once beside it or kept in Latin from a stated list; the same term is never both.
- AC-P7.4 `[screenshot]` Greek strings, which run longer, fit at 360x800 with no clipped or overflowing text.

## P8. Data on the device

- AC-P8.1 `[headless]` No account, no login. All data lives on the device; after the first load a scripted session with the network off can log, import, view statistics and export.
- AC-P8.2 `[headless]` During a full scripted session the network log shows only same-origin static files and, when the user has set an own key, requests to the provider host the user chose; no request carries trade data otherwise.
- AC-P8.3 `[headless]` Export produces one file with all trades, plans, settings, import reports and screenshots (the own key is excluded); importing it into an empty install restores everything (AC-P3.5). A version-migrated older export also imports.
- AC-P8.4 `[unit]` A storage schema upgrade keeps every stored trade and statistic unchanged (fixture from the previous schema).
- AC-P8.5 `[headless]` The app asks the browser for persistent storage, tells the user when it is refused, and shows a reminder to export after a user-set number of new trades (default 50).
- AC-P8.6 `[phone]` The app installs to the home screen with its own icon and splash on a phone and opens offline.
- AC-P8.7 `[headless]` Sync and sharing are absent in this build; no control implies they exist.

## P9. AI

Code produces numbers and structure; AI is for understanding: sentence parsing of free text, review wording, plain-language explanations.

- AC-P9.1 `[headless]` With no setup the app works fully on rules. Where the on-device model is feasible (per `architecture.md`) it is the default engine; if the device cannot run it the app says so and uses rules, never a silent failure.
- AC-P9.2 `[headless]` An own key (Anthropic or OpenAI-compatible endpoint) is optional. It is stored on the device, sent only to the provider host the user typed, and excluded from export and from any screenshot or log. Setting it shows what data will be sent.
- AC-P9.3 `[headless]` Each AI feature shows its engine and its state (ready, downloading, unavailable, failed) and a failed call shows an error and the rule-based result.
- AC-P9.4 `[unit]` A stub model returning garbage, a timeout or a banned phrase leaves every figure, entry and review unchanged (P3, P5).

## P10. About page

- AC-P10.1 `[headless]` The About page opens offline in both languages and states in plain words: the app analyses the user's own past trades against the user's own rules; it never tells anyone to buy, sell or hold, never predicts prices, never holds or moves money, never asks for broker login. Wording is the text approved by the lawyer review.
- AC-P10.2 `[headless]` It states how numbers are computed (links to definitions S1-S16), that data stays on the device, what leaves with an own key, the broker-check step, the licence, and where the code lives.
- AC-P10.3 `[headless]` A disclaimer footer, if present, is worded as information and never as the reason any line elsewhere is acceptable.

## B1. Boundary

The app analyses the user's own past trades against the user's own rules. It gives no personal recommendation about any instrument (MiFID II Art. 4(1)(4); domain pack §6), predicts no price, holds or moves no money, asks for no broker login.

- AC-B1.1 `[unit]` A scan of every string in both languages (interface, learn entries, About, review templates) finds no banned pattern from P5 and no forward-looking sentence about a market or instrument.
- AC-B1.2 `[headless]` No screen or form asks for a broker username, password, or an exchange secret. Read-only exchange API keys exist only if `architecture.md` adopts them; then they are stored on the device, the app rejects a key with trade or withdraw rights, and the screen says read-only.
- AC-B1.3 `[headless]` No control places, changes or cancels an order or moves funds; no price feed is required for any figure.
- AC-B1.4 `[unit]` Rankings of setups, markets or instruments appear only as neutral data with n and never with "do more" or "avoid" wording; where the plan has a rule the screen quotes it.
- AC-B1.5 `[headless]` The first run shows the boundary sentence once, in the user's language, before the first entry.

## A. Angle items: numbers that match your broker

- **A1 Reconcile step.** After a real-mode import the app asks for the broker's own total for the period: net realised P&L, or ending balance with the amount of deposits and withdrawals in the period. It compares this with its own total.
  - AC-A1.1 `[headless]` The step appears in the import flow, states the period (first to last close date in the file, editable) and the account currency, and can be skipped with one tap.
  - AC-A1.2 `[unit]` Difference = broker total minus the sum of net P&L of the period's closed trades. Match means the absolute difference is at most a tolerance of 0.01 per closed trade (shown to the user, editable).
  - AC-A1.3 `[headless]` A period has one of four visible states: reconciled, difference open, skipped, not asked. The dashboard shows the state for every real-mode period until it is reconciled or skipped; skipped stays visible and is not shown as reconciled.
  - AC-A1.4 `[unit]` With a balance-based total the deposits and withdrawals figure is subtracted before comparing (fixture: start 10,000, end 10,420, deposit 200, trades total 220 gives difference 0).
- **A2 Import checks and questions.** Code checks each import and holds affected trades out of statistics until the user answers.
  - AC-A2.1 `[unit]` Checks: rows read against rows in the file, duplicates against earlier imports, positions left open by flips or partial exits, time-zone shifts at period edges, missing fees, fee currency with no rate, unreadable rows.
  - AC-A2.2 `[headless]` Each anomaly becomes one plain-language question with the trades named (for example "2 fills on 18 Sep repeat the 17 Sep import: merge or keep?"); its answers are stored on the import.
  - AC-A2.3 `[unit]` Until answered, the affected trades are held out (S3) and the count shows on every statistics screen and on the dashboard; after an answer they enter or leave the statistics as chosen, and a permanent exclusion keeps the trade in the journal, flagged.
  - AC-A2.4 `[headless]` With no anomaly, no question is asked and no trade is held out.
- **A3 Explain the difference.** When the difference is not a match the app names the trades that account for it.
  - AC-A3.1 `[unit]` On fixtures where the difference equals the net P&L of one duplicate, one held-out trade, one trade with a missing fee, or one trade moved across the period edge by a time-zone shift, the app names that trade and the cause.
  - AC-A3.2 `[unit]` On a fixture where nothing accounts for the difference, the screen says "unexplained difference of X", lists nothing as the cause, and never folds the amount into fees or another figure.
  - AC-A3.3 `[headless]` After the user answers the questions the comparison is recomputed and shows the new difference.
- **A4 Import report.** AC-A4.1 `[headless]` Each import yields a report with rows read, trades built, rows skipped and why, anomalies with the user's answers, the broker total, the difference and what explains it. It is stored with the import, opens later, exports with the data and can be saved as a file to keep with the broker file.
- **A5 Every figure opens to its trades.**
  - AC-A5.1 `[headless]` Each figure in S1-S16 and in the review opens to its formula in words with this user's numbers filled in, the list of included trades, and the list of excluded trades with the reason for each (held out, open, R missing, other mode).
  - AC-A5.2 `[unit]` The drill-down figures are the same values as the headline figure (the list sums to it).

## D. Design (D1-D5 of the thought-catcher v2 brief, for a finance tool: data-dense but calm)

- D1 Design system: tokens for colour, type scale, spacing, radius, elevation, motion; light and dark; one accent; semantic colours for gain, loss, paper and real.
  - AC-D1.1 `[screenshot]` Gain and loss are shown by sign and arrow as well as colour; a greyscale screenshot of the dashboard still tells them apart.
  - AC-D1.2 `[screenshot]` Text contrast is at least 4.5:1 and chart marks at least 3:1 in light and dark, measured by script on the screenshots.
  - AC-D1.3 `[screenshot]` Money and counts use tabular figures so columns align.
- D2 Mobile first at 390x844 and 360x800, installable.
  - AC-D2.1 `[phone]` No horizontal page scroll and no clipped text on any screen at both sizes; wide tables collapse to cards or scroll inside their own container.
  - AC-D2.2 `[phone]` Touch targets are at least 44 px; safe areas are respected; the navigation stays reachable with one thumb.
  - AC-D2.3 `[phone]` Dashboard first viewport without scrolling shows mode label, net P&L, equity curve, expectancy with n, and the reconcile state.
  - AC-D2.4 `[screenshot]` Equity curve, drawdown, calendar and bucket charts are legible at 360 px: axis labels at least 11 px, drawdown period identifiable, no overlapping labels.
- D3 Motion.
  - AC-D3.1 `[headless]` Screen changes and chart draws run without dropped frames on the reference run; with reduced motion requested, charts and screens appear without animation.
- D4 Reference quality: the finish of Apple's own apps, Things 3, Linear, Arc; no default browser controls.
  - AC-D4.1 `[screenshot]` Every control, input, select, date picker and chart is styled from the design system; none shows a default browser look.
  - AC-D4.2 `[screenshot]` The result matches the L2d mockups for every screen and state; deviations are listed.
- D5 Every state designed.
  - AC-D5.1 `[screenshot]` Designed screenshots exist for: empty journal, first run, entry with error, import running, anomaly question, difference open, reconciled, skipped, small sample, R unknown, no pattern found, review by rules, model downloading, model unavailable, offline, storage refused, export done.

## U. Persona value (usefulness gate U1-U3)

- AC-U1.1 `[phone]` A beginner with no account writes a plan, logs 5 paper trades by hand and sentence, sees rule-following and R for them, reads one rule-based review, and opens the explanation of R from their own number, all without leaving the app; the first paper trade is saved within 3 taps after the first-run screens (at most 3).
- AC-U1.2 `[phone]` With no trades the dashboard shows what to do next (write a plan, log a paper trade) and no empty chart.
- AC-U2.1 `[headless]` An experienced trader imports a year of trades (2,000 rows per market fixture) in each named format within 10 seconds with visible progress, gets the import report, answers the anomaly questions, enters the broker total, and sees either a match or the named trades explaining the difference.
- AC-U2.2 `[headless]` They then see buckets by setup, market, hour and weekday, the calendar, drawdown and a review that names at least three patterns present in the seeded data, each with n and linked trades.
- AC-U3.1 `[phone]` A friend using Greek on a phone completes a real-mode manual trade, a sentence entry and one statistic drill-down with no English string left over except the stated Latin terms (P7).
- AC-U3.2 `[phone]` The friend can compare one broker total with the app's total in the reconcile step in two screens or fewer.

## Priority order for cuts

Listed from last to cut to first to cut. Design quality (D1-D5), P3 correctness and B1 are never cut.
1. P1 manual entry, P8 data safety and export, P2 plan checklist.
2. A1-A3 reconcile step, questions, explanation (the angle).
3. P4 paper and real kept apart, P7 Greek, P10 About.
4. A4 import report, A5 drill-down.
5. P1 import for the second and third market (keep one format first, add per market), P6 learn layer.
6. P5 review agent with model wording (rule-based review stays), P4.5 paper-versus-real comparison.
7. P1.5 sentence entry and P1.7 open-trade follow-up.
8. P9 own-key option (on-device and rules stay).

## Out of scope

Live prices, charts of markets, backtesting, trade signals, order placement, broker or exchange login, sync and sharing between devices (later rung), futures and options, tax reports, multi-currency conversion beyond the stored per-trade rate, accounts, social features, payments, push notifications.

## Open questions for Ion

- Q1. Should a qualified EU counsel review the B1 wording and the crypto position before the public release? This costs money and the team buys nothing. Default: no counsel, the aios-lawyer review stands, and the release page says so.
- Q2. Will Ion supply his own broker or exchange exports (real personal data) to test the importers? Default: synthetic fixtures only, built from the sources named in `architecture.md`.
- Q3. Should the About page show a contact address? Default: none, the repository issue tracker only.
