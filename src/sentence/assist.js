// What a model may add to a parsed sentence (architecture 5.3, AC-P1.6): `setup` (one of the user's own setups) and `notes`. The number
// fields stay the code parser's values. When the model read a number differently, or read one the code could not, the difference is
// returned as a conflict for the confirm step to show beside the code value; nothing is resolved silently and nothing is filled in.
import { cmp } from '../core/decimal.js';
import { check } from '../review/guard.js';

// parsed: parseSentence() result. assist: { setup, notes, numbers } from validateAssist, or null when no model ran.
export function mergeAssist(parsed, assist, { lang = 'en' } = {}) {
  const fields = { ...parsed.fields, notes: null };
  const conflicts = [];
  if (!assist) return { fields, conflicts, by: 'code' };
  if (fields.setup === null && assist.setup) fields.setup = assist.setup;
  // model-written notes pass the same boundary scan as review text; a failing note is dropped
  if (assist.notes && check(assist.notes, lang, { scope: 'review' }).ok) fields.notes = assist.notes;
  for (const [field, value] of Object.entries(assist.numbers ?? {})) {
    const code = parsed.fields[field];
    const ambiguous = parsed.ambiguous.some((a) => a.field === field);
    if (code === null || code === undefined) { if (!ambiguous) conflicts.push({ field, code: null, model: value }); continue; }
    if (cmp(code, value) !== 0) conflicts.push({ field, code, model: value });
  }
  return { fields, conflicts, by: 'model' };
}

// Runs the engine's assist() on one sentence. Never throws: a failing model returns the code result and the reason.
export async function assistSentence(engine, text, parsed, { lang = 'en', setups = [] } = {}) {
  if (!engine || engine.id === 'rules' || typeof engine.assist !== 'function') return { ...mergeAssist(parsed, null, { lang }), note: 'no_model' };
  try {
    const assist = await engine.assist(text, { setups, lang });
    return { ...mergeAssist(parsed, assist, { lang }), note: '' };
  } catch (err) {
    return { ...mergeAssist(parsed, null, { lang }), note: `failed:${err?.kind ?? 'error'}` };
  }
}
