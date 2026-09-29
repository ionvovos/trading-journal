// Fixed review sentences, English and Greek (architecture 5.2). Written to legal-review.md section 2 rules 1-8: they describe closed
// trades with n, quote the user's own rule instead of prescribing one, carry no instruction, prediction or label, and ask open
// questions. They are always produced and are the fallback when a model sentence fails the guard. Pure.
// A placeholder {name} is a display string; {quote:name} is the user's own plan text, rendered inside quotation marks and
// passed to the guard as a quoted segment.
import { formatMessage } from '../i18n/i18n.js';

export const TEMPLATES = {
  en: {
    'plan_not_followed': '{off} of {marked} trades with a plan mark were marked not followed.',
    'plan_not_followed.quote': 'Your plan says: {quote:rule} {kept} of {total} trades followed it.',
    'plan_not_followed.q': 'What was going on in the trades marked not followed?',
    'entry_after_loss.window': '{a, plural, one {# trade was} other {# trades were}} opened within {window} minutes of a losing close, after two losses in a row.',
    'entry_after_loss.risk': '{b, plural, one {# trade} other {# trades}} opened after a losing close had more risk than your median and {b, plural, one {was} other {were}} marked not followed.',
    'entry_after_loss.q': 'What was going on before these trades?',
    'busy_days': '{days, plural, one {# day had} other {# days had}} more trades than your median of {median} per day (n={n}).',
    'busy_days.q': 'What was different about those days?',
    'days_over_cap': 'On {days, plural, one {# day} other {# days}} you opened more trades than the cap in your plan, {cap} (n={n}).',
    'days_over_cap.q': 'What happened on those days?',
    'no_setup_share': '{share} of trades have no setup tag ({n} of {total}).',
    'no_setup_share.q': 'What was the idea behind these trades?',
    'size_rising.r': 'Your risk per trade rose over the period, from {from} to {to} of equity at entry (n={n}).',
    'size_rising.value': 'Your position value rose over the period, from {from} to {to} of equity at entry (n={n}); risk was unknown for {unknown} of these trades.',
    'size_rising.q': 'What changed between the first and the last of these trades?',
    'added_while_losing': 'In {n, plural, one {# trade} other {# trades}} you added to a position while it showed a loss at the price you added at.',
    'added_while_losing.q': 'What was going on when you added?',
    'stop_moved': 'In {moved, plural, one {# trade} other {# trades}} the stop was moved away from the entry.',
    'stop_missing': '{missing, plural, one {# trade had} other {# trades had}} no stop.',
    'stop_moved_or_missing.r': 'Trades with a stop moved away averaged {avgMovedR} (R known for {rKnownMoved}).',
    'stop_moved_or_missing.q': 'What was going on around the stops in these trades?',
    'holding_and_target.time': 'Average holding time: winners {winners}, losers {losers} (n={nWinners} and n={nLosers}).',
    'holding_and_target.target': 'Your plan target was {targetR}; winners closed at {winnersR} on average (n={nTarget}).',
    'holding_and_target.q': 'How did the holding time compare with what you planned?',
    'outside_set_hours': 'Trades opened outside the hours you set ({hours}): {n} of {total}.',
    'outside_set_hours.q': 'What was going on with these entries?',
    'after_daily_loss_limit': '{n, plural, one {# trade was} other {# trades were}} opened after the day’s closed loss reached the limit in your plan, {limit}.',
    'after_daily_loss_limit.q': 'What was going on on those days?',
    'process.line': 'Followed plan: {n1} trades, average {r1}. Off plan: {n2} trades, average {r2}.',
    'process.unmarked': '{n, plural, one {# trade carries} other {# trades carry}} no plan mark.',
    'left': '{open} open, {heldOut} held out and {userExcluded} excluded trades were left out.',
    'none': 'No pattern found in {n, plural, one {# closed trade} other {# closed trades}}.',
    'none.checked': 'Checked: {list}.',
    'small': 'Small sample: {n, plural, one {# closed trade} other {# closed trades}}.',
  },
  el: {
    'plan_not_followed': '{off} από {marked} συναλλαγές με σήμανση σχεδίου σημειώθηκαν ως εκτός σχεδίου.',
    'plan_not_followed.quote': 'Το σχέδιό σας λέει: {quote:rule} {kept} από {total} συναλλαγές το ακολούθησαν.',
    'plan_not_followed.q': 'Τι συνέβαινε στις συναλλαγές που σημειώθηκαν ως εκτός σχεδίου;',
    'entry_after_loss.window': '{a, plural, one {# συναλλαγή ανοίχτηκε} other {# συναλλαγές ανοίχτηκαν}} μέσα σε {window} λεπτά από κλείσιμο με απώλεια, μετά από δύο απώλειες στη σειρά.',
    'entry_after_loss.risk': '{b, plural, one {# συναλλαγή μετά από κλείσιμο με απώλεια είχε} other {# συναλλαγές μετά από κλείσιμο με απώλεια είχαν}} μεγαλύτερο ρίσκο από τη διάμεσό σας και {b, plural, one {σημειώθηκε} other {σημειώθηκαν}} ως εκτός σχεδίου.',
    'entry_after_loss.q': 'Τι συνέβαινε πριν από αυτές τις συναλλαγές;',
    'busy_days': '{days, plural, one {# ημέρα είχε} other {# ημέρες είχαν}} περισσότερες συναλλαγές από τη διάμεσό σας, που είναι {median} ανά ημέρα (n={n}).',
    'busy_days.q': 'Τι ήταν διαφορετικό σε αυτές τις ημέρες;',
    'days_over_cap': 'Σε {days, plural, one {# ημέρα} other {# ημέρες}} ανοίξατε περισσότερες συναλλαγές από το όριο του σχεδίου σας, {cap} (n={n}).',
    'days_over_cap.q': 'Τι συνέβη εκείνες τις ημέρες;',
    'no_setup_share': '{share} των συναλλαγών δεν έχουν ετικέτα setup ({n} από {total}).',
    'no_setup_share.q': 'Ποια ήταν η ιδέα πίσω από αυτές τις συναλλαγές;',
    'size_rising.r': 'Το ρίσκο σας ανά συναλλαγή αυξήθηκε στην περίοδο, από {from} σε {to} του κεφαλαίου κατά την είσοδο (n={n}).',
    'size_rising.value': 'Η αξία θέσης σας αυξήθηκε στην περίοδο, από {from} σε {to} του κεφαλαίου κατά την είσοδο (n={n}). Το ρίσκο ήταν άγνωστο σε {unknown} από αυτές τις συναλλαγές.',
    'size_rising.q': 'Τι άλλαξε ανάμεσα στην πρώτη και στην τελευταία από αυτές τις συναλλαγές;',
    'added_while_losing': 'Σε {n, plural, one {# συναλλαγή} other {# συναλλαγές}} προσθέσατε σε θέση ενώ αυτή έδειχνε απώλεια στην τιμή της προσθήκης.',
    'added_while_losing.q': 'Τι συνέβαινε τη στιγμή της προσθήκης;',
    'stop_moved': 'Σε {moved, plural, one {# συναλλαγή} other {# συναλλαγές}} το στοπ μετακινήθηκε μακριά από την είσοδο.',
    'stop_missing': '{missing, plural, one {# συναλλαγή δεν είχε} other {# συναλλαγές δεν είχαν}} στοπ.',
    'stop_moved_or_missing.r': 'Οι συναλλαγές με στοπ που μετακινήθηκε μακριά είχαν μέσο {avgMovedR} (γνωστό R σε {rKnownMoved}).',
    'stop_moved_or_missing.q': 'Τι συνέβαινε γύρω από τα στοπ σε αυτές τις συναλλαγές;',
    'holding_and_target.time': 'Μέσος χρόνος διακράτησης: κερδισμένες {winners}, χαμένες {losers} (n={nWinners} και n={nLosers}).',
    'holding_and_target.target': 'Ο στόχος του σχεδίου σας ήταν {targetR}· οι κερδισμένες έκλεισαν κατά μέσο όρο στα {winnersR} (n={nTarget}).',
    'holding_and_target.q': 'Πώς συνδέεται ο χρόνος διακράτησης με αυτό που είχατε σχεδιάσει;',
    'outside_set_hours': 'Συναλλαγές που ανοίχτηκαν εκτός των ωρών που ορίσατε ({hours}): {n} από {total}.',
    'outside_set_hours.q': 'Τι συνέβαινε σε αυτές τις εισόδους;',
    'after_daily_loss_limit': '{n, plural, one {# συναλλαγή ανοίχτηκε} other {# συναλλαγές ανοίχτηκαν}} αφού η κλεισμένη απώλεια της ημέρας έφτασε το όριο του σχεδίου σας, {limit}.',
    'after_daily_loss_limit.q': 'Τι συνέβαινε εκείνες τις ημέρες;',
    'process.line': 'Ακολούθησαν το σχέδιο: {n1} συναλλαγές, μέσο {r1}. Εκτός σχεδίου: {n2} συναλλαγές, μέσο {r2}.',
    'process.unmarked': '{n, plural, one {# συναλλαγή δεν έχει} other {# συναλλαγές δεν έχουν}} σήμανση σχεδίου.',
    'left': 'Δεν συμπεριλήφθηκαν {open} ανοιχτές, {heldOut} σε αναμονή και {userExcluded} εξαιρεμένες συναλλαγές.',
    'none': 'Δεν βρέθηκε μοτίβο σε {n, plural, one {# κλειστή συναλλαγή} other {# κλειστές συναλλαγές}}.',
    'none.checked': 'Ελέγχθηκαν: {list}.',
    'small': 'Μικρό δείγμα: {n, plural, one {# κλειστή συναλλαγή} other {# κλειστές συναλλαγές}}.',
  },
};

