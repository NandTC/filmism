'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const film = require('../lib/film');
const md = require('../lib/md');
const { lock, unlock } = require('../lib/lock');
const { tmp, makeFilm } = require('./helpers');

test('md: fields ignore comments, setField edits the live line', () => {
  const t = '# X\n<!--\n- **Status:** fake\n-->\n- **Status:** draft\n';
  assert.equal(md.field(t, 'status'), 'draft');
  assert.match(md.setField(t, 'Status', 'locked'), /- \*\*Status:\*\* locked\n$/);
  assert.match(md.setField(t, 'Status', 'locked'), /fake/); // comment kept
});

test('md: prose collapses whitespace and drops comments', () => {
  assert.equal(md.prose('\n<!-- hint -->\nOne\n  two.\n'), 'One two.');
});

test('new film: creates folders and files from templates', () => {
  const parent = tmp();
  const dir = film.createFilm('My First Film', { idea: 'robots learn anarchy', parent });
  assert.equal(path.basename(dir), 'my-first-film');
  for (const f of ['FILM.md', 'STORY.md', 'BIBLE.md', 'SHOTS.md', 'STATE.md', '.filmism/safety.md', '.filmism/state.json']) {
    assert.ok(fs.existsSync(path.join(dir, f)), f);
  }
  for (const d of ['inbox', 'storyboard', 'style-frames', 'characters', '.filmism/prompts']) {
    assert.ok(fs.statSync(path.join(dir, d)).isDirectory(), d);
  }
  const m = film.load(dir);
  assert.equal(m.film.get('title'), 'My First Film');
  assert.equal(m.film.get('idea'), 'robots learn anarchy');
  assert.equal(m.story.questions.length, 17);
  assert.equal(m.story.questions[0].status, 'answered');
  assert.equal(m.shots.length, 0, 'example shot in the comment is ignored');
  assert.throws(() => film.createFilm('My First Film', { parent }), /already exists/);
});

test('findFilm: cwd, parent, or single child', () => {
  const dir = makeFilm();
  assert.equal(film.findFilm(null, dir), dir);
  assert.equal(film.findFilm(null, path.join(dir, 'inbox')), dir);
  assert.equal(film.findFilm(null, path.dirname(dir)), dir);
});

test('model: shots, characters with looks, bible', () => {
  const m = film.load(makeFilm());
  assert.deepEqual(m.shots.map((s) => s.id), ['01', '02', '03']);
  assert.deepEqual(m.shots[0].characters, [{ slug: 'nina', look: 'school' }]);
  assert.deepEqual(m.shots[1].characters, []);
  const nina = m.characters[0];
  assert.equal(nina.status, 'locked');
  assert.deepEqual(nina.looks.map((l) => l.name), ['school', 'night']);
  assert.match(nina.looks[1].text, /Yellow raincoat/);
  assert.equal(m.bible.status, 'locked');
  assert.deepEqual(m.bible.avoid, ['modern phones', 'neon']);
});

test('lock: refuses empty canon, unlock logs a revision', () => {
  const parent = tmp();
  const dir = film.createFilm('Lock Test', { parent });
  assert.throws(() => lock(dir, 'bible'), /STYLE paragraph is empty/);
  assert.throws(() => lock(dir, 'story'), /Core question 2\. Genre is empty/);
  film.createCharacter(dir, 'Tom');
  assert.throws(() => lock(dir, 'character:tom'), /Canon paragraph is empty/);

  const d2 = makeFilm();
  assert.throws(() => unlock(d2, 'character:nina'), /reason/);
  unlock(d2, 'character:nina', 'new haircut');
  const text = film.read(d2, 'characters/nina/CANON.md');
  assert.match(text, /- \*\*Status:\*\* draft/);
  assert.match(text, /unlocked: new haircut/);
});
