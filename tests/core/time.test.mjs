import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zonedToUtc, localParts, inLocalWindow, isValidZone, addDays } from '../../src/core/time.js';

const cases = JSON.parse(readFileSync(new URL('../fixtures/core/time-cases.json', import.meta.url), 'utf8'));

function athens(isoUtc) {
  const p = localParts(isoUtc, 'Europe/Athens');
  return `${p.date} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

for (const c of cases.zonedToUtc) {
  test(`zonedToUtc ${c.local} ${c.zone}${c.note ? ` (${c.note})` : ''}`, () => {
    assert.equal(zonedToUtc(c.local, c.zone), c.utc);
    if (c.athens) assert.equal(athens(c.utc), c.athens);
  });
}

for (const c of cases.localParts) {
  test(`localParts ${c.utc} ${c.zone} cutoff ${c.cutoffHour}`, () => {
    const p = localParts(c.utc, c.zone, c.cutoffHour);
    assert.equal(p.date, c.date);
    assert.equal(p.hour, c.hour);
    assert.equal(p.weekday, c.weekday);
  });
}

test('New York and Athens are 6 hours apart between 8 and 29 March 2026 and 7 hours elsewhere', () => {
  const gap = (local) => {
    const utc = zonedToUtc(local, 'America/New_York');
    const ny = localParts(utc, 'America/New_York');
    const at = localParts(utc, 'Europe/Athens');
    const h = (d, p) => Date.parse(`${d}T00:00:00Z`) / 3600000 + p.hour;
    return h(at.date, at) - h(ny.date, ny);
  };
  assert.equal(gap('2026-03-02T10:00:00'), 7);
  assert.equal(gap('2026-03-20T10:00:00'), 6);
  assert.equal(gap('2026-04-10T10:00:00'), 7);
  assert.equal(gap('2026-10-28T10:00:00'), 6);
  assert.equal(gap('2026-11-05T10:00:00'), 7);
});

test('ny+7 follows New York daylight saving with a fixed 7 hour shift', () => {
  assert.equal(zonedToUtc('2026-03-05T09:00:00', 'ny+7'), '2026-03-05T07:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-09T10:00:00', 'ny+7'), '2026-03-09T07:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-05T09:00:00', 'ny-1'), '2026-03-05T15:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-05T09:00:00', 'NY+7'), '2026-03-05T07:00:00.000Z');
  assert.equal(localParts('2026-03-05T07:00:00Z', 'ny+7').hour, 9);
  assert.equal(localParts('2026-03-09T07:00:00Z', 'ny+7').hour, 10);
});

test('UTC, fractions, spaces, missing seconds', () => {
  assert.equal(zonedToUtc('2026-03-04T21:30:00.1000', 'UTC'), '2026-03-04T21:30:00.100Z');
  assert.equal(zonedToUtc('2026-03-04 21:30:00', 'UTC'), '2026-03-04T21:30:00.000Z');
  assert.equal(zonedToUtc('2026-03-04T21:30', 'UTC'), '2026-03-04T21:30:00.000Z');
  assert.equal(zonedToUtc('2026-03-04T21:30:00.12', 'Europe/Athens'), '2026-03-04T19:30:00.120Z');
});

test('gap and repeated hour', () => {
  // US clocks skip 02:00-03:00 on 8 March 2026: 02:30 does not exist, moves forward to 03:30 EDT.
  assert.equal(zonedToUtc('2026-03-08T02:30:00', 'America/New_York'), '2026-03-08T07:30:00.000Z');
  // 01:30 on 1 November 2026 happens twice; the first pass (EDT, UTC-4) is taken.
  assert.equal(zonedToUtc('2026-11-01T01:30:00', 'America/New_York'), '2026-11-01T05:30:00.000Z');
});

test('invalid local text is null and an unknown zone throws', () => {
  for (const bad of ['', 'nope', '2026-02-30T10:00:00', '2026-13-01T10:00:00', '2026-03-01T25:00:00', '2026-03-01T10:61:00', '2026-03-01T10:00:00Z', '2026-03-01T10:00:00+02:00']) {
    assert.equal(zonedToUtc(bad, 'UTC'), null, bad);
  }
  assert.throws(() => zonedToUtc('2026-03-01T10:00:00', 'Mars/Base'), RangeError);
  assert.equal(isValidZone('Europe/Athens'), true);
  assert.equal(isValidZone('ny+7'), true);
  assert.equal(isValidZone('Mars/Base'), false);
});

test('round trip through localParts for every hour of a clock-change week', () => {
  for (let h = 0; h < 24 * 8; h++) {
    const utc = new Date(Date.UTC(2026, 2, 5) + h * 3600000).toISOString();
    for (const zone of ['America/New_York', 'Europe/Athens', 'Europe/London']) {
      const p = localParts(utc, zone);
      const back = zonedToUtc(`${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00`, zone);
      assert.equal(back, utc, `${zone} ${utc}`);
    }
  }
});

test('localParts weekday is ISO 1-7 with Sunday as 7', () => {
  assert.equal(localParts('2026-03-08T12:00:00Z', 'UTC').weekday, 7);
  assert.equal(localParts('2026-03-09T12:00:00Z', 'UTC').weekday, 1);
  assert.throws(() => localParts('garbage', 'UTC'), RangeError);
});

test('inLocalWindow: start inclusive, end exclusive, wraps midnight, follows daylight saving', () => {
  assert.equal(inLocalWindow('2026-03-02T14:30:00Z', 'America/New_York', '09:30', '16:00'), true);
  assert.equal(inLocalWindow('2026-03-02T14:29:00Z', 'America/New_York', '09:30', '16:00'), false);
  assert.equal(inLocalWindow('2026-03-02T21:00:00Z', 'America/New_York', '09:30', '16:00'), false);
  assert.equal(inLocalWindow('2026-03-02T20:59:00Z', 'America/New_York', '09:30', '16:00'), true);
  // after the US change the same wall window is one hour earlier in UTC
  assert.equal(inLocalWindow('2026-03-09T13:30:00Z', 'America/New_York', '09:30', '16:00'), true);
  assert.equal(inLocalWindow('2026-03-09T13:29:00Z', 'America/New_York', '09:30', '16:00'), false);
  // London 08:00-17:00 in summer time
  assert.equal(inLocalWindow('2026-07-01T07:00:00Z', 'Europe/London', '08:00', '17:00'), true);
  assert.equal(inLocalWindow('2026-07-01T06:59:00Z', 'Europe/London', '08:00', '17:00'), false);
  // wrap: Sydney 22:00-07:00 UTC
  assert.equal(inLocalWindow('2026-03-02T23:00:00Z', 'UTC', '22:00', '07:00'), true);
  assert.equal(inLocalWindow('2026-03-02T03:00:00Z', 'UTC', '22:00', '07:00'), true);
  assert.equal(inLocalWindow('2026-03-02T07:00:00Z', 'UTC', '22:00', '07:00'), false);
  assert.equal(inLocalWindow('2026-03-02T12:00:00Z', 'UTC', '22:00', '07:00'), false);
  assert.equal(inLocalWindow('2026-03-02T12:00:00Z', 'UTC', '08:00', '08:00'), false);
  assert.equal(inLocalWindow('2026-03-02T23:59:00Z', 'UTC', '00:00', '24:00'), true);
  assert.throws(() => inLocalWindow('2026-03-02T12:00:00Z', 'UTC', '8', '9'), RangeError);
});

test('addDays', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