// Title of each pattern by the behaviour, never by a label on the person. Kept equal to review.ui.title.* in the catalogues (tested).
export const TITLES = {
  en: {
    plan_not_followed: 'Plan rules not followed',
    entry_after_loss: 'Entries soon after a losing close',
    busy_days: 'Days with more trades than your median',
    days_over_cap: 'Days over your daily cap',
    no_setup_share: 'Trades with no setup tag',
    size_rising: 'Position size rising',
    added_while_losing: 'Legs added while the position showed a loss',
    stop_moved_or_missing: 'Stops moved or missing',
    holding_and_target: 'Holding time and plan target',
    outside_set_hours: 'Trades outside the hours you set',
    after_daily_loss_limit: 'Entries after the daily loss limit',
  },
  el: {
    plan_not_followed: 'Κανόνες σχεδίου που δεν τηρήθηκαν',
    entry_after_loss: 'Είσοδοι αμέσως μετά από κλείσιμο με απώλεια',
    busy_days: 'Ημέρες με περισσότερες συναλλαγές από τη διάμεσό σας',
    days_over_cap: 'Ημέρες πάνω από το ημερήσιο όριό σας',
    no_setup_share: 'Συναλλαγές χωρίς ετικέτα setup',
    size_rising: 'Αύξηση μεγέθους θέσης',
    added_while_losing: 'Προσθήκες ενώ η θέση είχε απώλεια',
    stop_moved_or_missing: 'Στοπ που μετακινήθηκαν ή λείπουν',
    holding_and_target: 'Χρόνος διακράτησης και στόχος σχεδίου',
    outside_set_hours: 'Συναλλαγές εκτός των ωρών που ορίσατε',
    after_daily_loss_limit: 'Είσοδοι μετά το ημερήσιο όριο απώλειας',
  },
};

