// Money helpers. Pure. Architecture section 3.1 and the S2 step 0 contract.

const SPACES = /[\s   ]/g;

// Normalised decimal string ("-1.5") from text as a broker prints it, or null when it is not a number.
// `decimal` is the decimal separator ('.' or ','). The other one may appear only as a thousands
// separator in groups of exactly three digits ("1,234.50"); a space (also no-break or thin) groups
// thousands the same way ("10 000.00"). "1,5" with decimal '.' is null, never 15. An exponent
// ("1e-8") is expanded. Leading zeros and trailing fraction zeros are dropped; "-0" is "0".
export function parseDecimal(str, decimal = '.') {
  if (typeof str === 'number') return Number.isFinite(str) ? parseDecimal(expandNumber(str), '.') : null;
  if (typeof str !== 'string') return null;
  let s = str.trim();
  if (s === '') return null;
  let negative = false;
  if (s[0] === '+' || s[0] === '-' || s[0] === '−') {
    negative = s[0] !== '+';
    s = s.slice(1).trim();
  }
  let exp = 0;
  const e = /[eE]([+-]?\d+)$/.exec(s);
  if (e) { exp = parseInt(e[1], 10); s = s.slice(0, e.index); }
  const at = s.indexOf(decimal);
  const intText = (at === -1 ? s : s.slice(0, at)).replace(SPACES, ' ');
  const frac = at === -1 ? '' : s.slice(at + 1);
  if (!/^\d*$/.test(frac)) return null;
  if (intText === '' && frac === '') return null;
  const group = decimal === ',' ? '\\.' : ',';
  let digits;
  if (intText === '') digits = '0';
  else if (/^\d+$/.test(intText)) digits = intText;
  else if (new RegExp(`^\\d{1,3}(?:[ ${group}]\\d{3})+$`).test(intText)) digits = intText.replace(/[ .,]/g, '');
  else return null;
  let out = shiftExponent(digits, frac, exp);
  if (out !== '0' && negative) out = `-${out}`;
  return out;
}

function shiftExponent(intDigits, frac, exp) {
  let int = intDigits;
  let f = frac;
  if (exp > 0) {
    const take = Math.min(exp, f.length);
    int += f.slice(0, take) + '0'.repeat(exp - take);
    f = f.slice(take);
  } else if (exp < 0) {
    const shift = -exp;
    const padded = int.padStart(shift + 1, '0');
    f = padded.slice(padded.length - shift) + f;
    int = padded.slice(0, padded.length - shift);
  }
  int = int.replace(/^0+(?=\d)/, '');
  f = f.replace(/0+$/, '');
  return f ? `${int}.${f}` : int;
}

// A JS number as a plain decimal text (no exponent), for parseDecimal.
function expandNumber(n) {
  const t = String(n);
  if (!/[eE]/.test(t)) return t;
  const m = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(t);
  return `${m[1]}${shiftExponent(m[2], m[3] || '', parseInt(m[4], 10))}`;
}

const digitsCache = new Map();
// Minor-unit digits of a currency code: 2 for USD, 0 for JPY, 2 for a code Intl rejects (USDT).
export function minorDigits(ccy) {
  const key = String(ccy || '').toUpperCase();
  if (digitsCache.has(key)) return digitsCache.get(key);
  let d = 2;
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency: key }).resolvedOptions().maximumFractionDigits;
  } catch { d = 2; }
  digitsCache.set(key, d);
  return d;
}

// Scale by 10^digits and round half away from zero to an integer, with a relative epsilon of
// 1e-12 so binary noise such as 1.005 * 100 = 100.49999999999999 rounds as the decimal reads.
export function roundMinor(x, digits) {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new TypeError(`roundMinor needs a finite number, got ${String(x)}`);
  const scaled = x * 10 ** digits;
  const r = Math.floor(Math.abs(scaled) * (1 + 1e-12) + 0.5);
  return r === 0 ? 0 : scaled < 0 ? -r : r;
}

// Integer minor units to a decimal string in major units (12345, 2 -> "123.45"). Exact.
export function minorToDecimal(minor, digits) {
  if (!Number.isInteger(minor)) throw new TypeError('minorToDecimal needs an integer');
  const s = String(Math.abs(minor)).padStart(digits + 1, '0');
  const body = digits === 0 ? s : `${s.slice(0, s.length - digits)}.${s.slice(s.length - digits)}`;
  return (minor < 0 ? '-' : '') + body;
}
