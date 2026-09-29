// Word lists for the boundary guard (architecture 5.2, legal-review.md section 2 rules 1-10, requirements P5 and B1).
// Every entry is a regular-expression source. English is matched on lower-cased text; Greek is matched on text with accents
// removed, final sigma folded to sigma and lower-cased (see normalize in guard.js), so stems are written without accents.
// Word-list classes match anywhere in a sentence. Sentence-initial classes look only at the first word(s) of a sentence.

// Whole word: no letter or digit before or after.
const W = (s) => `(?<![\\p{L}\\p{N}])(?:${s})(?![\\p{L}\\p{N}])`;
// Stem: no letter or digit before, any ending.
const S = (s) => `(?<![\\p{L}\\p{N}])(?:${s})`;

export const CLASSES = Object.freeze(['modal', 'future', 'ranking', 'platform', 'label', 'promise', 'readiness', 'benchmark', 'screen_word', 'instruction', 'imperative', 'leading_question', 'legal_mismatch']);

export const WORD_LISTS = {
  en: {
    modal: [W("should(?:n['’]t)?|must(?:n['’]t)?|needs? to|have to|has to|ought to|consider\\w*|try|trying|avoid\\w*|focus(?:ing)? on|stick(?:ing)? (?:with|to)")],
    future: [W("will|won['’]t|going to|shall|gonna"), "(?<=\\p{L})['’]ll(?![\\p{L}])"],
    ranking: [W("better|worse|best|worst|do more|do less|good entry|bad entry|not for you|outperform\\w*|underperform\\w*")],
    label: [W("you are an?|you['’]re an?|revenge|overtrad\\w*|disposition effect|gambler|undisciplined|reckless")],
    promise: [W("guarantee[ds]?|risk[- ]free|you will recover|edge is proven|proven edge|no risk|certain profits?")],
    readiness: [W("ready|not ready|suitable|unsuitable|go live|going live|good to go")],
    readinessComparison: [W("start|starting|stop|stopping")],
    benchmark: [W("barber|odean|studies show|study shows|research shows")],
    screen_word: [W("analysis|research|outlook|advis(?:or|er)s?|coach(?:es|ing)?|assistants?|signals?|insights?")],
  },
  el: {
    modal: [S('πρεπει|θα επρεπε|να αποφευγετε|προτεινεται|σκεφτειτε να|δοκιμαστε|οφειλετε')],
    future: [W('θα')],
    ranking: [S('καλυτερ|χειροτερ')],
    label: [S('εισαι|εκδικητικ|υπερσυναλλαγ'), S('ειστε (?:ενασ|μια|ενα)')],
    promise: [S('εγγυημεν|χωρισ ρισκο|χωρισ κινδυν')],
    readiness: [S('ετοιμ|καταλληλ|μη καταλληλ')],
    readinessComparison: [S('ξεκινησ|ξεκινα|σταματ')],
    benchmark: [W('barber|odean'), S('μελετη δειχνει|μελετεσ δειχνουν')],
    screen_word: [S('αναλυση αγορασ|ερευν|προοπτικ|συμβουλ|προπονητ'), W('βοηθοσ|βοηθου|βοηθο|βοηθοι|σημα|σηματα')],
  },
};

// A recommendation of a broker, exchange, platform or wallet: recommend/suggest within five words of one of these.
export const PLATFORM = {
  en: { verbs: W('recommend\\w*|suggest\\w*|better|best|worse|worst|switch to|go with'), targets: W("brokers?|exchanges?|platforms?|wallets?|interactive brokers|ibkr|kraken|binance|coinbase|metatrader|mt4|mt5|trading 212|robinhood|etoro") },
  el: { verbs: S('προτειν|συνιστ|προτασ|καλυτερ|χειροτερ|αλλαξτε'), targets: S('broker|χρηματιστηρι|πλατφορμ|πορτοφολι|ανταλλακτηρι|interactive|ibkr|kraken|binance|coinbase|metatrader|mt4|mt5') },
};

