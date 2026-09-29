// The lawyer's texts ship verbatim (AC-P10.1, AC-B1.5): pinned by SHA-256 here and, when the review file is reachable, compared with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FIRST_RUN, ABOUT, aboutBlocks, joinAboutBlocks, MODEL_HOSTS } from '../../src/about/text.js';
import en from '../../src/i18n/en/shell.js';
import el from '../../src/i18n/el/shell.js';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const PINNED = {
  firstRunEn: '87cc9bb634fa223f29111e97e26d09c37aec3fed6ffc34fca0d144053c92d99e',
  firstRunEl: 'd4e1eb5f4d3b269f2bef79801b4fae1cd4a168194905fd31eef71539a6112859',
  aboutEn: '17110ce763021025b824e696fc0881214d8100ff24266228822c9658e285c002',
  aboutEl: '98839b6d71fb6a50dbd5e76832b22bd6543e617bce758995aca4babfb02fce40',
};

test('the four legal texts match their pinned hashes; any edit needs the lawyer\'s new text and a new hash', () => {
  assert.equal(sha(FIRST_RUN.en), PINNED.firstRunEn); assert.equal(sha(FIRST_RUN.el), PINNED.firstRunEl);
  assert.equal(sha(ABOUT.en), PINNED.aboutEn); assert.equal(sha(ABOUT.el), PINNED.aboutEl);
});

test('the catalogues carry the same strings under legal.*', () => {
  assert.equal(en['legal.firstRun'], FIRST_RUN.en); assert.equal(el['legal.firstRun'], FIRST_RUN.el);
  assert.equal(en['legal.about'], ABOUT.en); assert.equal(el['legal.about'], ABOUT.el);
});

test('the About page blocks join back to the approved text exactly', () => {
  for (const l of ['en', 'el']) {
    const blocks = aboutBlocks(l);
    assert.equal(blocks.length, 2); assert.ok(blocks.every((b) => b.title && b.body));
    assert.equal(joinAboutBlocks(l, blocks), ABOUT[l]);
  }
});

test('the texts equal legal-review.md section 4 when that file is reachable', (tt) => {
  const path = process.env.AIOS_LEGAL_REVIEW ?? join(homedir(), 'Εγγραφα', 'ais-os', 'projects', 'trading-journal', 'docs', 'legal-review.md');
  if (!existsSync(path)) return tt.skip('legal-review.md is outside this repo and not reachable here');
  const doc = readFileSync(path, 'utf8');
  const grab = (re) => doc.match(re)?.[1];
  assert.equal(grab(/First run, one sentence \(B1\.5\), EN: "([^\n]*?)"\n/), FIRST_RUN.en);
  assert.equal(grab(/First run, EL: «([^\n]*?)»\n/), FIRST_RUN.el);
  assert.equal(grab(/About page, full, EN: "([^\n]*?)"\n/), ABOUT.en);
  assert.equal(grab(/About page, full, EL: «([^\n]*?)»\n/), ABOUT.el);
});

test('About names the three model hosts of architecture section 6 and how to delete (AC-P10.2)', () => {
  assert.deepEqual(MODEL_HOSTS, ['cdn.jsdelivr.net', 'huggingface.co', 'raw.githubusercontent.com']);
  assert.match(en['about.data.delete'], /Delete everything/); assert.match(el['about.data.delete'], /Διαγραφή όλων/);
  assert.match(en['about.data.local'], /Nothing is sent to the developer/);
});
