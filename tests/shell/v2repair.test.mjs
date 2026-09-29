// V2 repair round (GATE-V2 G1, G2, G3): view-level invariants the engine tests did not cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROUTES } from '../../src/ui/routes.js';
import { weekRows } from '../../src/ui/charts/calendarGrid.js';
import { closedSet, calendar } from '../../src/stats/index.js';
import { core } from '../stats/helpers.mjs';

test('G1: a route whose view has a fixed bottom action bar hides the tab bar (chrome none), so Save cannot sit under it', () => {
  const src = (view) => readFileSync(new URL(`../../src/ui/views/${view}.js`, import.meta.url), 'utf8');
  const withBar = ['plan', 'checklist', 'sentence', 'tradeForm'].filter((v) => /actions:|has-actions|class: 'actions'/.test(src(v)));
  assert.ok(withBar.includes('plan') && withBar.includes('sentence'), 'the check sees the views that have a fixed bar');
  for (const route of ROUTES.filter((r) => withBar.includes(r.view))) assert.equal(route.chrome, 'none', `${route.path} has a fixed action bar and a tab bar`);
});

test('G2: week totals are found by the Monday a grid row starts on, not by position in the list of weeks that have trades', () => {
  // September 2026 starts on a Tuesday: rows start 31 Aug, 7, 14, 21, 28 Sep. Only the last two weeks have trades.
  const rows = weekRows(2026, 9, [{ start: '2026-09-21', netMinor: 6200 }, { start: '2026-09-28', netMinor: 3600 }]);
  assert.deepEqual(rows.map((r) => [r.start, r.netMinor]), [['2026-08-31', null], ['2026-09-07', null], ['2026-09-14', null], ['2026-09-21', 6200], ['2026-09-28', 3600]]);
  // a month whose 1st is a Monday, and one with six rows
  assert.equal(weekRows(2026, 6, []).length, 5);
  assert.equal(weekRows(2027, 2, []).length, 4); // 1 Feb 2027 is a Monday
  assert.equal(weekRows(2026, 8, []).length, 6);
  assert.equal(weekRows(2026, 8, [])[0].start, '2026-07-27');
});

test('G2 invariant at the view level: the week cells of a month add up to the month cell, for every month of the fixture and both zones', () => {
  const set = closedSet(core.trades, core.ctx);
  let checked = 0;
  for (const ctx of [core.ctx, { ...core.ctx, tz: 'UTC' }]) {
    for (let month = 1; month <= 12; month += 1) {
      const c = calendar(set, { year: 2026, month }, ctx);
      const rows = weekRows(2026, month, c.weeks);
      const sum = rows.reduce((s, r) => s + (r.netMinor ?? 0), 0);
      assert.equal(sum, c.monthMinor, `2026-${month}`);
      assert.equal(rows.filter((r) => r.netMinor !== null).length, c.weeks.length, `every week with trades has a row in 2026-${month}`);
      if (c.monthMinor !== 0) checked += 1;
    }
  }
  assert.ok(checked >= 2);
});

// ---- G3: display currency
import { createCtx, createFallbackStore, createSettings } from '../../src/ui/ctx.js';
import { createBus } from '../../src/ui/bus.js';
import { toDisplayMinor } from '../../src/storage/viewkit.js';
import { createAccount, validateAccount } from '../../src/storage/actions.js';
import { computeStats } from '../../src/storage/statsModel.js';
import { loadModel } from '../../src/storage/model.js';
import { makeTrade } from '../stats/helpers.mjs';

async function ctxWith(accounts, set = {}) {
  const store = createFallbackStore();
  for (const a of accounts) await store.accounts.put(a);
  for (const [k, v] of Object.entries(set)) await store.setSetting(k, v);
  const settings = await createSettings(store, []);
  const ctx = createCtx({ store, bus: createBus(), settings, router: { navigate() {} } });
  await ctx.refreshCurrencies();
  return { ctx, store };
}
const acc = (id, mode, baseCurrency, toDisplayRate = null) => ({ id, name: id, mode, baseCurrency, startBalance: '1000', toDisplayRate, createdAt: 'x' });