// Sentence-initial: an imperative trade verb (first word or first two words).
export const INSTRUCTION = {
  en: ['buy', 'sell', 'hold', 'close', 'avoid', 'trade', 'short', 'go long', 'go short', 'add to', 'cut', 'size', 'move', 'pause', 'stop trading'],
  el: ['αγορασε', 'αγοραστε', 'πουλησε', 'πουληστε', 'κρατησε', 'κρατηστε', 'κλεισε', 'κλειστε', 'αποφυγε', 'αποφυγετε', 'σταματα', 'σταματησε', 'σταματηστε', 'μετακινησε', 'μετακινηστε', 'αυξησε', 'αυξηστε', 'μειωσε', 'μειωστε'],
};

// A directive verb that starts a later clause ("..., so move your stop"): only these, and only before one of these words,
// so "closed close to the plan" is not read as an instruction.
export const CLAUSE_INSTRUCTION = {
  verbs: { en: ['buy', 'sell', 'move', 'close', 'avoid', 'trade', 'cut', 'pause', 'hold', 'add'], el: ['αγορασε', 'αγοραστε', 'πουλησε', 'πουληστε', 'μετακινησε', 'μετακινηστε', 'κλεισε', 'κλειστε', 'αποφυγε', 'αποφυγετε', 'κρατησε', 'κρατηστε'] },
  before: ['your', 'the', 'this', 'that', 'these', 'those', 'it', 'them', 'all', 'out', 'up', 'down', 'more', 'less', 'now', 'half', 'any', 'a', 'an', 'only', 'το', 'τη', 'την', 'τον', 'αυτο', 'αυτη', 'αυτον', 'ολα', 'τωρα', 'σασ', 'σου'],
};

// Sentence-initial: any imperative from a longer list. Scopes review and comparison only.
export const IMPERATIVE = {
  en: ['try', 'look', 'take', 'keep', 'make', 'stay', 'wait', 'set', 'use', 'check', 'review', 'reduce', 'increase', 'decrease', 'limit', 'follow', 'add', 'remove', 'tighten', 'widen', 'cut', 'size', 'move', 'pause', 'stop', 'start', 'hold', 'close', 'buy', 'sell', 'avoid', 'trade', 'go', 'ask', 'think', 'remember', 'consider', 'focus', 'stick', 'let', 'don\'t', 'never', 'always', 'be', 'get', 'put', 'enter', 'exit', 'risk', 'plan', 'reconsider', 'revisit', 'compare', 'aim', 'allow', 'ensure', 'make sure', 'do not', 'do more', 'do less', 'wait for', 'limit'],
  el: ['κοιταξτε', 'δειτε', 'σκεφτειτε', 'δοκιμαστε', 'προσπαθηστε', 'περιμενετε', 'χρησιμοποιηστε', 'ελεγξτε', 'ακολουθηστε', 'κρατηστε', 'μεινετε', 'βαλτε', 'θεστε', 'προσθεστε', 'αφαιρεστε', 'μειωστε', 'αυξηστε', 'περιορηστε', 'περιοριστε', 'επικεντρωθειτε', 'εστιαστε', 'θυμηθειτε', 'ρωτηστε', 'αποφυγετε', 'σταματηστε', 'ξεκινηστε', 'συνεχιστε', 'κανετε', 'παρτε', 'βγειτε', 'μπειτε', 'μην', 'μη', 'συγκρινετε', 'διαλεξτε', 'αλλαξτε'],
};

// A question is open when it starts with one of these; anything else that ends in a question mark is leading.
export const OPEN_QUESTION = {
  en: ['what', 'how', 'which', 'when', 'where'],
  el: ['τι', 'πωσ', 'ποιο', 'ποια', 'ποιοσ', 'ποιοι', 'ποιεσ', 'ποιον', 'ποιων', 'ποτε', 'που', 'ποσο', 'ποσα', 'ποσεσ', 'ποσοι'],
};
