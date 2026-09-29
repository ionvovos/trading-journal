import { test } from 'node:test';
import { createMemoryStore } from '../../src/storage/memory.js';
import { contractTests } from './contract.mjs';

for (const [name, fn] of contractTests) test(`memory store: ${name}`, () => fn(async () => createMemoryStore()));

test('memory store: seed', async () => {
  const s = createMemoryStore({ accounts: [{ id: 'a1', name: 'X', mode: 'real', baseCurrency: 'USD' }], settings: { tz: 'Europe/Athens' } });
  const assert = (await import('node:assert/strict')).default;
  assert.equal((await s.accounts.getAll()).length, 1);
  assert.equal(await s.getSetting('tz'), 'Europe/Athens');
});
