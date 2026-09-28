'use strict';
// The prompt compiler. Builds a generation prompt from the film's markdown files.
// Deterministic: the same files always give the same prompt (no dates, no randomness).
//
// Layers: [1] SHOT  [2] CHARACTERS  [3] LOCATION  [4] STYLE  [5] SOUND (video)
//         [6] SAFETY  [7] PROVIDER format  + ATTACH (reference images)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const film = require('./film');
const md = require('./md');

const FORMATS = ['generic', 'midjourney'];
const KINDS = ['image', 'video', 'sheet'];

function sentence(s) {
  const t = String(s || '').trim();
  if (!t || md.isEmpty(t)) return '';
  const c = t[0].toUpperCase() + t.slice(1);
  return /[.!?"”…]$/.test(c) ? c : c + '.';
}

function joinSentences(parts) {
  return parts.map(sentence).filter(Boolean).join(' ');
}

// "style-frames/a.png — note" -> "style-frames/a.png"
function refPath(item) {
  return item.split(/\s+[—–-]\s+/)[0].trim();
}

function parseTarget(t) {
  const [kind, a, b] = String(t).split(':');
  if (kind === 'shot' && a) return { type: 'shot', id: film.shotId(a) };
  if (kind === 'character' && a) return { type: 'character', slug: film.slugify(a), look: b || null };
  throw new Error(`Bad target "${t}". Use shot:<n> or character:<name>[:look]`);
}

function pickLook(ch, look) {
  if (!ch.looks.length) {
    if (look) throw new Error(`${ch.slug} has no looks (asked for "${look}")`);
    return null;
  }
  if (!look) return ch.looks[0];
  const found = ch.looks.find((l) => md.norm(l.name) === md.norm(look));
  if (!found) throw new Error(`${ch.slug} has no look "${look}". Looks: ${ch.looks.map((l) => l.name).join(', ')}`);
  return found;
}

function characterText(ch, look) {
  const who = ch.name || ch.slug;
  const wear = look && look.text ? `Wearing: ${look.text}` : '';
  return joinSentences([`${who}: ${ch.canon}`, wear]);
}

function negatives(m) {
  return [...m.safety.negatives, ...m.bible.avoid];
}

// Collect everything the prompt needs, and the list of things not yet locked.
function gather(dir, target, kind, draft) {
  const m = film.load(dir);
  const unlocked = [];
  const sources = [];
  const attach = [];

  if (m.bible.status !== 'locked') unlocked.push('BIBLE.md');
  if (!m.bible.style) throw new Error('BIBLE.md has no STYLE paragraph yet. Run /film-bible first.');
  for (const r of m.bible.references) attach.push({ path: refPath(r), why: 'style reference' });

  const t = parseTarget(target);
  const out = { m, t, unlocked, sources, attach, chars: [], shot: null, location: null };

  if (t.type === 'character') {
    if (kind !== 'sheet') throw new Error('Characters compile to --kind sheet');
    const ch = film.loadCharacter(dir, t.slug);
    if (!ch) throw new Error(`No characters/${t.slug}/CANON.md. Run /film-cast ${t.slug} first.`);
    if (!ch.canon) throw new Error(`characters/${t.slug}/CANON.md has an empty Canon paragraph`);
    const look = pickLook(ch, t.look);
    out.chars.push({ ch, look });
    sources.push(`characters/${t.slug}/CANON.md${look ? ` (look: ${look.name})` : ''}`);
    // A sheet is made before the character is locked, so only the bible must be locked.
  } else {
    if (kind === 'sheet') throw new Error('Shots compile to --kind image or video');
    const shot = m.shots.find((s) => s.id === t.id);
    if (!shot) throw new Error(`Shot ${t.id} not found in SHOTS.md`);
    out.shot = shot;
    sources.push(`SHOTS.md (Shot ${shot.id})`);
    for (const c of shot.characters) {
      const ch = m.characters.find((x) => x.slug === c.slug);
      if (!ch) throw new Error(`Shot ${shot.id} uses "${c.slug}" but characters/${c.slug}/CANON.md does not exist. Run /film-cast ${c.slug}.`);
      if (!ch.canon) throw new Error(`characters/${c.slug}/CANON.md has an empty Canon paragraph`);
      if (ch.status !== 'locked') unlocked.push(`characters/${c.slug}/CANON.md`);
      const look = pickLook(ch, c.look);
      out.chars.push({ ch, look });
      sources.push(`characters/${c.slug}/CANON.md${look ? ` (look: ${look.name})` : ''}`);
      for (const s of ch.sheets) attach.push({ path: refPath(s), why: `${ch.slug} character sheet` });
    }
    const locName = shot.get('location');
    if (!md.isEmpty(locName)) {
      const loc = film.loadLocation(dir, film.slugify(locName));
      if (loc) {
        if (loc.status !== 'locked') unlocked.push(`locations/${loc.slug}/LOCATION.md`);
        out.location = { name: loc.name || locName, text: loc.canon || locName };
        sources.push(`locations/${loc.slug}/LOCATION.md`);
        for (const r of loc.references) attach.push({ path: refPath(r), why: `${loc.slug} location reference` });
      } else {
        out.location = { name: locName, text: locName };
      }
    }
    if (kind === 'video') {
      const key = shot.get('keyframe');
      const status = shot.get('status').toLowerCase();
      if (md.isEmpty(key)) throw new Error(`Shot ${shot.id} has no keyframe yet. Import one with /film-import first.`);
      if (!/keyframe approved|clip/.test(status)) unlocked.push(`Shot ${shot.id} keyframe (not approved)`);
      attach.unshift({ path: key, why: 'START FRAME' });
    }
  }
  sources.push('BIBLE.md', '.filmism/safety.md');

  if (unlocked.length && !draft) {
    throw new Error(`Not locked yet:\n- ${unlocked.join('\n- ')}\nLock them first, or pass --draft for a test prompt.`);
  }
  return out;
}

// ---- layer builders ---------------------------------------------------------

function shotImageLayers(g) {
  const s = g.shot;
  return [
    joinSentences([s.get('framing'), s.get('beat'), s.get('action')]),
    ...g.chars.map(({ ch, look }) => characterText(ch, look)),
    g.location ? sentence(`Setting: ${g.location.text}`) : '',
  ].filter(Boolean);
}

function shotVideoLayers(g) {
  const s = g.shot;
  const names = g.chars.map(({ ch }) => ch.name || ch.slug);
  const dialogue = s.get('dialogue');
  return [
    'Animate the attached start frame.',
    joinSentences([s.get('camera') && `Camera: ${s.get('camera')}`, s.get('action')]),
    names.length ? sentence(`Keep ${names.join(' and ')} exactly as in the start frame`) : '',
    ...g.chars.map(({ ch, look }) => characterText(ch, look)),
    md.isEmpty(s.get('sound')) ? '' : sentence(`Sound: ${s.get('sound')}`),
    md.isEmpty(dialogue) ? '' : `Dialogue: ${dialogue}`,
    md.isEmpty(s.get('length')) ? '' : sentence(`Length: ${s.get('length')}`),
  ].filter(Boolean);
}

function sheetLayers(g) {
  const { ch, look } = g.chars[0];
  const who = ch.name || ch.slug;
  return [
    `Character reference sheet of ${who}, one character only: front view, three-quarter view, side view and back view, full body, neutral pose, plain light-grey background, even lighting.`,
    characterText(ch, look),
  ];
}

function render(g, kind, format) {
  const body = kind === 'video' ? shotVideoLayers(g) : kind === 'sheet' ? sheetLayers(g) : shotImageLayers(g);
  const style = sentence(g.m.bible.style);
  const neg = negatives(g.m);

  if (format === 'midjourney') {
    if (kind === 'video') throw new Error('Video prompts use --format generic');
    const ar = g.m.film.get('aspect ratio') || '16:9';
    const flags = [`--ar ${ar}`];
    // Manual "Element": the first character with an oref URL (a look can override it).
    // One --oref per prompt; other characters rely on their canon text and attached sheets.
    const ref = g.chars.map(({ ch, look }) => ({ ch, url: (look && look.oref) || ch.oref })).find((x) => x.url);
    if (ref) {
      flags.push(`--oref ${ref.url}`);
      if (ref.ch.ow) flags.push(`--ow ${ref.ch.ow}`);
    }
    if (g.m.bible.sref) flags.push(`--sref ${g.m.bible.sref}`);
    if (neg.length) flags.push(`--no ${neg.join(', ')}`);
    if (g.m.bible.mjParams) flags.push(g.m.bible.mjParams);
    return [...body, style].join(' ') + ' ' + flags.join(' ');
  }
  const lines = [...body, `Style: ${style}`];
  if (neg.length) lines.push(`Avoid: ${neg.join('; ')}.`);
  return lines.join('\n');
}

function baseName(t, kind, format) {
  const who = t.type === 'shot' ? `shot-${t.id}` : `character-${t.slug}${t.look ? '-' + film.slugify(t.look) : ''}`;
  return `${who}.${kind}.${format}`;
}

function compile(dir, target, { kind, format = 'generic', draft = false } = {}) {
  const t0 = parseTarget(target);
  kind = kind || (t0.type === 'character' ? 'sheet' : 'image');
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(', ')}`);
  if (!FORMATS.includes(format)) throw new Error(`--format must be one of ${FORMATS.join(', ')}`);

  const g = gather(dir, target, kind, draft);
  const prompt = render(g, kind, format);
  const attach = g.attach.filter((a, i, all) => all.findIndex((b) => b.path === a.path) === i);
  const id = crypto.createHash('sha256')
    .update(prompt + '\n' + attach.map((a) => a.path).join('\n')).digest('hex').slice(0, 12);

  const title = g.t.type === 'shot' ? `Shot ${g.t.id}` : `Character ${g.t.slug}${g.t.look ? ` (${g.t.look})` : ''}`;
  const lines = [
    `# Prompt — ${title} · ${kind} · ${format}`,
    '',
    `- **Target:** ${target}`,
    `- **Kind:** ${kind}`,
    `- **Format:** ${format}`,
    `- **Prompt ID:** ${id}`,
    `- **Built from:** ${g.sources.join(', ')}`,
  ];
  if (g.unlocked.length) lines.push(`- **Draft:** yes — not locked: ${g.unlocked.join(', ')}`);
  lines.push('', '## Prompt', '', '```text', prompt, '```', '', '## Attach', '');
  if (attach.length) attach.forEach((a) => lines.push(`- ${a.path} — ${a.why}`));
  else lines.push('- (no reference images yet)');
  lines.push('', '## How to use', '',
    kind === 'video'
      ? 'Paste the prompt into your video tool, use the START FRAME as the first frame, and attach the other images if the tool accepts references.'
      : 'Paste the prompt into your image tool (Midjourney, Higgsfield, …) and attach the images above if the tool accepts references.',
    'Save the result into inbox/ and run /film-import.', '');
  const text = lines.join('\n');

  const rel = `.filmism/prompts/${baseName(g.t, kind, format)}.md`;
  const abs = path.join(dir, rel);
  let status = 'new';
  let retired = null;
  if (fs.existsSync(abs)) {
    const old = fs.readFileSync(abs, 'utf8');
    if (old === text) status = 'unchanged';
    else {
      const rdir = path.join(dir, '.filmism/prompts/_retired');
      fs.mkdirSync(rdir, { recursive: true });
      const base = baseName(g.t, kind, format);
      const n = fs.readdirSync(rdir).filter((f) => f.startsWith(base + '_v')).length + 1;
      retired = `.filmism/prompts/_retired/${base}_v${n}.md`;
      fs.renameSync(abs, path.join(dir, retired));
      status = 'updated';
    }
  }
  if (status !== 'unchanged') film.write(dir, rel, text);
  return { rel, id, prompt, attach, status, retired, draft: g.unlocked.length > 0, text };
}

module.exports = { compile, parseTarget, FORMATS, KINDS };
