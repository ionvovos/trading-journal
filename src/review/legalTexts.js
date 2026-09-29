// Pinned SHA-256 hashes (hex, of the NFC-normalised text) of the texts legal-review.md section 4 mandates: the first-run sentence and the
// About text, English and Greek. Scope `legal` in guard.js accepts a string only if its hash is listed here, so these texts ship
// verbatim and an edit fails tests/review until the lawyer's replacement text and its hash are added (V1 gate G2).
// The texts themselves live in tests/fixtures/review/legal-table.json (rows with scope "legal"), in the About view and in src/learn (cfd).
export const LEGAL_HASHES = Object.freeze({
  firstRun: Object.freeze({
    en: Object.freeze(['87cc9bb634fa223f29111e97e26d09c37aec3fed6ffc34fca0d144053c92d99e']),
    el: Object.freeze(['d4e1eb5f4d3b269f2bef79801b4fae1cd4a168194905fd31eef71539a6112859']),
  }),
  // G11 (c): aios-lawyer may replace the About text (two boundary clauses); add the new hash here and keep the old one until then.
  about: Object.freeze({
    en: Object.freeze(['17110ce763021025b824e696fc0881214d8100ff24266228822c9658e285c002']),
    el: Object.freeze(['98839b6d71fb6a50dbd5e76832b22bd6543e617bce758995aca4babfb02fce40']),
  }),
  // legal-review W9 / AC-P6.4: the CFD loss-rate sentence, no number. The Greek text is an S3 draft of it; aios-lawyer confirms or replaces it (L4).
  cfd: Object.freeze({
    en: Object.freeze(['d4a4fd89c18c27ed36f50c32621400ebaa5a432537bc52b7bc64f56599be8f22']),
    el: Object.freeze(['067065fa96a56f5daa0137e6ee9ac6156520398c3e9f402bf83d5add7a318d43']),
  }),
});

export const ALL_LEGAL_HASHES = Object.freeze(new Set(Object.values(LEGAL_HASHES).flatMap((byLang) => Object.values(byLang).flat())));
