'use strict';
// /film-import: files an image or video made outside Filmism into the film folder.
// Versions every file, never deletes: a replaced asset moves to _retired/.
// Only APPROVED sheets / style frames / location refs are added to the markdown
// reference lists, so only approved images travel with future prompts.

const fs = require('fs');
const path = require('path');
const film = require('./film');
const md = require('./md');
const st = require('./state');

const IMAGE = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const VIDEO = ['.mp4', '.mov', '.webm', '.m4v'];
const STATUSES = ['draft', 'approved'];

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE.includes(ext)) return 'image';
  if (VIDEO.includes(ext)) return 'video';
  throw new Error(`Unsupported file type "${ext}". Images: ${IMAGE.join(' ')}  Videos: ${VIDEO.join(' ')}`);
}

// Where an asset goes. `replaces` = one current file per key (older ones retire);
// otherwise files accumulate (style frames, location refs).
function plan(dir, as, kind, ext, state) {
  const [type, a, b] = String(as).split(':');
  if (type === 'shot') {
    const id = film.shotId(a || '');
    const shots = film.parseShots(film.read(dir, 'SHOTS.md') || '');
    if (!shots.find((s) => s.id === id)) throw new Error(`Shot ${id} not found in SHOTS.md`);
    const key = `shot:${id}:${kind}`;
    const v = st.versions(state, key) + 1;
    const folder = kind === 'video' ? 'clips' : 'storyboard';
    return { type, id, key, replaces: true, version: v, file: `${folder}/shot-${id}_v${v}${ext}` };
  }
  if (type === 'character') {
    if (kind !== 'image') throw new Error('Character sheets must be images');
    const slug = film.slugify(a || '');
    if (!film.read(dir, `characters/${slug}/CANON.md`)) throw new Error(`No characters/${slug}/CANON.md. Run /film-cast ${slug} first.`);
    const look = b ? film.slugify(b) : null;
    const key = `character:${slug}${look ? ':' + look : ''}`;
    const v = st.versions(state, key) + 1;
    return { type, slug, look, key, replaces: true, version: v, file: `characters/${slug}/sheet${look ? '-' + look : ''}_v${v}${ext}` };
  }
  if (type === 'location') {
    const slug = film.slugify(a || '');
    if (!film.read(dir, `locations/${slug}/LOCATION.md`)) throw new Error(`No locations/${slug}/LOCATION.md. Create the location first.`);
    const key = `location:${slug}`;
    const v = st.versions(state, key) + 1;
    return { type, slug, key, replaces: false, version: v, file: `locations/${slug}/ref_${String(v).padStart(2, '0')}${ext}` };
  }
  if (type === 'style') {
    const v = st.versions(state, 'style') + 1;
    return { type, key: 'style', replaces: false, version: v, file: `style-frames/style_${String(v).padStart(2, '0')}${ext}` };
  }
  throw new Error(`Bad --as "${as}". Use shot:<n> | character:<name>[:look] | location:<name> | style`);
}

// Find the ID of the prompt this asset was most likely made from.
function guessPromptId(dir, p, kind, source) {
  let base;
  if (p.type === 'shot') base = `shot-${p.id}.${kind}`;
  else if (p.type === 'character') base = `character-${p.slug}${p.look ? '-' + p.look : ''}.sheet`;
  else return '';
  const want = /midjourney/i.test(source || '') ? ['midjourney', 'generic'] : ['generic', 'midjourney'];
  for (const fmt of want) {
    const text = film.read(dir, `.filmism/prompts/${base}.${fmt}.md`);
    if (text) return md.field(text, 'Prompt ID') || '';
  }
  return '';
}

function editShot(dir, id, fn) {
  const rel = 'SHOTS.md';
  const text = film.read(dir, rel);
  const next = md.editSection(text, (t, level) => {
    const m = t.match(/^shot\s+(\d+)/i);
    return level === 3 && m && m[1].padStart(2, '0') === id;
  }, fn);
  film.write(dir, rel, next);
}

function listRel(p) {
  if (p.type === 'character') return { rel: `characters/${p.slug}/CANON.md`, section: 'Sheets' };
  if (p.type === 'location') return { rel: `locations/${p.slug}/LOCATION.md`, section: 'References' };
  if (p.type === 'style') return { rel: 'BIBLE.md', section: 'Style references' };
  return null;
}