// {name}, {n, plural, one {..} other {..}} and {quote:name} to segments [{ text, quoted? }]. The quote placeholder is the user's own
// text: it is set aside before formatting, so nothing in it is read as a placeholder, and it comes back as a quoted segment.
const QUOTE_OPEN = '\u0001';
const QUOTE_CLOSE = '\u0002';
export function renderSegments(template, params, lang = 'en') {
  const quotes = {};
  const prepared = template.replace(/\{quote:(\w+)\}/g, (_, name) => { quotes[name] = String(params[name] ?? ''); return `${QUOTE_OPEN}${name}${QUOTE_CLOSE}`; });
  const formatted = formatMessage(prepared, params, lang);
  const out = [];
  for (const part of formatted.split(/(\u0001\w+\u0002)/)) {
    if (!part) continue;
    const m = /^\u0001(\w+)\u0002$/.exec(part);
    out.push(m ? { text: quotes[m[1]], quoted: true } : { text: part });
  }
  return out;
}

// Plain text of segments; quoted text goes inside quotation marks of the language.
export function segmentsToText(segments, lang) {
  const [open, close] = lang === 'el' ? ['«', '»'] : ['“', '”'];
  return segments.map((s) => (s.quoted ? `${open}${s.text}${close}` : s.text)).join('').replace(/\s+/g, ' ').trim();
}

