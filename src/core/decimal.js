// Exact decimal arithmetic on strings. Values are held as BigInt scaled to SCALE places.
// Pure: no DOM, no clock. Architecture D4 / section 10 (S2 step 0 helper).
//
// Inputs are decimal strings ("1.50", "-0.00000001", "1e-8"), finite numbers (through String)
// or an already scaled BigInt. Results of add/sub/mul/div/abs are normalised strings ("1.5").
// add, sub, abs, cmp, isZero are exact for any input with at most SCALE fraction digits.
// mul and div round half away from zero at the SCALE-th place; mul is exact when the product
// needs at most SCALE fraction digits.

export const SCALE = 18;
const ONE = 10n ** BigInt(SCALE);

const PLAIN = /^([+-]?)(\d+)(?:\.(\d*))?$/;
const LEADING_DOT = /^([+-]?)\.(\d+)$/;
const SCI = /^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/;

// Split a decimal string into { sign, int, frac } digit strings, expanding an exponent.
function split(input) {
  const s = (typeof input === 'number' ? String(input) : input);
  if (typeof s !== 'string') throw new TypeError(`not a decimal: ${String(input)}`);
  const t = s.trim();
  let m = PLAIN.exec(t);
  if (m) return { sign: m[1] === '-' ? -1n : 1n, int: m[2], frac: m[3] || '' };
  m = LEADING_DOT.exec(t);
  if (m) return { sign: m[1] === '-' ? -1n : 1n, int: '0', frac: m[2] };
  m = SCI.exec(t);
  if (m) {
    const exp = parseInt(m[4], 10);
    let int = m[2];
    let frac = m[3] || '';
    if (exp >= 0) {
      const take = Math.min(exp, frac.length);
      int += frac.slice(0, take) + '0'.repeat(exp - take);
      frac = frac.slice(take);
    } else {
      const shift = -exp;
      const padded = int.padStart(shift + 1, '0');
      frac = padded.slice(padded.length - shift) + frac;
      int = padded.slice(0, padded.length - shift);
    }
    return { sign: m[1] === '-' ? -1n : 1n, int, frac };
  }
  throw new TypeError(`not a decimal: ${JSON.stringify(input)}`);
}

// Scaled BigInt from a decimal string, a finite number, or a scaled BigInt (returned as is).
export function dec(input) {
  if (typeof input === 'bigint') return input;
  if (typeof input === 'number' && !Number.isFinite(input)) throw new TypeError(`not a decimal: ${input}`);
  const { sign, int, frac } = split(input);
  let f = frac;
  let carry = 0n;
  if (f.length > SCALE) {
    carry = f.charCodeAt(SCALE) >= 53 ? 1n : 0n; // digit 19 decides, half away from zero
    f = f.slice(0, SCALE);
  }
  const scaled = BigInt(int) * ONE + BigInt(f.padEnd(SCALE, '0') || '0') + carry;
  return sign * scaled;
}

// Normalised decimal string from a scaled BigInt or any accepted input.
export function toString(x) {
  const v = dec(x);
  const negative = v < 0n;
  const a = negative ? -v : v;
  const int = a / ONE;
  const frac = (a % ONE).toString().padStart(SCALE, '0').replace(/0+$/, '');
  const body = frac ? `${int}.${frac}` : `${int}`;
  return negative && a !== 0n ? `-${body}` : body;
}

export function add(a, b) { return toString(dec(a) + dec(b)); }
export function sub(a, b) { return toString(dec(a) - dec(b)); }
export function abs(a) { const v = dec(a); return toString(v < 0n ? -v : v); }
export function neg(a) { return toString(-dec(a)); }

export function mul(a, b) {
  const p = dec(a) * dec(b);
  const negative = p < 0n;
  const q = negative ? -p : p;
  let r = q / ONE;
  if ((q % ONE) * 2n >= ONE) r += 1n;
  return toString(negative ? -r : r);
}

// Quotient rounded half away from zero at SCALE places. Division by zero throws.
export function div(a, b) {
  const d = dec(b);
  if (d === 0n) throw new RangeError('division by zero');
  const n = dec(a) * ONE;
  const negative = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let r = an / ad;
  if ((an % ad) * 2n >= ad) r += 1n;
  return toString(negative ? -r : r);
}

export function cmp(a, b) {
  const x = dec(a);
  const y = dec(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function isZero(a) { return dec(a) === 0n; }
export function sign(a) { const v = dec(a); return v < 0n ? -1 : v > 0n ? 1 : 0; }
export function min(a, b) { return cmp(a, b) <= 0 ? toString(a) : toString(b); }
export function max(a, b) { return cmp(a, b) >= 0 ? toString(a) : toString(b); }
export function sum(list) { return toString(list.reduce((s, x) => s + dec(x), 0n)); }

// Nearest binary64. The single conversion point into P&L arithmetic (D4).
export function toNumber(a) { return Number(toString(a)); }

// Fraction digits as written ("0.05000000" -> 8, "1e-8" -> 8, "5" -> 0). Not normalised on
// purpose: parsers read the smallest quantity step from the raw text of a file.
export function decimalsOf(input) {
  return split(input).frac.length;
}

// 10^-n as a decimal string ("0.00000001" for 8, "1" for 0).
export function stepOf(decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > SCALE) throw new RangeError(`bad decimals: ${decimals}`);
  return decimals === 0 ? '1' : `0.${'0'.repeat(decimals - 1)}1`;
}
