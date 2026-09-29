// Helpers shared by the S3 views (plan, checklist, sizing, review, learn, sentence, aiSettings). DOM is built through S1's `el` and
// `ctx.ui`, so user text reaches the page as text nodes only (CSP forbids inline markup from data).
import { el, mount } from '../ui/dom.js';
import { t } from '../i18n/i18n.js';

export { el, mount, t };

export const activePlan = (plans) => plans.find((p) => p.active) ?? plans[0] ?? null;

// A detail top bar: back button, centred title, mode badge on the right.
export function detailBar(ctx, { title, backHash, backLabel, right } = {}) {
  return ctx.ui.topbar({
    mode: ctx.mode, paper: ctx.mode === 'paper', title,
    back: { label: backLabel, onClick: () => ctx.navigate(backHash) },
    right: right ?? ctx.ui.modeBadge(ctx.mode),
  });
}

// A page: top bar, scrolling content, optional sticky action bar (.actions) under it.
export function page(root, ctx, { bar, content, actions }) {
  mount(root, el('div', { class: ['app-s3', actions && 'has-actions'] }, bar, el('main', { class: 'content' }, ...content), actions ? el('div', { class: 'actions' }, ...actions) : null));
}

export const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Local calendar date 'YYYY-MM-DD' and the last N days as a { from, to } period in a zone.
export function periodFor(kind, { now = new Date(), tz = 'UTC', localDate }) {
  const today = localDate(now.toISOString(), tz);
  if (kind === 'all') return null;
  const days = kind === 'last30' ? 29 : kind === 'last7' ? 6 : null;
  if (days !== null) return { from: shiftDate(today, -days), to: today, zone: tz };
  // this week: Monday to today
  const d = new Date(`${today}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return { from: shiftDate(today, -back), to: today, zone: tz };
}

export function shiftDate(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
