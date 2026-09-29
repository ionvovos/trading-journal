// The review (architecture 5.2, requirements P5). Code finds the patterns and the trades behind them; fixed templates write the
// sentences and questions. A model may only put the findings in order (RULING-L4-F5 R1): it returns ids, never text, so no sentence it
// writes can be shown. With no model the review is produced by rules and says so.
import { buildRows } from './rows.js';
import { findPatterns, processOutcome, optionalSections, PATTERNS } from './patterns.js';
import { renderFinding, renderKey, TITLES } from './templates.js';
import { check } from './guard.js';
import { RULES_ENGINE } from '../ai/engine.js';
import { createFormat } from '../i18n/format.js';

export const ARRANGE_TIMEOUT_MS = 60000;

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error('The model did not answer in time.'), { kind: 'timeout' })), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

// input: { trades, cash, accounts, plans, settings, mode, period: { from, to, zone? }, lang, tz, now: Date|ISO }
// deps:  { engine (from createEngines().resolve, default rules), bus, fmt }
export async function runReview(input, { engine = RULES_ENGINE, bus = null, fmt = null, timeoutMs = ARRANGE_TIMEOUT_MS } = {}) {
  const { trades = [], cash = [], accounts = {}, plans = [], settings = {}, mode = 'real', period = null, lang = 'en', now = new Date() } = input;
  const tz = input.tz ?? settings.tz ?? 'UTC';
  const dayCutoffHour = Number(settings.dayCutoffHour ?? 0);
  const f = fmt ?? createFormat({ lang, tz });
  const createdAt = new Date(now).toISOString();

  const { rows, left } = buildRows({ trades, cash, accounts, plans, mode, period, tz, dayCutoffHour });
  const plan = plans.find((p) => p.active) ?? null;
  const { findings: found, checked, thresholds } = findPatterns(rows, { plan, settings });

  const findings = [];
  const dropped = [];
  for (const finding of found) {
    const r = renderFinding(finding, lang, f);
    const scan = check('', lang, { scope: 'review', segments: r.segments });
    const scanQuestion = r.question ? check(r.question, lang, { scope: 'review' }) : { ok: true };
    // A template that fails the guard is a defect in templates.js; the finding is withheld rather than shown.
    if (!scan.ok || !scanQuestion.ok || !r.text) { dropped.push(finding.pattern); continue; }
    findings.push({
      id: `f${findings.length + 1}`, pattern: finding.pattern, titleKey: `review.ui.title.${finding.pattern}`, title: TITLES[lang][finding.pattern],
      n: finding.n, tradeIds: finding.tradeIds, facts: finding.facts, basis: finding.basis ?? null, threshold: finding.threshold,
      text: r.text, segments: r.segments, textBy: 'rules', question: r.question, shown: r.shown, ruleText: r.text,
    });
  }

  let engineId = 'rules';
  let engineNote = engine.id === 'rules' ? 'no_model' : '';
  if (engine.id !== 'rules' && typeof engine.arrange === 'function') {
    // The model only orders findings the code found (RULING-L4-F5 R1). Every sentence on screen is a template sentence, so no model
    // text can reach the page. A finding that quotes the user's own rule is never sent and keeps its place.
    const movable = findings.filter((x) => !x.segments.some((s) => s.quoted));
    engineNote = 'model_no_change';
    if (movable.length > 1) {
      try {
        const items = movable.map((x) => ({ id: x.id, pattern: x.pattern, facts: x.shown }));
        const answer = await withTimeout(engine.arrange(items), timeoutMs);
        const known = new Set(movable.map((x) => x.id));
        const asked = [...new Set(Array.isArray(answer) ? answer.filter((id) => typeof id === 'string' && known.has(id)) : [])];
        if (!asked.length) engineNote = 'model_rejected';
        else {
          const ordered = [...asked, ...movable.map((x) => x.id).filter((id) => !asked.includes(id))].map((id) => movable.find((x) => x.id === id));
          let next = 0;
          findings.forEach((x, i) => { if (!x.segments.some((s) => s.quoted)) findings[i] = ordered[next++]; });
          engineId = engine.id;
          engineNote = '';
        }
      } catch (err) {
        engineId = 'rules';
        engineNote = `failed:${err?.kind ?? 'error'}`;
        bus?.emit?.('ai-state', { engine: engine.id, state: 'failed', reason: err?.kind ?? 'error' });
      }
    }
  }
  for (const x of findings) { delete x.segments; delete x.ruleText; }

  const outcome = processOutcome(rows);
  const noPattern = findings.length === 0;
  return {
    id: `rv-${mode}-${createdAt}`,
    mode,
    period,
    createdAt,
    lang,
    engine: engineId,
    engineNote,
    counted: rows.length,
    small: { n: rows.length, min: Number(settings.smallSampleMin ?? 30), isSmall: rows.length < Number(settings.smallSampleMin ?? 30) },
    left,
    processOutcome: outcome,
    findings,
    optional: optionalSections(rows, { plan, settings }),
    checked,
    noPattern,
    thresholds,
    dropped,
    lines: {
      left: left.open || left.heldOut || left.userExcluded ? renderKey('left', { open: left.open, heldOut: left.heldOut, userExcluded: left.userExcluded }, lang).text : null,
      none: noPattern ? renderKey('none', { n: rows.length }, lang).text : null,
      checked: noPattern ? renderKey('none.checked', { list: checked.map((p) => TITLES[lang][p]).join(', ') }, lang).text : null,
      process: outcome.followed.n + outcome.offPlan.n
        ? renderKey('process.line', { n1: outcome.followed.n, r1: outcome.followed.avgR === null ? '–' : f.r(outcome.followed.avgR, 1), n2: outcome.offPlan.n, r2: outcome.offPlan.avgR === null ? '–' : f.r(outcome.offPlan.avgR, 1) }, lang).text
        : null,
    },
  };
}

export { PATTERNS };
