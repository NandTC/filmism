'use strict';
// End to end: a clean folder, the installed CLI, a one-line idea, and the full MVP loop.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const md = require('../lib/md');
const { tmp, answer } = require('./helpers');

const SRC_CLI = path.join(__dirname, '..', 'bin', 'filmism.js');

function run(cwd, cli, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function edit(file, fn) {
  fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8')));
}

test('install --local copies commands and runtime', () => {
  const project = tmp();
  const r = run(project, SRC_CLI, 'install', '--local');
  assert.equal(r.code, 0, r.err);
  const cmds = fs.readdirSync(path.join(project, '.claude/commands')).sort();
  assert.deepEqual(cmds, ['film-bible.md', 'film-cast.md', 'film-develop.md', 'film-import.md',
    'film-new.md', 'film-prompt.md', 'film-shots.md', 'film-status.md']);
  const text = fs.readFileSync(path.join(project, '.claude/commands/film-new.md'), 'utf8');
  assert.doesNotMatch(text, /\{\{FILMISM\}\}/);
  assert.match(text, /node \.claude\/filmism\/bin\/filmism\.js new/);
  assert.ok(fs.existsSync(path.join(project, '.claude/filmism/templates/film/STORY.md')));
});

test('full MVP workflow from a one-line idea, using the installed CLI', () => {
  const project = tmp();
  assert.equal(run(project, SRC_CLI, 'install', '--local').code, 0);
  const cli = path.join(project, '.claude/filmism/bin/filmism.js');
  const ok = (...a) => { const r = run(project, cli, ...a); assert.equal(r.code, 0, `${a.join(' ')}\n${r.err}`); return r.out; };

  // 1. /film-new
  ok('new', 'Paper Moon', '--idea', 'A paper boy folds a moon to light his street');
  const film = path.join(project, 'paper-moon');
  for (const f of ['FILM.md', 'STORY.md', 'BIBLE.md', 'SHOTS.md', 'STATE.md']) assert.ok(fs.existsSync(path.join(film, f)), f);

  // 2. /film-develop (Claude writes answers into the markdown)
  edit(path.join(film, 'FILM.md'), (t) => md.setField(md.setField(md.setField(t,
    'Logline', 'A boy made of paper folds a moon to light his dark street.'), 'Tone', 'tender, magical'), 'Runtime', '30 s'));
  edit(path.join(film, 'STORY.md'), (t) => answer(answer(answer(answer(t,
    2, 'fable, stop-motion feel'), 3, 'one night, timeless'), 4, 'a paper city'), 5, 'Pim, a paper boy'));
  assert.match(ok('status'), /Next:\*\* \/film-develop — Lock the story core/);
  ok('lock', 'story');

  // 3. /film-bible
  edit(path.join(film, 'BIBLE.md'), (t) => md.editSection(t, 'STYLE', () =>
    '\nStop-motion paper craft, visible paper fibres, warm tungsten light, deep blue night, macro lens, shallow focus.\n'));
  ok('lock', 'bible');

  // 4. /film-cast pim
  ok('character', 'Pim');
  edit(path.join(film, 'characters/pim/CANON.md'), (t) => md.editSection(t, 'Canon', () =>
    '\nSmall boy folded from cream newspaper, round head, ink-dot eyes, torn left ear.\n'));
  const sheet = ok('compile', 'character:pim', '--format', 'midjourney');
  assert.match(sheet, /Character reference sheet of Pim/);
  fs.writeFileSync(path.join(film, 'inbox', 'pim_sheet.png'), 'sheet');
  ok('import', 'inbox/pim_sheet.png', '--as', 'character:pim', '--status', 'approved', '--source', 'midjourney');
  ok('lock', 'character:pim');

  // 5. /film-shots — three shots
  edit(path.join(film, 'SHOTS.md'), (t) => t + ['01 — Dark Street', '02 — Folding', '03 — Moonrise'].map((h, i) => `
### Shot ${h}
- **Beat:** beat ${i + 1}
- **Characters:** ${i === 2 ? '—' : 'pim'}
- **Location:** paper street at night
- **Framing:** wide
- **Camera:** static
- **Length:** 5 s
- **Action:** action ${i + 1}
- **Dialogue:** —
- **Sound:** wind
- **Device:** —
- **Keyframe:**
- **Clip:**
- **Status:** planned
`).join(''));
  assert.match(ok('status'), /Next:\*\* \/film-prompt 01/);

  // 6. compile-prompt — deterministic, saved, with the approved sheet attached
  const p1 = ok('compile', 'shot:01');
  assert.match(p1, /Pim: Small boy folded from cream newspaper/);
  assert.match(p1, /Style: Stop-motion paper craft/);
  assert.match(p1, /characters\/pim\/sheet_v1\.png — pim character sheet/);
  const saved = path.join(film, '.filmism/prompts/shot-01.image.generic.md');
  const first = fs.readFileSync(saved, 'utf8');
  assert.match(ok('compile', 'shot:01'), /\(unchanged\)/);
  assert.equal(fs.readFileSync(saved, 'utf8'), first);

  // 7. /film-import a keyframe, then replace it
  const outside = path.join(tmp(), 'mj_render.png');
  fs.writeFileSync(outside, 'v1');
  ok('import', outside, '--as', 'shot:01', '--source', 'midjourney');
  fs.writeFileSync(path.join(film, 'inbox', 'better.png'), 'v2');
  const imp = ok('import', 'inbox/better.png', '--as', 'shot:01', '--status', 'approved', '--source', 'midjourney');
  assert.match(imp, /Previous version kept in .*storyboard\/_retired\/shot-01_v1\.png/);
  assert.ok(fs.existsSync(outside), 'original outside file untouched');

  // 8. /film-status
  const st = ok('status');
  assert.match(st, /Stage:\*\* Pre-production/);
  assert.match(st, /1\/3 keyframes approved/);
  assert.match(st, /Next:\*\* \/film-prompt 02/);
  assert.match(st, /retired 1/);
  const json = JSON.parse(ok('status', '--json'));
  assert.equal(json.stage, 'Pre-production');
  assert.equal(json.shots.length, 3);
});

test('CLI reports errors cleanly with exit code 1', () => {
  const project = tmp();
  const r = run(project, SRC_CLI, 'status');
  assert.equal(r.code, 1);
  assert.match(r.err, /^filmism: No film found here/);
});
