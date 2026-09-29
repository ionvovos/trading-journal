import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../fixtures/review/${name}`, import.meta.url), 'utf8'));
export const weeks = load('weeks.json');
export const calm = load('calm.json');

// The input runReview takes, from one fixture week.
export const inputOf = (week, over = {}) => ({
  trades: week.trades, cash: [], accounts: week.accounts, plans: [week.plan], settings: { smallSampleMin: 30, lossWindowMin: 30, tz: week.tz, dayCutoffHour: 0 },
  mode: week.mode, period: week.period, lang: 'en', tz: week.tz, now: new Date('2026-09-25T10:00:00Z'), ...over,
});

export const byPattern = (review) => Object.fromEntries(review.findings.map((f) => [f.pattern, f]));
