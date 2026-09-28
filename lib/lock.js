'use strict';
// Locking canon: story core, bible, characters, locations.
// Locked text is what the compiler injects word for word. Unlocking is logged.

const film = require('./film');
const md = require('./md');

function target(what) {
  const [kind, name] = String(what).split(':');
  switch (kind) {
    case 'story': return { kind, rel: 'STORY.md' };
    case 'bible': return { kind, rel: 'BIBLE.md' };
    case 'character': return { kind, rel: `characters/${film.slugify(name || '')}/CANON.md`, name };
    case 'location': return { kind, rel: `locations/${film.slugify(name || '')}/LOCATION.md`, name };
    default: throw new Error(`Cannot lock "${what}". Use story | bible | character:<name> | location:<name>`);
  }
}

// Returns a list of problems that prevent locking (empty = OK).
function problems(kind, text) {
  if (kind === 'story') {
    const s = film.parseStory(text);
    return s.questions.filter((q) => q.core && q.status !== 'answered')
      .map((q) => `Core question ${q.n}. ${q.title} is ${q.status}`);
  }
  if (kind === 'bible') {
    return film.parseBible(text).style ? [] : ['The STYLE paragraph is empty'];
  }
  if (kind === 'character') {
    return film.parseCanon(text).canon ? [] : ['The Canon paragraph is empty'];
  }
  if (kind === 'location') {
    return film.parseLocation(text).canon ? [] : ['The Canon paragraph is empty'];
  }
  return [];
}

function lock(dir, what) {
  const t = target(what);
  const text = film.read(dir, t.rel);
  if (!text) throw new Error(`${t.rel} not found`);
  const issues = problems(t.kind, text);
  if (issues.length) throw new Error(`Cannot lock ${what}:\n- ${issues.join('\n- ')}`);
  const next = t.kind === 'story' ? md.setField(text, 'Core locked', 'yes') : md.setField(text, 'Status', 'locked');
  film.write(dir, t.rel, next);
  return t.rel;
}

function unlock(dir, what, reason) {
  if (!reason) throw new Error('Unlocking changes canon. Give a reason with --reason "..."');
  const t = target(what);
  let text = film.read(dir, t.rel);
  if (!text) throw new Error(`${t.rel} not found`);
  text = t.kind === 'story' ? md.setField(text, 'Core locked', 'no') : md.setField(text, 'Status', 'draft');
  if (md.findSection(text, 'Revisions')) {
    text = md.editSection(text, 'Revisions', (b) => md.addListItem(b, `${film.today()} — unlocked: ${reason}`));
  }
  film.write(dir, t.rel, text);
  return t.rel;
}

module.exports = { lock, unlock, target, problems };
