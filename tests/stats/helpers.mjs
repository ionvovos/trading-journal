// Shared by tests/stats: fixtures, tolerance check, small trade builder.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/stats/${name}`, import.meta.url), 'utf8'));
export const core = read('core.json');
export const cases = read('requirements-cases.json');

// Numbers compare within 1e-9 (ratios, R, float P&L); null must stay null.
export function close(actual, expected, msg) {
  if (expected === null) return assert.equal(actual, null, msg);
  assert.equal(typeof actual, 'number', `${msg}: expected a number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${msg}: ${actual} != ${expected}`);
}

// Integers and strings compare exactly as numbers ("50" = 50).
export const same = (actual, expected, msg) => assert.equal(Number(actual), expected, msg);

const leg = (id, kind, time, price, size, fee = '0', rate = 1) => ({
  id, kind, time, price, size, fee, feeCurrency: 'USD', feeToAccount: 1, quoteToAccount: rate, zone: 'UTC',
  source: { importId: null, row: null, key: null }, broker: null,
});

// A one-entry, one-exit trade in the §4.1 shape.
export function makeTrade({
  id, accountId = 'acc', mode = 'real', market = 'stock', instrument = 'AAA', side = 'long', entry, exit, size,
  stop = null, entryFee = '0', exitFee = '0', open = '2026-03-02T15:00:00Z', close: closeAt = '2026-03-02T16:00:00Z',
  contractSize = '1', quoteCurrency = 'USD', rate = 1, setup = null, followed = null,
}) {
  return {
    id, accountId, mode, market, instrument, side, contractSize, contractValue: null, quoteCurrency,
    legs: [leg(`${id}-e`, 'entry', open, entry, size, entryFee, rate), leg(`${id}-x`, 'exit', closeAt, exit, size, exitFee, rate)],
    initialStop: stop, stopSource: stop ? 'user' : null, stopMoves: [], target: null, funding: 0, broker: null, setup,
    plan: { planId: null, followed, items: {}, auto: {}, confirmedByUser: followed !== null },
    notes: '', holds: [], excluded: null, dustRemainder: '0', closeDayOverride: null, closeTime: closeAt,
  };
}

export const ids = (list) => list.map((t) => (typeof t === 'string' ? t : t.id));
