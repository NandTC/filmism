'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const film = require('../lib/film');
const md = require('../lib/md');
const { compile } = require('../lib/compile');
const { makeFilm, edit } = require('./helpers');

test('compile shot image: all layers present, canon verbatim, saved', () => {
  const dir = makeFilm();
  const r = compile(dir, 'shot:1');
  assert.equal(r.status, 'new');
  assert.equal(r.rel, '.filmism/prompts/shot-01.image.generic.md');
  assert.ok(fs.existsSync(path.join(dir, r.rel)));
  const p = r.prompt;
  assert.match(p, /^Medium close-up\. Nina wakes in the empty classroom\. She lifts her head/); // [1] shot
  assert.match(p, /Nina: Twelve-year-old girl, thin, short black bob haircut/); // [2] canon verbatim
  assert.match(p, /Wearing: Navy school uniform, white collar, red scarf\./); // look
  assert.match(p, /Setting: Old classroom, wooden desks in rows/); // [3] location canon
  assert.match(p, /Style: Shot on 35mm Kodak Vision3 500T/); // [4] style verbatim
  assert.match(p, /Avoid: text, captions, watermark.*; modern phones; neon\./); // [6] safety + bible avoid
  assert.doesNotMatch(p, /Yellow raincoat/, 'only the requested look');
});

test('compile is deterministic: same files -> same prompt, file unchanged', () => {
  const dir = makeFilm();
  const a = compile(dir, 'shot:01');
  const before = fs.readFileSync(path.join(dir, a.rel), 'utf8');
  const b = compile(dir, 'shot:01');
  assert.equal(b.status, 'unchanged');
  assert.equal(a.id, b.id);
  assert.equal(fs.readFileSync(path.join(dir, a.rel), 'utf8'), before);
  // A second film built from the same content gives the identical prompt.
  assert.equal(compile(makeFilm(), 'shot:01').text, a.text);
});

test('changing canon retires the old prompt, never deletes it', () => {
  const dir = makeFilm();
  const a = compile(dir, 'shot:01');
  edit(dir, 'characters/nina/CANON.md', (t) =>
    md.editSection(t, 'Canon', () => '\nTwelve-year-old girl with long red braids.\n'));
  const b = compile(dir, 'shot:01');
  assert.equal(b.status, 'updated');
  assert.notEqual(a.id, b.id);
  assert.equal(b.retired, '.filmism/prompts/_retired/shot-01.image.generic_v1.md');
  assert.match(fs.readFileSync(path.join(dir, b.retired), 'utf8'), /short black bob/);
  assert.match(b.prompt, /long red braids/);
});

test('shot without characters and with a plain-text location', () => {
  const dir = makeFilm();
  const p2 = compile(dir, 'shot:02').prompt;
  assert.doesNotMatch(p2, /Nina:/);
  const p3 = compile(dir, 'shot:03').prompt;
  assert.match(p3, /Setting: school gate at night\./);
  assert.match(p3, /Yellow raincoat/);
});

test('midjourney format: one line with flags', () => {
  const dir = makeFilm();
  edit(dir, 'BIBLE.md', (t) => md.setField(md.setField(t, 'Status', 'draft'), 'Midjourney sref', '1234567'));
  const r = compile(dir, 'shot:01', { format: 'midjourney', draft: true });
  assert.ok(!r.prompt.includes('\n'));
  assert.match(r.prompt, / --ar 16:9 --sref 1234567 --no text, captions, watermark, logo, signature, .*modern phones, neon --style raw$/);
  assert.equal(r.rel, '.filmism/prompts/shot-01.image.midjourney.md');
});

test('locks are enforced unless --draft', () => {
  const dir = makeFilm({ locked: false });
  assert.throws(() => compile(dir, 'shot:01'), /Not locked yet:[\s\S]*BIBLE\.md[\s\S]*characters\/nina/);
  const r = compile(dir, 'shot:01', { draft: true });
  assert.ok(r.draft);
  assert.match(r.text, /- \*\*Draft:\*\* yes/);
});

test('character sheet: allowed before the character is locked', () => {
  const dir = makeFilm({ locked: false });
  require('../lib/lock').lock(dir, 'bible');
  const r = compile(dir, 'character:nina:night');
  assert.equal(r.rel, '.filmism/prompts/character-nina-night.sheet.generic.md');
  assert.match(r.prompt, /^Character reference sheet of Nina/);
  assert.match(r.prompt, /Yellow raincoat/);
});

test('clear errors: unknown shot, missing canon, unknown look, video without keyframe', () => {
  const dir = makeFilm();
  assert.throws(() => compile(dir, 'shot:09'), /Shot 09 not found/);
  edit(dir, 'SHOTS.md', (t) => t.replace('nina (school)', 'tom'));
  assert.throws(() => compile(dir, 'shot:01'), /characters\/tom\/CANON\.md does not exist/);
  assert.throws(() => compile(dir, 'character:nina:party'), /no look "party"/);
  assert.throws(() => compile(dir, 'shot:03', { kind: 'video' }), /no keyframe yet/);
});

test('attachments: style refs and character sheets travel with the prompt', () => {
  const dir = makeFilm();
  edit(dir, 'BIBLE.md', (t) => md.editSection(t, 'Style references', (b) => md.addListItem(b, 'style-frames/look_01.png')));
  edit(dir, 'characters/nina/CANON.md', (t) => md.editSection(t, 'Sheets', (b) => md.addListItem(b, 'characters/nina/sheet_v1.png')));
  const r = compile(dir, 'shot:01');
  assert.deepEqual(r.attach.map((a) => a.path), ['style-frames/look_01.png', 'characters/nina/sheet_v1.png']);
  assert.match(r.text, /## Attach\n\n- style-frames\/look_01\.png — style reference/);
  void film;
});

test('midjourney oref: manual "Element" from CANON, look can override', () => {
  const dir = makeFilm();
  edit(dir, 'characters/nina/CANON.md', (t) => {
    t = md.setField(t, 'Midjourney oref', 'https://cdn.midjourney.com/nina-sheet.png');
    t = md.setField(t, 'Midjourney ow', '120');
    return md.editSection(t, 'night', (b) => b + '- **Midjourney oref:** https://cdn.midjourney.com/nina-night.png\n');
  });
  const p1 = compile(dir, 'shot:01', { format: 'midjourney' }).prompt;
  assert.match(p1, / --ar 16:9 --oref https:\/\/cdn\.midjourney\.com\/nina-sheet\.png --ow 120 --no /);
  const p3 = compile(dir, 'shot:03', { format: 'midjourney' }).prompt;
  assert.match(p3, /--oref https:\/\/cdn\.midjourney\.com\/nina-night\.png --ow 120/);
  assert.doesNotMatch(p3, /http.*http/, 'the URL never leaks into the look text');
  assert.doesNotMatch(compile(dir, 'shot:02', { format: 'midjourney' }).prompt, /--oref/, 'no character, no oref');
  assert.doesNotMatch(compile(dir, 'shot:01').prompt, /--oref/, 'generic format has no flags');
});
