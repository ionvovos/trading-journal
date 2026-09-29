// What the review layer (S3) provides to the shell and to the data layer (architecture section 10):
//   runChecklist(ctx, draft), afterSave(ctx, trade), evaluatePlan, parseSentence, runReview, latestReview(ctx), renderAiSettings, learn.explain, guard.
// The boot attaches these to ctx.data: `Object.assign(data, await import('./review/index.js'))`. Views load on demand through routes.js.
export { runChecklist, afterSave } from '../ui/views/checklist.js';
export { evaluatePlan } from '../plan/check.js';
export { positionSize } from '../plan/sizing.js';
export { parseSentence } from '../sentence/parse.js';
export { runReview } from './run.js';
export { renderAiSettings } from '../ui/views/aiSettings.js';
export * as guard from './guard.js';
export * as learn from '../learn/index.js';

// The most recent stored review of the current mode, or null.
export async function latestReview(ctx) {
  const all = await ctx.store.reviews.getAll().catch(() => []);
  return all.filter((r) => r.mode === ctx.mode).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;
}
