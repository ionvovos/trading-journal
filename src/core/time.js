// Time zones without a library, through Intl. Pure: the clock is never read here.
// Zones are IANA names or `ny+N` / `ny-N`: New York wall time plus N hours, the common broker
// server clock ("UTC+2 in winter, UTC+3 in summer" is ny+7). Contract: architecture section 10,
// cases in tests/fixtures/core/time-cases.json.

const HOUR = 3600000;
const NY = 'America/New_York';
const NY_OFFSET = /^ny(?:([+-])(\d+(?:\.\d+)?))?$/i;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?$/;

const formatters = new Map();
function formatterFor(zone) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}

// Wall-clock time of an instant in an IANA zone, expressed as if it were UTC (ms).
function ianaWallMs(ms, zone) {
  const p = {};
  for (const part of formatterFor(zone).formatToParts(new Date(ms))) p[part.type] = part.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) + (((ms % 1000) + 1000) % 1000);
}

// Parse a zone name: { iana } or { iana: NY, shiftMs } for ny+N. Throws RangeError on an unknown zone.
function resolveZone(zone) {
  const m = NY_OFFSET.exec(String(zone));
  if (m) return { iana: NY, shiftMs: m[1] ? (m[1] === '-' ? -1 : 1) * parseFloat(m[2]) * HOUR : 0 };
  try { formatterFor(zone); } catch { throw new RangeError(`unknown time zone: ${zone}`); }
  return { iana: zone, shiftMs: 0 };
}

export function isValidZone(zone) {
  try { resolveZone(zone); return true; } catch { return false; }
}

// Wall time (as ms-if-UTC) of an instant in the zone, ny+N included.
function wallMs(ms, zone) {
  const z = resolveZone(zone);
  return ianaWallMs(ms, z.iana) + z.shiftMs;
}

function validLocal(y, mo, d, h, mi, s) {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

// "2026-03-02T09:40:00" (a space instead of T, missing seconds and 1-9 fraction digits also read)
// in `zone` to "2026-03-02T14:40:00.000Z". Null when the text is not a real local time.
// A local time skipped by a clock change moves forward by the gap; a repeated one takes the first pass.
export function zonedToUtc(localIsoNoOffset, zone) {
  const z = resolveZone(zone);
  const m = LOCAL.exec(String(localIsoNoOffset).trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const s = m[6] ? Number(m[6]) : 0;
  const msPart = m[7] ? Number((m[7] + '00').slice(0, 3)) : 0;
  if (!validLocal(y, mo, d, h, mi, s)) return null;
  const local = Date.UTC(y, mo - 1, d, h, mi, s) - z.shiftMs; // wall time in the IANA zone
  const before = ianaWallMs(local - 86400000, z.iana) - (local - 86400000);
  const after = ianaWallMs(local + 86400000, z.iana) - (local + 86400000);
  const candidates = [...new Set([local - before, local - after])].sort((a, b) => a - b);
  const hit = candidates.find((c) => ianaWallMs(c, z.iana) === local);
  const utc = hit !== undefined ? hit : local - before;
  return new Date(utc + msPart).toISOString();
}

const pad = (n) => String(n).padStart(2, '0');

// Wall-clock parts of an instant. `date` and `weekday` (ISO 1-7, Monday = 1) belong to the trading
// day, which starts at `cutoffHour` local time; `hour` and `minute` are the plain wall time.
export function localParts(isoUtc, zone, cutoffHour = 0) {
  const ms = Date.parse(isoUtc);
  if (Number.isNaN(ms)) throw new RangeError(`bad instant: ${isoUtc}`);
  const wall = wallMs(ms, zone);
  const w = new Date(wall);
  const day = new Date(wall - cutoffHour * HOUR);
  return {
    date: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
    hour: w.getUTCHours(),
    minute: w.getUTCMinutes(),
    weekday: day.getUTCDay() === 0 ? 7 : day.getUTCDay(),
  };
}

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new RangeError(`bad time of day: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

// True when the wall time of the instant in `zone` is in [from, to). `from` and `to` are 'HH:MM'
// ('24:00' allowed for to); a window with from > to wraps midnight; from = to is empty.
export function inLocalWindow(isoUtc, zone, from, to) {
  const { hour, minute } = localParts(isoUtc, zone);
  const now = hour * 60 + minute;
  const a = minutesOf(from);
  const b = minutesOf(to);
  if (a === b) return false;
  return a < b ? now >= a && now < b : now >= a || now < b;
}

// Calendar date arithmetic on 'YYYY-MM-DD', zone free.
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