// Reflect an asset's status in the markdown files.
function syncMarkdown(dir, asset, p, { removed } = {}) {
  if (p.type === 'shot') {
    const kind = asset.key.endsWith(':video') ? 'clip' : 'keyframe';
    editShot(dir, p.id, (b) => {
      b = md.setField(b, kind === 'clip' ? 'Clip' : 'Keyframe', asset.file);
      return md.setField(b, 'Status', `${kind} ${asset.status}`);
    });
    return;
  }
  const l = listRel(p);
  let text = film.read(dir, l.rel);
  if (!md.findSection(text, l.section)) return;
  text = md.editSection(text, l.section, (b) => {
    if (removed) b = md.removeListItem(b, removed);
    if (asset.status === 'approved') {
      const note = p.look ? ` — look: ${p.look}` : '';
      b = md.addListItem(b, asset.file + note);
    }
    return b;
  });
  film.write(dir, l.rel, text);
}

function parseAssetKey(key) {
  const [type, a, b] = key.split(':');
  if (type === 'shot') return { type, id: a };
  if (type === 'character') return { type, slug: a, look: b || null };
  if (type === 'location') return { type, slug: a };
  return { type };
}

function importAsset(dir, src, opts = {}) {
  const { as, source = 'external', status = 'draft', note = '', prompt } = opts;
  if (!as) throw new Error('Say what the file is with --as (shot:<n> | character:<name>[:look] | location:<name> | style)');
  if (!STATUSES.includes(status)) throw new Error(`--status must be ${STATUSES.join(' or ')}`);
  if (!fs.existsSync(path.resolve(src)) || !fs.statSync(path.resolve(src)).isFile()) throw new Error(`File not found: ${src}`);
  const abs = fs.realpathSync(path.resolve(src));
  const kind = kindOf(abs);
  const ext = path.extname(abs).toLowerCase();

  const state = st.load(dir);
  const p = plan(dir, as, kind, ext, state);
  const dest = path.join(dir, p.file);
  if (fs.existsSync(dest)) throw new Error(`${p.file} already exists — state.json and the folder disagree`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  // Retire the current asset for this key.
  let retired = null;
  if (p.replaces) {
    const cur = st.current(state, p.key);
    if (cur) {
      const rdir = path.join(path.dirname(path.join(dir, cur.file)), '_retired');
      fs.mkdirSync(rdir, { recursive: true });
      const rfile = path.relative(dir, path.join(rdir, path.basename(cur.file))).split(path.sep).join('/');
      if (fs.existsSync(path.join(dir, cur.file))) fs.renameSync(path.join(dir, cur.file), path.join(dir, rfile));
      retired = { id: cur.id, from: cur.file, to: rfile };
      cur.status = 'retired';
      cur.file = rfile;
    }
  }

  // Inbox files move (inbox empties); files from elsewhere are copied (user's originals stay).
  const inbox = fs.realpathSync(path.join(dir, 'inbox')) + path.sep;
  const moved = abs.startsWith(inbox);
  if (moved) fs.renameSync(abs, dest);
  else fs.copyFileSync(abs, dest);

  const asset = {
    id: st.nextId(state),
    key: p.key,
    kind,
    file: p.file,
    version: p.version,
    status,
    source,
    original: path.basename(abs),
    prompt_id: prompt || guessPromptId(dir, p, kind, source),
    notes: note,
    imported: film.today(),
  };
  if (retired) state.assets.find((a) => a.id === retired.id).retired_by = asset.id;
  state.assets.push(asset);
  st.save(dir, state);
  syncMarkdown(dir, asset, p, { removed: retired && retired.from });
  return { asset, retired, moved };
}

// Approve an asset by id, file path, or key (key = its current asset).
function approve(dir, ref) {
  const state = st.load(dir);
  const asset = state.assets.find((a) => a.id === ref || a.file === ref) ||
    st.current(state, ref) || st.current(state, `${ref}:image`);
  if (!asset) throw new Error(`No asset "${ref}". Use an id (a0001), a file path, or a key like shot:01`);
  if (asset.status === 'retired') throw new Error(`${asset.file} is retired`);
  asset.status = 'approved';
  st.save(dir, state);
  syncMarkdown(dir, asset, parseAssetKey(asset.key));
  return asset;
}

function inbox(dir) {
  const p = path.join(dir, 'inbox');
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p).filter((f) => !f.startsWith('.') && fs.statSync(path.join(p, f)).isFile()).sort()
    .map((f) => `inbox/${f}`);
}

module.exports = { importAsset, approve, inbox, kindOf };
