# C6: Greek catalogues

Build per this file, `docs/architecture.md` §6 (i18n) and §11, `docs/requirements.md` P7 and B1, and `docs/design.md` §7 (in the ais-os repo: `projects/trading-journal/docs/design.md`). Starts only after the L3 shards S1, S2 and S3 are closed; the orchestrator says when. Until then each shard's `el` file is a first draft.

## Own (write only these)
- `src/i18n/el/shell.js`, `src/i18n/el/data.js`, `src/i18n/el/review.js`
- `src/learn/entries.el.js`

Not yours: any `en` file, `src/about/text.js` (the lawyer's texts, pinned by hash), `src/review/**`, tests. If an English string looks wrong, write it in `docs/cloud/C6-NOTES.md` on your branch and leave it.

## Source (English, final: main 63db10c, `npm test` 744 of 744)
- `src/i18n/en/shell.js`: navigation, Home, first run, Settings, About, shared components (S1; final in this commit).
- `src/i18n/en/data.js`: journal, trade form, import, broker check, statistics, calendar, data settings (S2).
- `src/i18n/en/review.js`: plan, checklist, sizing, review, compare, AI settings (S3).
- `src/learn/entries.en.js`: learn entries T1-T35 (S3).

## Contract
1. Same keys, same placeholders. `{name}` and `{n, plural, one {..} other {..}}` keep their names; the Greek branches are `one` and `other`; `#` is the number. `tests/shell/i18n.test.mjs` fails on a key or placeholder present in one language only.
2. Keys under `legal.*` are copied from `src/about/text.js` and stay identical: that file is the lawyer's text, and its SHA-256 is pinned in `tests/shell/aboutText.test.mjs` and `src/review/legalTexts.js`.
3. Register: formal plural («σας», «δείτε»), plain words, short sentences, no em dash chaining. Months are nominative in headings («Σεπτέμβριος») and short in rows («Σεπ»), the format functions produce them; do not write dates into strings.
4. Latin terms kept (AC-P7.3, architecture §6): `R`, `pip`, `lot`, `stop`, `spread`, `funding`, `swap`, `long`, `short`, `broker`. The same term is never both translated and Latin in the app. Other market words are translated once and used the same way everywhere (glossary below).
5. Boundary (B1, `docs/architecture.md` §5.2): no instruction, no future tense about a market, no ranking, no label on the person, no readiness or suitability, no `advisor/coach/assistant/signal/insight/analysis/research/outlook` equivalents. The Greek word lists are in `src/review/banned.js`; `node --test tests/shell/strings-boundary.test.mjs` runs every Greek string through them with its scope (keys under `review.*` as review text, `compare.*` as comparison, `learn.*` as learn, the rest as interface). Avoid «πρέπει», «θα» as a future particle, «καλύτερ-», «χειρότερ-», «έτοιμ-», «προτείν-», «σύμβουλ-», «σήμα».
6. Length: Greek runs 20 to 30 percent longer. Every string must fit at 360x800 with no clipped text (AC-P7.4); labels wrap, so prefer the short form for tab labels, tile labels and buttons (the seed Greek strings for tabs are «Αρχική», «Συναλλαγές», «Στατιστικά», «Ανασκόπηση»).
7. Numbers, dates and money come from `src/i18n/format.js` (`el-GR`: `1.284,60`, `29 Σεπ`, U+2212 for minus). A Greek string never contains a formatted number of its own; it takes a placeholder.

## Glossary (decided in L2d, keep)
| English | Greek | Note |
|---|---|---|
| Expectancy | Μέσο R | «Προσδοκία» reads as a forecast; the label must not look forward. The lawyer may change the word |
| Win rate | Κερδοφόρες | share of trades closed with a gain |
| Max drawdown | Μέγ. πτώση | |
| Journal (tab) | Συναλλαγές | «Ημερολόγιο» would mean both journal and calendar |
| Real / Paper | Πραγματικό / Εικονικό | |
| Held out (trade) | σε αναμονή | trade kept out of statistics until a question is answered |
| Broker check | Έλεγχος με τον broker | |
| Reconciled / Difference / Skipped / Not asked | Συμφωνεί / Διαφορά / Παραλείφθηκε / Δεν ζητήθηκε | |
| Review | Ανασκόπηση | |
| Plan | Σχέδιο | the user's own rules |
| Position size | Μέγεθος θέσης | |

## Known drafts to settle
- `drill.name.expectancy` in `src/i18n/el/data.js` reads «Προσδοκία»; the glossary above says «Μέσο R» (the label must not look forward). Use one word everywhere the figure is named, including the learn entry for expectancy.
- The Greek files hold first drafts from S1 (about 190 keys), S2 (`data.js`, about 660 lines) and S3 (`review.js`, about 330 lines; `entries.el.js`, 55 lines). Nothing in them has had a native review.

## Fixtures and tests
- `tests/shell/i18n.test.mjs` (parity, plurals, Greek letters present), `tests/shell/strings-boundary.test.mjs` (boundary per scope), `tests/shell/aboutText.test.mjs` (legal texts) and `tests/shell/keys.test.mjs` (keys used exist), `tests/review/catalogue.test.mjs` (review catalogue parity and boundary) and `tests/learn/entries.test.mjs` (T1-T35 in both languages, banned patterns, the CFD wording). Do not change them.
- `tests/fixtures/review/legal-table.json`: the Greek `safe` and `banned` rows are S3's drafts; your Greek strings must not conflict with a `banned` row.

## Done
`node --test tests/shell/i18n.test.mjs tests/shell/strings-boundary.test.mjs tests/review/catalogue.test.mjs tests/learn/entries.test.mjs` exits 0, then `npm test` exits 0. Open `e2e/lib/shoot-s1.mjs dashboard-el settings-el about-el onboarding-welcome-el` outside the sandbox and check the four screens at 360x800 for clipped text.
