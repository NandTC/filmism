'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const film = require('../lib/film');
const st = require('../lib/state');
const { compile } = require('../lib/compile');
const { importAsset, approve, inbox } = require('../lib/importer');
const { makeFilm, tmp } = require('./helpers');

function fakeImage(dir, name, content = 'png-bytes') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

test('import from inbox: moves the file, links it to the shot, records it', () => {
  const dir = makeFilm();
  const pr = compile(dir, 'shot:01', { format: 'midjourney' });
  const src = fakeImage(path.join(dir, 'inbox'), 'grid_0_abc.png');
  assert.deepEqual(inbox(dir), ['inbox/grid_0_abc.png']);

  const r = importAsset(dir, src, { as: 'shot:1', source: 'midjourney', note: 'top-left of the grid' });
  assert.equal(r.moved, true);
  assert.equal(r.asset.file, 'storyboard/shot-01_v1.png');
  assert.ok(fs.existsSync(path.join(dir, 'storyboard/shot-01_v1.png')));
  assert.equal(fs.existsSync(src), false, 'inbox emptied');
  assert.deepEqual(inbox(dir), []);

  const a = st.load(dir).assets[0];
  assert.equal(a.key, 'shot:01:image');
  assert.equal(a.source, 'midjourney');
  assert.equal(a.original, 'grid_0_abc.png');
  assert.equal(a.status, 'draft');
  assert.equal(a.notes, 'top-left of the grid');
  assert.equal(a.prompt_id, pr.id, 'linked to the prompt it was made from');

  const shot = film.load(dir).shots[0];
  assert.equal(shot.get('keyframe'), 'storyboard/shot-01_v1.png');
  assert.equal(shot.get('status'), 'keyframe draft');
});

test('import from an explicit path copies (original untouched)', () => {
  const dir = makeFilm();
  const src = fakeImage(tmp(), 'mine.jpg');
  const r = importAsset(dir, src, { as: 'shot:02', status: 'approved' });
  assert.equal(r.moved, false);
  assert.ok(fs.existsSync(src));
  assert.equal(film.load(dir).shots[1].get('status'), 'keyframe approved');
});

test('replacing an asset moves the previous version to _retired/', () => {
  const dir = makeFilm();
  importAsset(dir, fakeImage(tmp(), 'v1.png', 'one'), { as: 'shot:01' });
  const r = importAsset(dir, fakeImage(tmp(), 'v2.png', 'two'), { as: 'shot:01' });
  assert.equal(r.asset.file, 'storyboard/shot-01_v2.png');
  assert.deepEqual(r.retired, { id: 'a0001', from: 'storyboard/shot-01_v1.png', to: 'storyboard/_retired/shot-01_v1.png' });
  assert.equal(fs.readFileSync(path.join(dir, 'storyboard/_retired/shot-01_v1.png'), 'utf8'), 'one');
  assert.equal(fs.existsSync(path.join(dir, 'storyboard/shot-01_v1.png')), false);

  const [old, cur] = st.load(dir).assets;
  assert.equal(old.status, 'retired');
  assert.equal(old.retired_by, 'a0002');
  assert.equal(cur.version, 2);
  assert.equal(film.load(dir).shots[0].get('keyframe'), 'storyboard/shot-01_v2.png');
});

test('character sheet: approved sheets join CANON and travel with prompts', () => {
  const dir = makeFilm();
  importAsset(dir, fakeImage(tmp(), 's.png'), { as: 'character:nina:night' });
  assert.deepEqual(film.loadCharacter(dir, 'nina').sheets, [], 'draft sheets are not references yet');
  approve(dir, 'character:nina:night');
  assert.deepEqual(film.loadCharacter(dir, 'nina').sheets, ['characters/nina/sheet-night_v1.png — look: night']);
  // Replace it: the old line leaves, the new approved one joins.
  importAsset(dir, fakeImage(tmp(), 's2.png'), { as: 'character:nina:night', status: 'approved' });
  assert.deepEqual(film.loadCharacter(dir, 'nina').sheets, ['characters/nina/sheet-night_v2.png — look: night']);
  assert.ok(fs.existsSync(path.join(dir, 'characters/nina/_retired/sheet-night_v1.png')));
  assert.ok(compile(dir, 'shot:03').attach.some((a) => a.path === 'characters/nina/sheet-night_v2.png'));
});

test('style frames and videos', () => {
  const dir = makeFilm();
  importAsset(dir, fakeImage(tmp(), 'a.png'), { as: 'style', status: 'approved' });
  importAsset(dir, fakeImage(tmp(), 'b.png'), { as: 'style', status: 'approved' });
  assert.deepEqual(film.load(dir).bible.references, ['style-frames/style_01.png', 'style-frames/style_02.png']);

  importAsset(dir, fakeImage(tmp(), 'k.png'), { as: 'shot:01', status: 'approved' });
  const vr = compile(dir, 'shot:01', { kind: 'video' });
  assert.equal(vr.attach[0].path, 'storyboard/shot-01_v1.png');
  assert.equal(vr.attach[0].why, 'START FRAME');
  const c = importAsset(dir, fakeImage(tmp(), 'clip.mp4'), { as: 'shot:01' });
  assert.equal(c.asset.file, 'clips/shot-01_v1.mp4');
  assert.equal(film.load(dir).shots[0].get('status'), 'clip draft');
});

test('import errors are clear', () => {
  const dir = makeFilm();
  const f = fakeImage(tmp(), 'x.png');
  assert.throws(() => importAsset(dir, f, {}), /--as/);
  assert.throws(() => importAsset(dir, f, { as: 'shot:09' }), /Shot 09 not found/);
  assert.throws(() => importAsset(dir, f, { as: 'character:tom' }), /Run \/film-cast tom/);
  assert.throws(() => importAsset(dir, fakeImage(tmp(), 'x.txt'), { as: 'style' }), /Unsupported file type/);
  assert.throws(() => importAsset(dir, '/nope.png', { as: 'style' }), /File not found/);
});
