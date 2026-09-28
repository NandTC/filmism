'use strict';
// The film folder: finding it, reading its markdown files, and the parsed model.

const fs = require('fs');
const path = require('path');
const md = require('./md');

const PKG_ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(PKG_ROOT, 'templates');

const FOLDERS = [
  'source', 'style-frames', 'inbox', 'characters', 'locations', 'storyboard',
  'clips', 'sound', 'cuts', 'marketing', '.filmism/prompts',
];

function slugify(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'film';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
}

function readTemplate(rel) {
  return fs.readFileSync(path.join(TEMPLATES, rel), 'utf8');
}

// Trailing-space cleanup for fields left empty by templating ("- **Idea:** " -> "- **Idea:**").
function tidy(text) {
  return text.replace(/^(- \*\*.+?:\*\*) +$/gm, '$1');
}

function isFilm(dir) {
  return fs.existsSync(path.join(dir, 'FILM.md'));
}

// Find the film folder: explicit --film, the cwd or a parent, or the only film below cwd.
function findFilm(explicit, cwd = process.cwd()) {
  if (explicit) {
    const dir = path.resolve(cwd, explicit);
    if (!isFilm(dir)) throw new Error(`No FILM.md in ${dir}`);
    return dir;
  }
  let dir = cwd;
  for (;;) {
    if (isFilm(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const kids = fs.readdirSync(cwd, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isFilm(path.join(cwd, d.name)))
    .map((d) => d.name);
  if (kids.length === 1) return path.join(cwd, kids[0]);
  if (kids.length === 0) throw new Error('No film found here. Run `filmism new <name>` first.');
  throw new Error(`Several films here (${kids.join(', ')}). Pass --film <folder>.`);
}

function read(dir, rel) {
  const p = path.join(dir, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function write(dir, rel, text) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

// ---- create ---------------------------------------------------------------

function createFilm(name, { idea = '', parent = process.cwd() } = {}) {
  const title = String(name).trim();
  const slug = slugify(title);
  const dir = path.join(parent, slug);
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists`);
  const vars = {
    title, idea: idea.trim(), date: today(),
    idea_status: idea.trim() ? 'answered' : 'empty',
    title_status: 'answered',
  };
  for (const f of FOLDERS) fs.mkdirSync(path.join(dir, f), { recursive: true });
  for (const f of ['FILM.md', 'STORY.md', 'BIBLE.md', 'SHOTS.md', 'STATE.md']) {
    write(dir, f, tidy(fill(readTemplate(`film/${f}`), vars)));
  }
  write(dir, '.filmism/safety.md', readTemplate('film/safety.md'));
  write(dir, '.filmism/state.json', JSON.stringify({ version: 1, assets: [] }, null, 2) + '\n');
  return dir;
}

function createCharacter(dir, name) {
  const slug = slugify(name);
  const rel = `characters/${slug}/CANON.md`;
  if (read(dir, rel)) throw new Error(`${rel} already exists`);
  write(dir, rel, tidy(fill(readTemplate('character/CANON.md'), { name: name.trim(), slug })));
  return rel;
}

function createLocation(dir, name) {
  const slug = slugify(name);
  const rel = `locations/${slug}/LOCATION.md`;
  if (read(dir, rel)) throw new Error(`${rel} already exists`);
  write(dir, rel, tidy(fill(readTemplate('location/LOCATION.md'), { name: name.trim(), slug })));
  return rel;
}

// ---- parse ----------------------------------------------------------------

// "maria (night), tom" -> [{slug:'maria', look:'night'}, {slug:'tom', look:null}]
function parseCharacters(value) {
  if (md.isEmpty(value)) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.+?)\s*\(([^)]+)\)$/);
    return m ? { slug: slugify(m[1]), look: m[2].trim() } : { slug: slugify(s), look: null };
  });
}

// "01" | "1" | "Shot 01" -> "01"
function shotId(s) {
  const m = String(s).match(/(\d+)/);
  if (!m) throw new Error(`Bad shot id: ${s}`);
  return m[1].padStart(2, '0');
}

function parseShots(text) {
  if (!text) return [];
  const lines = text.split('\n');
  return md.sections(text)
    .filter((s) => s.level === 3 && /^shot\s+\d+/i.test(s.title))
    .map((s) => {
      const block = lines.slice(s.start + 1, s.end).join('\n');
      const f = md.fields(block);
      const m = s.title.match(/^shot\s+(\d+)\s*(?:[—–-]\s*(.*))?$/i);
      return {
        id: m[1].padStart(2, '0'),
        title: (m[2] || '').trim(),
        heading: s.title,
        fields: f,
        get: (k) => f.get(md.norm(k)) || '',
        characters: parseCharacters(f.get('characters')),
      };
    });
}

function parseCanon(text) {
  const f = md.fields(md.head(text));
  const looksBody = md.sectionBody(text, 'Looks');
  const looks = [];
  if (looksBody != null) {
    const lb = looksBody.split('\n');
    for (const s of md.sections(looksBody).filter((x) => x.level === 3)) {
      const block = lb.slice(s.start + 1, s.end).join('\n');
      looks.push({ name: s.title.trim(), text: md.prose(block), oref: md.field(block, 'Midjourney oref') || '' });
    }
  }
  return {
    name: f.get('name') || '',
    status: (f.get('status') || 'draft').toLowerCase(),
    role: f.get('role') || '',
    elementId: f.get('element id') || '',
    oref: f.get('midjourney oref') || '',
    ow: f.get('midjourney ow') || '',
    canon: md.prose(md.sectionBody(text, 'Canon')),
    looks,
    sheets: md.listItems(md.sectionBody(text, 'Sheets')),
  };
}

function parseLocation(text) {
  const f = md.fields(md.head(text));
  return {
    name: f.get('name') || '',
    status: (f.get('status') || 'draft').toLowerCase(),
    canon: md.prose(md.sectionBody(text, 'Canon')),
    references: md.listItems(md.sectionBody(text, 'References')),
  };
}

function parseBible(text) {
  const f = md.fields(md.head(text));
  return {
    status: (f.get('status') || 'draft').toLowerCase(),
    fields: f,
    style: md.prose(md.sectionBody(text, 'STYLE')),
    avoid: (f.get('avoid') || '').split(',').map((s) => s.trim()).filter(Boolean),
    sref: f.get('midjourney sref') || '',
    mjParams: f.get('midjourney params') || '',
    references: md.listItems(md.sectionBody(text, 'Style references')),
  };
}

function parseStory(text) {
  const f = md.fields(md.head(text));
  const lines = text.split('\n');
  const questions = md.sections(text)
    .filter((s) => s.level === 3 && /^\d+\./.test(s.title))
    .map((s) => {
      const qf = md.fields(lines.slice(s.start + 1, s.end).join('\n'));
      return {
        n: parseInt(s.title, 10),
        title: s.title.replace(/^\d+\.\s*/, ''),
        core: (qf.get('core') || 'no').toLowerCase() === 'yes',
        status: (qf.get('status') || 'empty').toLowerCase(),
        answer: qf.get('answer') || '',
      };
    });
  return {
    mode: f.get('mode') || 'planner',
    coreLocked: (f.get('core locked') || 'no').toLowerCase() === 'yes',
    questions,
  };
}

function parseSafety(text) {
  return { negatives: md.listItems(md.sectionBody(text || '', 'Negatives')) };
}

function listDirs(dir, rel) {
  const p = path.join(dir, rel);
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name).sort();
}

function loadCharacter(dir, slug) {
  const text = read(dir, `characters/${slug}/CANON.md`);
  return text ? { slug, ...parseCanon(text) } : null;
}

function loadLocation(dir, slug) {
  const text = read(dir, `locations/${slug}/LOCATION.md`);
  return text ? { slug, ...parseLocation(text) } : null;
}

function load(dir) {
  const film = md.fields(md.head(read(dir, 'FILM.md') || ''));
  return {
    dir,
    film,
    story: parseStory(read(dir, 'STORY.md') || ''),
    bible: parseBible(read(dir, 'BIBLE.md') || ''),
    shots: parseShots(read(dir, 'SHOTS.md') || ''),
    characters: listDirs(dir, 'characters').map((s) => loadCharacter(dir, s)).filter(Boolean),
    locations: listDirs(dir, 'locations').map((s) => loadLocation(dir, s)).filter(Boolean),
    safety: parseSafety(read(dir, '.filmism/safety.md')),
  };
}

module.exports = {
  PKG_ROOT, TEMPLATES, slugify, today, findFilm, read, write, createFilm, createCharacter,
  createLocation, parseCharacters, parseShots, parseCanon, parseLocation, parseBible, parseStory,
  loadCharacter, loadLocation, load, shotId,
};