test('G3: the display currency of a mode is the currency its accounts share, unless the person set one', async () => {
  const eur = await ctxWith([acc('e', 'real', 'EUR')]);
  assert.equal(eur.ctx.displayCurrencyFor('real'), 'EUR');
  assert.equal(eur.ctx.displayCurrency(), 'EUR');
  const mixed = await ctxWith([acc('e', 'real', 'EUR'), acc('u', 'real', 'USD')]);
  assert.equal(mixed.ctx.displayCurrencyFor('real'), 'USD', 'mixed currencies and no setting: the fallback');
  const set = await ctxWith([acc('e', 'real', 'EUR')], { 'displayCurrency.real': 'GBP' });
  assert.equal(set.ctx.displayCurrencyFor('real'), 'GBP', 'an explicit setting wins');
  const paper = await ctxWith([acc('p', 'paper', 'EUR'), acc('r', 'real', 'USD')]);
  assert.deepEqual([paper.ctx.displayCurrencyFor('real'), paper.ctx.displayCurrencyFor('paper')], ['USD', 'EUR']);
});

test('G3: an amount is never converted with a rate that was never typed', () => {
  assert.equal(toDisplayMinor(650, { baseCurrency: 'EUR', toDisplayRate: null }, 'USD'), null);
  assert.equal(toDisplayMinor(650, { baseCurrency: 'EUR' }, 'USD'), null);
  assert.equal(toDisplayMinor(650, { baseCurrency: 'EUR', toDisplayRate: 0 }, 'USD'), null);
  assert.equal(toDisplayMinor(650, { baseCurrency: 'EUR', toDisplayRate: null }, 'EUR'), 650, 'same currency needs no rate');
  assert.equal(toDisplayMinor(650, { baseCurrency: 'EUR', toDisplayRate: 1.1 }, 'USD'), 715);
});

test('G3: an account in another currency than its display currency must carry a rate; the same currency needs none', () => {
  const eur = createAccount({ name: 'E', mode: 'real', baseCurrency: 'EUR', startBalance: '100', toDisplayRate: '' }, { now: 'x', id: 'e' });
  assert.equal(eur.toDisplayRate, null);
  assert.deepEqual(validateAccount(eur, [], { displayCcy: 'EUR' }), []);
  assert.deepEqual(validateAccount(eur, [], { displayCcy: 'USD' }).map((e) => e.field), ['toDisplayRate']);
  const withRate = createAccount({ name: 'E', mode: 'real', baseCurrency: 'EUR', startBalance: '100', toDisplayRate: '1,08' }, { now: 'x', id: 'e' });
  assert.deepEqual(validateAccount(withRate, [], { displayCcy: 'USD' }), []);
});

test('G3: a EUR account with no rate shown in USD is reported as needing a rate and adds nothing to the total (the U3 case: 6.50 is never printed as USD)', async () => {
  const { ctx, store } = await ctxWith([acc('eur', 'real', 'EUR'), acc('usd', 'real', 'USD', 1)]);
  await store.trades.put(makeTrade({ id: 'w', accountId: 'eur', entry: '10', exit: '20', size: '1', stop: '9', close: '2026-09-02T16:00:00Z', open: '2026-09-02T15:00:00Z' }));
  await store.trades.put(makeTrade({ id: 'l', accountId: 'usd', entry: '10', exit: '5', size: '1', stop: '9', close: '2026-09-03T16:00:00Z', open: '2026-09-03T15:00:00Z' }));
  const model = await loadModel(store);
  const s = await computeStats(ctx, model, { period: null });
  assert.equal(s.currency, 'USD');
  assert.deepEqual(s.needsRate.map((n) => [n.name, n.from, n.to]), [['eur', 'EUR', 'USD']]);
  assert.equal(s.netMinor, -500, 'only the USD trade is in the total');
  const same = await ctxWith([acc('eur', 'real', 'EUR')]);
  await same.store.trades.put(makeTrade({ id: 'w', accountId: 'eur', entry: '10', exit: '20', size: '1', stop: '9', close: '2026-09-02T16:00:00Z', open: '2026-09-02T15:00:00Z' }));
  const s2 = await computeStats(same.ctx, await loadModel(same.store), { period: null });
  assert.equal(s2.currency, 'EUR');
  assert.deepEqual(s2.needsRate, []);
  assert.ok(s2.netMinor > 0);
});

// ---- G4: chart labels
import { thinLabels, PLOT_W } from '../../src/ui/charts/lineChart.js';

test('G4: x labels that would overlap are thinned ("1 Sep" never sits on "21" when trades cluster late in the month)', () => {
  const n = 30;
  const labels = [{ index: 0, text: '1 Sep', anchor: 'start' }, { index: 1, text: '8', anchor: 'middle' }, { index: 2, text: '21', anchor: 'middle' }, { index: 20, text: '28', anchor: 'middle' }];
  const kept = thinLabels(labels, n);
  assert.deepEqual(kept.map((l) => l.text), ['1 Sep', '28']);
  const x = (l) => (l.index / (n - 1)) * PLOT_W;
  const w = (l) => l.text.length * 6.2;
  for (let i = 1; i < kept.length; i += 1) assert.ok(x(kept[i]) - w(kept[i]) / 2 >= x(kept[i - 1]) + w(kept[i - 1]) + 6 - 1e-6 || kept[i - 1].anchor !== 'start');
  assert.deepEqual(thinLabels([{ index: 0, text: 'Sep', anchor: 'start' }, { index: 29, text: 'Oct', anchor: 'middle' }], n).length, 2, 'labels far apart all stay');
});

