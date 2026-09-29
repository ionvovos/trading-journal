// The boot wires every S2 and S3 export into ctx.data (integration item I1) and preloads the AI settings (I4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettings } from '../../src/ui/ctx.js';
import { createMemoryStore } from '../../src/storage/memory.js';
import { AI_KEYS } from '../../src/ai/settings.js';

globalThis.__TJ_NO_BOOT__ = true;
const { loadData } = await import('../../src/app.js');

test('ctx.data carries the S3 exports', async () => {
  const data = await loadData();
  for (const k of ['runChecklist', 'afterSave', 'latestReview', 'evaluatePlan', 'parseSentence', 'runReview', 'renderAiSettings', 'positionSize']) assert.equal(typeof data[k], 'function', k);
  assert.equal(typeof data.learn.explain, 'function'); assert.equal(typeof data.guard.check, 'function');
});

test('ctx.data carries the S2 exports and delete-all', async () => {
  const data = await loadData();
  for (const k of ['getSummary', 'runImport', 'answerAnomaly', 'reconcile', 'realisedTotal', 'reconcileQuantity', 'openTradeForm', 'renderDataSettings', 'deleteAll']) assert.equal(typeof data[k], 'function', k);
});

test('createSettings preloads the ai.* keys so they survive a reload', async () => {
  const store = createMemoryStore();
  assert.ok(AI_KEYS.length > 0 && AI_KEYS.includes('ai.engine'));
  await store.setSetting('ai.engine', 'own-key');
  const s = await createSettings(store);
  assert.equal(s.get('ai.engine'), 'own-key');
  assert.equal(s.get('lossWindowMin'), 30);
});
