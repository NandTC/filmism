'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const film = require('../lib/film');
const { status } = require('../lib/status');
const { lock } = require('../lib/lock');
const { importAsset, approve } = require('../lib/importer');
const { makeFilm, tmp } = require('./helpers');

function img(name = 'x.png') {
  const p = path.join(tmp(), name);
  fs.writeFileSync(p, 'x');
  return p;
}

test('fresh film: Develop stage, next is /film-develop', () => {
  const dir = film.createFilm('Fresh', { idea: 'a lighthouse keeper', parent: tmp() });
  const r = status(dir);
  assert.equal(r.stage, 'Develop');
  assert.equal(r.next.command, '/film-develop');
  assert.match(r.gates[0].detail, /Logline, Tone, Runtime/);
  assert.match(fs.readFileSync(path.join(dir, 'STATE.md'), 'utf8'), /- \*\*Stage:\*\* Develop/);
});

test('walks the gates as the film progresses', () => {
  const dir = makeFilm({ locked: false });
  lock(dir, 'story');
  let r = status(dir);
  assert.equal(r.stage, 'Pre-production');
  assert.equal(r.next.command, '/film-bible');

  lock(dir, 'bible');
  r = status(dir);
  assert.equal(r.next.command, '/film-cast nina');
  assert.match(r.gates[3].detail, /not locked: nina/);

  lock(dir, 'character:nina');
  r = status(dir);
  assert.equal(r.next.command, '/film-prompt 01');

  importAsset(dir, img(), { as: 'shot:01' });
  r = status(dir);
  assert.equal(r.next.command, '/film-import');
  assert.match(r.next.why, /approve the keyframe of shot 01/);

  approve(dir, 'shot:01');
  importAsset(dir, img(), { as: 'shot:02', status: 'approved' });
  importAsset(dir, img(), { as: 'shot:03', status: 'approved' });
  r = status(dir);
  assert.equal(r.stage, 'Shoot');
  assert.equal(r.next.command, '/film-prompt 01 --kind video');
  assert.match(r.text, /✅ \| Storyboard approved/);
  assert.match(r.text, /\| 01 \| Wake \| nina \(school\) \| keyframe approved \| storyboard\/shot-01_v1\.png/);
});

test('inbox files and missing characters are reported', () => {
  const dir = makeFilm();
  fs.writeFileSync(path.join(dir, 'inbox', 'new.png'), 'x');
  const r = status(dir);
  assert.equal(r.next.command, '/film-import');
  assert.match(r.next.why, /1 file\(s\) waiting/);

  const d2 = makeFilm();
  const t = film.read(d2, 'SHOTS.md').replace('- **Characters:** —', '- **Characters:** tom');
  film.write(d2, 'SHOTS.md', t);
  const r2 = status(d2);
  assert.match(r2.blockers[0], /Shot 02 uses "tom"/);
  assert.equal(r2.next.command, '/film-cast tom');
});