// The display helpers a template needs, from src/i18n/format.js createFormat().
const shown = (fmt) => ({
  pct: (v) => fmt.pct(v, 1),
  r: (v) => fmt.r(v, 1),
  count: (v) => fmt.num(v, Number.isInteger(v) ? 0 : 1),
  dur: (s) => fmt.duration(s),
});

// Builds the lines of one finding: [{ key, params }] chosen from its facts, then the question.
export function linesFor(finding, fmt) {
  const f = finding.facts;
  const x = shown(fmt);
  switch (finding.pattern) {
    case 'plan_not_followed':
      return f.quote
        ? [{ key: 'plan_not_followed.quote', params: { rule: f.quote.text, kept: x.count(f.quote.kept), total: x.count(f.quote.total) } }]
        : [{ key: 'plan_not_followed', params: { off: x.count(f.off), marked: x.count(f.marked) } }];
    case 'entry_after_loss': {
      const lines = [];
      if (f.a) lines.push({ key: 'entry_after_loss.window', params: { a: x.count(f.a), window: x.count(f.window) } });
      if (f.b) lines.push({ key: 'entry_after_loss.risk', params: { b: x.count(f.b) } });
      return lines;
    }
    case 'busy_days': return [{ key: 'busy_days', params: { days: x.count(f.days), median: x.count(f.median), n: x.count(finding.n) } }];
    case 'days_over_cap': return [{ key: 'days_over_cap', params: { days: x.count(f.days), cap: x.count(f.cap), n: x.count(finding.n) } }];
    case 'no_setup_share': return [{ key: 'no_setup_share', params: { share: x.pct(f.share), n: x.count(f.n), total: x.count(f.total) } }];
    case 'size_rising':
      return finding.basis === 'r'
        ? [{ key: 'size_rising.r', params: { from: x.pct(f.from), to: x.pct(f.to), n: x.count(f.n) } }]
        : [{ key: 'size_rising.value', params: { from: x.pct(f.from), to: x.pct(f.to), n: x.count(f.n), unknown: x.count(f.unknown) } }];
    case 'added_while_losing': return [{ key: 'added_while_losing', params: { n: x.count(f.n) } }];
    case 'stop_moved_or_missing': {
      const lines = [];
      if (f.moved) lines.push({ key: 'stop_moved', params: { moved: x.count(f.moved), n: x.count(f.moved) } });
      if (f.avgMovedR !== null && f.rKnownMoved) lines.push({ key: 'stop_moved_or_missing.r', params: { avgMovedR: x.r(f.avgMovedR), rKnownMoved: x.count(f.rKnownMoved) } });
      if (f.missing) lines.push({ key: 'stop_missing', params: { missing: x.count(f.missing), n: x.count(f.missing) } });
      return lines;
    }
    case 'holding_and_target': {
      const lines = [];
      if (f.nWinners) lines.push({ key: 'holding_and_target.time', params: { winners: x.dur(f.winnersSeconds), losers: x.dur(f.losersSeconds), nWinners: x.count(f.nWinners), nLosers: x.count(f.nLosers) } });
      if (f.nTarget) lines.push({ key: 'holding_and_target.target', params: { targetR: x.r(f.targetR), winnersR: x.r(f.winnersR), nTarget: x.count(f.nTarget) } });
      return lines;
    }
    case 'outside_set_hours': return [{ key: 'outside_set_hours', params: { hours: f.hours, n: x.count(f.n), total: x.count(f.total) } }];
    case 'after_daily_loss_limit': return [{ key: 'after_daily_loss_limit', params: { n: x.count(f.n), limit: x.pct(f.limit) } }];
    default: return [];
  }
}

// One finding rendered: { segments, text, question, shown } where `shown` merges the display values every line used (the facts a
// model is given and the numbers its text is checked against).
export function renderFinding(finding, lang, fmt) {
  const lines = linesFor(finding, fmt);
  const table = TEMPLATES[lang];
  const segments = [];
  const shownFacts = {};
  lines.forEach((line, i) => {
    if (i > 0) segments.push({ text: ' ' });
    segments.push(...renderSegments(table[line.key], line.params, lang));
    Object.assign(shownFacts, line.params);
  });
  return { segments, text: segmentsToText(segments, lang), question: table[`${finding.pattern}.q`] ?? null, shown: shownFacts };
}

export function renderKey(key, params, lang) {
  const segments = renderSegments(TEMPLATES[lang][key], params, lang);
  return { segments, text: segmentsToText(segments, lang) };
}
