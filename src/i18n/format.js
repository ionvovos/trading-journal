// Number, money, date and time formatting for the active language (architecture section 6). English follows navigator.language
// when it starts with "en", else en-GB; Greek is el-GR. The minus sign is U+2212 everywhere; sign and arrow carry gain and loss.
export const MINUS = '−';
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EL_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const EL_MONTHS_LONG = ['Ιανούαριος', 'Φεβρούαριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const EN_MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const localeFor = (lang, navLang = typeof navigator === 'undefined' ? '' : navigator.language) =>
  (lang === 'el' ? 'el-GR' : /^en/i.test(navLang ?? '') ? navLang : 'en-GB');

// Minor digits from Intl, 2 for a code Intl rejects (USDT).
export function minorDigits(ccy) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: ccy }).resolvedOptions().maximumFractionDigits; } catch { return 2; }
}

export function createFormat({ lang = 'en', tz = 'UTC', navLang } = {}) {
  const locale = localeFor(lang, navLang);
  const grouped = (dp) => new Intl.NumberFormat(locale, { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: 'always' });
  const sign = (v) => (v > 0 ? '+' : v < 0 ? MINUS : '');
  const partsIn = (iso, zone = tz) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute) };
  };
  const monthShort = (m) => (lang === 'el' ? EL_MONTHS : EN_MONTHS)[m - 1];
  const monthLong = (m) => (lang === 'el' ? EL_MONTHS_LONG : EN_MONTHS_LONG)[m - 1];
  const pad = (n) => String(n).padStart(2, '0');

  return {
    lang, locale, tz, minorDigits,
    // A plain number with grouping and fixed decimals, no sign.
    num: (v, dp = 0) => grouped(dp).format(v),
    // Signed number: "+1,284.60", "−842.30", "0.00".
    signed: (v, dp = 2) => `${sign(v)}${grouped(dp).format(Math.abs(v))}`,
    // minor units to a signed amount (no currency code; the code is shown apart, as on the dashboard hero).
    money: (minor, ccy = 'USD', { signed = true } = {}) => {
      const d = minorDigits(ccy);
      const v = minor / 10 ** d;
      return `${signed ? sign(v) : v < 0 ? MINUS : ''}${grouped(d).format(Math.abs(v))}`;
    },
    moneyPlain: (minor, ccy = 'USD') => { const d = minorDigits(ccy); return grouped(d).format(minor / 10 ** d); },
    pct: (v, dp = 1) => `${v < 0 ? MINUS : ''}${grouped(dp).format(Math.abs(v))}%`,
    pctSigned: (v, dp = 1) => `${sign(v)}${grouped(dp).format(Math.abs(v))}%`,
    r: (v, dp = 2) => `${sign(v)}${grouped(dp).format(Math.abs(v))}R`,
    pips: (v, dp = 1) => `${sign(v)}${grouped(dp).format(Math.abs(v))}`,
    duration: (seconds) => {
      const m = Math.round(seconds / 60);
      const h = Math.floor(m / 60);
      const u = lang === 'el' ? { h: 'ω', m: 'λ' } : { h: 'h', m: 'm' };
      return h ? `${h}${u.h} ${pad(m % 60)}${u.m}` : `${m}${u.m}`;
    },
    // "29 Sep", "29 Sep 2026", "Sep 2026", "September" in the declared zone.
    date: (iso, { style = 'short', zone } = {}) => {
      const p = partsIn(iso, zone);
      if (style === 'monthYear') return `${monthShort(p.m)} ${p.y}`;
      if (style === 'monthLong') return monthLong(p.m);
      if (style === 'long') return `${p.d} ${monthShort(p.m)} ${p.y}`;
      return `${p.d} ${monthShort(p.m)}`;
    },
    time: (iso, zone) => { const p = partsIn(iso, zone); return `${pad(p.h)}:${pad(p.min)}`; },
    monthLong, monthShort,
    parts: partsIn,
  };
}
