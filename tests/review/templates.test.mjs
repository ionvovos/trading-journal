import test from 'node:test';
import assert from 'node:assert/strict';
import { weeks, inputOf } from './helpers.mjs';
import { TEMPLATES, TITLES, renderSegments, segmentsToText } from '../../src/review/templates.js';
import { runReview } from '../../src/review/run.js';
import { check, stripQuotedSpans } from '../../src/review/guard.js';
import { placeholders } from '../../src/i18n/i18n.js';

test('both languages have the same template keys and the same placeholders', () => {
  assert.deepEqual(Object.keys(TEMPLATES.en).sort(), Object.keys(TEMPLATES.el).sort());
  for (const key of Object.keys(TEMPLATES.en)) {
    const names = (s) => placeholders(s.replace(/\{quote:(\w+)\}/g, '{$1}'));
    assert.deepEqual(names(TEMPLATES.el[key]), names(TEMPLATES.en[key]), key);
  }
  assert.deepEqual(Object.keys(TITLES.en).sort(), Object.keys(TITLES.el).sort());
});

test('every template passes the guard with sample values, in both languages (legal-review section 2)', () => {
  const sample = new Proxy({}, { get: (_, k) => (k === 'rule' ? 'The stop only moves toward profit.' : '3') });
  for (const lang of ['en', 'el']) {
    for (const [key, tpl] of Object.entries(TEMPLATES[lang])) {
      const segments = renderSegments(tpl, sample);
      const res = check('', lang, { scope: 'review', segments });
      assert.deepEqual(res.hits.map((h) => `${h.class}:${h.match}`), [], `${lang} ${key}: ${segmentsToText(segments, lang)}`);
    }
    for (const [pattern, title] of Object.entries(TITLES[lang])) assert.deepEqual(check(title, lang, { scope: 'ui' }).hits, [], `${lang} title ${pattern}`);
  }
});

test('the questions are open questions', () => {
  for (const lang of ['en', 'el']) {
    for (const [key, tpl] of Object.entries(TEMPLATES[lang])) {
      if (!key.endsWith('.q')) continue;
      assert.ok(/[?;]$/.test(tpl), `${lang} ${key} ends with a question mark`);
      assert.deepEqual(check(tpl, lang, { scope: 'review' }).hits, [], `${lang} ${key}`);
    }
  }
});

test('the user\'s own rule is rendered inside quotation marks and reaches the guard as a quoted segment', () => {
  const segs = renderSegments(TEMPLATES.en['plan_not_followed.quote'], { rule: 'Move your stop only toward profit.', kept: '5', total: '6' });
  assert.equal(segs.find((s) => s.quoted).text, 'Move your stop only toward profit.');
  assert.equal(segmentsToText(segs, 'en'), 'Your plan says: “Move your stop only toward profit.” 5 of 6 trades followed it.');
  assert.equal(segmentsToText(renderSegments(TEMPLATES.el['plan_not_followed.quote'], { rule: 'Χ', kept: '5', total: '6' }), 'el'), 'Το σχέδιό σας λέει: «Χ» 5 από 6 συναλλαγές το ακολούθησαν.');
  assert.equal(check('', 'en', { scope: 'review', segments: segs }).ok, true);
});

test('every finding of the three weeks renders, in both languages, with a sentence that passes the guard and a question', async () => {
  for (const name of ['stocks', 'crypto', 'forex']) {
    for (const lang of ['en', 'el']) {
      const review = await runReview(inputOf(weeks[name], { lang }));
      assert.ok(review.findings.length >= 3, `${name}/${lang}`);
      assert.deepEqual(review.dropped, []);
      for (const f of review.findings) {
        assert.equal(f.textBy, 'rules');
        assert.ok(f.text && f.question, `${name}/${lang}/${f.pattern}`);
        assert.deepEqual(check(stripQuotedSpans(f.text), lang, { scope: 'review' }).hits, [], `${name}/${lang}/${f.pattern}: ${f.text}`);
        assert.equal(f.text.includes('{'), false, `unfilled placeholder in ${f.text}`);
      }
    }
  }
});

test('English sentences of the crypto week read as data with n', async () => {
  const review = await runReview(inputOf(weeks.crypto));
  const by = Object.fromEntries(review.findings.map((f) => [f.pattern, f.text]));
  assert.equal(by.plan_not_followed, 'Your plan says: “Write the reason before entering” 4 of 8 trades followed it.');
  assert.equal(by.busy_days, '2 days had more trades than your median of 1 per day (n=5).');
  assert.equal(by.days_over_cap, 'On 1 day you opened more trades than the cap in your plan, 2 (n=3).');
  assert.match(by.size_rising, /^Your risk per trade rose over the period, from 1\.0% to 2\.6% of equity at entry \(n=8\)\.$/);
  assert.equal(by.entry_after_loss, '1 trade was opened within 30 minutes of a losing close, after two losses in a row. 2 trades opened after a losing close had more risk than your median and were marked not followed.');
});
