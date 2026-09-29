// The two texts the lawyer approved (projects/trading-journal/docs/legal-review.md section 4, EN and EL). They ship verbatim: the
// boundary guard accepts them only by hash (scope `legal`), so any edit here fails a test until counsel's new text and hash replace it.
// Source: legal-review.md at ais-os commit 44ed330c.

export const FIRST_RUN = {
  en: 'This app keeps your trade record and reviews your own past trades against your own rules. It never tells you to buy, sell or hold anything, never predicts prices, never holds or moves money and never asks for your broker login.',
  el: 'Η εφαρμογή κρατά το αρχείο των συναλλαγών σας και ελέγχει τις δικές σας παλιότερες συναλλαγές με βάση τους δικούς σας κανόνες. Δεν σας λέει ποτέ να αγοράσετε, να πουλήσετε ή να κρατήσετε κάτι, δεν προβλέπει τιμές, δεν κρατά ούτε μετακινεί χρήματα και δεν ζητά ποτέ τα στοιχεία σύνδεσής σας στον broker.',
};

export const ABOUT = {
  en: 'What this app is: a journal and review tool. It analyses the trades you enter or import against the rules you set. What it is not: it gives no investment advice and no recommendation about any financial instrument or crypto-asset, does not recommend brokers, exchanges or platforms, and does not predict prices. It is not tax or legal advice. Figures describe your past trades and say nothing certain about future ones. Trading can lose money, including more than you put in when leverage is used. Every decision is yours. Its numbers are only as good as the data you enter; check them against your broker\'s statements. The software is provided free, as is, under the licence in the repository.',
  el: 'Τι είναι η εφαρμογή: ένα ημερολόγιο και εργαλείο ανασκόπησης. Αναλύει τις συναλλαγές που καταχωρίζετε ή εισάγετε με βάση τους κανόνες που θέτετε εσείς. Τι δεν είναι: δεν παρέχει επενδυτικές συμβουλές ούτε συστάσεις για κανένα χρηματοπιστωτικό μέσο ή κρυπτο-περιουσιακό στοιχείο, δεν προτείνει brokers, χρηματιστήρια ή πλατφόρμες και δεν προβλέπει τιμές. Δεν αποτελεί φορολογική ή νομική συμβουλή. Τα στοιχεία περιγράφουν τις παλιότερες συναλλαγές σας και δεν λένε τίποτα βέβαιο για το μέλλον. Οι συναλλαγές μπορεί να σας κοστίσουν χρήματα, και με μόχλευση περισσότερα από όσα καταθέσατε. Κάθε απόφαση είναι δική σας. Οι αριθμοί είναι τόσο σωστοί όσο τα δεδομένα που δίνετε: ελέγχετέ τους με τις καταστάσεις του broker σας. Το λογισμικό διατίθεται δωρεάν, ως έχει, με την άδεια που αναφέρεται στο αποθετήριο.',
};

// The About page shows the text in two blocks under the headings the text itself carries. The split only cuts the string at
// its own markers, so the two blocks joined with their markers give the approved text back exactly (tested).
const MARKERS = {
  en: { is: 'What this app is: ', not: ' What it is not: ', isTitle: 'What this app is', notTitle: 'What it is not' },
  el: { is: 'Τι είναι η εφαρμογή: ', not: ' Τι δεν είναι: ', isTitle: 'Τι είναι η εφαρμογή', notTitle: 'Τι δεν είναι' },
};

export function aboutBlocks(lang) {
  const m = MARKERS[lang];
  const text = ABOUT[lang];
  const at = text.indexOf(m.not);
  return [
    { title: m.isTitle, body: text.slice(m.is.length, at) },
    { title: m.notTitle, body: text.slice(at + m.not.length) },
  ];
}

export const joinAboutBlocks = (lang, blocks) => `${MARKERS[lang].is}${blocks[0].body}${MARKERS[lang].not}${blocks[1].body}`;

// Facts of legal-review.md section 5 that About must state (AC-P10.2). Hosts are the ones architecture section 6 allows.
export const MODEL_HOSTS = ['cdn.jsdelivr.net', 'huggingface.co', 'raw.githubusercontent.com'];
export const REPO = 'github.com/ionvovos/trading-journal';
export const APP_VERSION = '1.0.0';