// ---- G9: About states the AI role that R1 left
test('G9: the About page says the model only orders findings and writes no review sentence, in both languages, and no longer says it words reviews', async () => {
  const en = (await import('../../src/i18n/en/shell.js')).default['about.numbers.body'];
  const el = (await import('../../src/i18n/el/shell.js')).default['about.numbers.body'];
  assert.match(en, /only puts the findings of a review in order/);
  assert.match(en, /writes no sentence of a review/);
  assert.doesNotMatch(en, /words reviews/);
  assert.match(el, /βάζει σε σειρά τα ευρήματα/);
  assert.match(el, /Δεν γράφει καμία πρόταση/);
  assert.doesNotMatch(el, /διατυπώνει τις ανασκοπήσεις/);
});

// ---- G10: capped trade links
import { capLinks, MAX_LINKS } from '../../src/review/viewkit.js';

test('G10: a review card shows at most MAX_LINKS trade links and says how many more there are; the review screen uses it', () => {
  const ids = Array.from({ length: 240 }, (_, i) => `t${i}`);
  const c = capLinks(ids);
  assert.equal(c.shown.length, MAX_LINKS);
  assert.equal(c.more, 240 - MAX_LINKS);
  assert.deepEqual(capLinks(['a', 'b']), { shown: ['a', 'b'], more: 0 });
  assert.match(readFileSync(new URL('../../src/ui/views/review.js', import.meta.url), 'utf8'), /capLinks\(all\)/);
});

// ---- G11: account filter on Statistics
test('G11: the statistics for one account leave the others out; the screen offers a chip per account of the mode', async () => {
  const { accountFilterValid } = await import('../../src/ui/views/stats.js');
  const a = ['e', 'u'].map((id, n) => acc(id, 'real', 'USD', 1));
  const { ctx, store } = await ctxWith(a);
  await store.trades.put(makeTrade({ id: 'w', accountId: 'e', entry: '10', exit: '20', size: '1', stop: '9', close: '2026-09-02T16:00:00Z', open: '2026-09-02T15:00:00Z' }));
  await store.trades.put(makeTrade({ id: 'l', accountId: 'u', entry: '10', exit: '5', size: '1', stop: '9', close: '2026-09-03T16:00:00Z', open: '2026-09-03T15:00:00Z' }));
  const model = await loadModel(store);
  const all = await computeStats(ctx, model, { period: null });
  ctx.setAccountFilter('e');
  const one = await computeStats(ctx, model, { period: null });
  assert.equal(all.included.length, 2);
  assert.deepEqual(one.included.map((t) => t.id), ['w']);
  assert.ok(one.netMinor > 0 && all.netMinor < one.netMinor);
  assert.equal(accountFilterValid('e', model, 'real'), true);
  assert.equal(accountFilterValid('e', model, 'paper'), false, 'a filter from the other mode resets to all');
  assert.equal(accountFilterValid('all', model, 'paper'), true);
  assert.match(readFileSync(new URL('../../src/ui/views/stats.js', import.meta.url), 'utf8'), /modeAccounts\.length > 1/);
});

// ---- G12: small labels
test('G12: "1 win · 2 losses" agrees in number in both languages; a calendar day worth under half a unit reads 0, not −0', async () => {
  const en = (await import('../../src/i18n/en/data.js')).default['stats.streaks.value'];
  const { formatMessage } = await import('../../src/i18n/i18n.js');
  assert.equal(formatMessage(en, { w: 2, l: 1 }, 'en'), '2 wins · 1 loss');
  assert.equal(formatMessage(en, { w: 1, l: 2 }, 'en'), '1 win · 2 losses');
  const el = (await import('../../src/i18n/el/data.js')).default['stats.streaks.value'];
  assert.equal(formatMessage(el, { w: 1, l: 3 }, 'el'), '1 κερδοφόρα · 3 ζημιογόνες');
  const src = readFileSync(new URL('../../src/ui/charts/calendarGrid.js', import.meta.url), 'utf8');
  assert.match(src, /Math\.abs\(v\) < 0\.5\) return '0'/);
});
