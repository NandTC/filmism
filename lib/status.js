'use strict';
// /film-status: reads the film files, checks each gate in order, and says what's next.
// Writes STATE.md so a fresh session can pick up from the files alone.

const film = require('./film');
const md = require('./md');
const st = require('./state');
const { inbox } = require('./importer');

const STAGES = ['Develop', 'Pre-production', 'Shoot', 'Deliver'];

function gate(name, stage, done, detail, next) {
  return { name, stage, done, detail, next: done ? null : next };
}

function evaluate(dir) {
  const m = film.load(dir);
  const state = st.load(dir);
  const gates = [];
  const blockers = [];
  const warnings = [];

  // Develop ----------------------------------------------------------------
  const basics = ['Title', 'Logline', 'Tone', 'Runtime'].filter((k) => md.isEmpty(m.film.get(md.norm(k))));
  gates.push(gate('Film basics', 'Develop', basics.length === 0,
    basics.length ? `missing in FILM.md: ${basics.join(', ')}` : 'title, logline, tone, runtime',
    { command: '/film-develop', why: 'Fill the film basics (logline, tone, runtime)' }));

  const coreOpen = m.story.questions.filter((q) => q.core && q.status !== 'answered');
  const open = m.story.questions.filter((q) => q.status === 'open');
  gates.push(gate('Story core locked', 'Develop', m.story.coreLocked,
    m.story.coreLocked ? 'core answers locked'
      : coreOpen.length ? `core questions left: ${coreOpen.map((q) => q.title).join(', ')}` : 'all core answers in — ready to lock',
    { command: '/film-develop', why: coreOpen.length ? `Answer the story questions (${coreOpen[0].title} next)` : 'Lock the story core' }));
  if (open.length) warnings.push(`${open.length} OPEN story answer(s): ${open.map((q) => q.title).join(', ')} — close them before the script.`);

  // Pre-production ------------------------------------------------------------
  gates.push(gate('Bible locked', 'Pre-production', m.bible.status === 'locked',
    m.bible.status === 'locked' ? `STYLE locked, ${m.bible.references.length} style reference(s)`
      : m.bible.style ? 'STYLE written — ready to lock' : 'no STYLE paragraph yet',
    { command: '/film-bible', why: m.bible.style ? 'Review and lock the look' : 'Define the look of the film' }));

  const used = new Map();
  for (const s of m.shots) for (const c of s.characters) if (!used.has(c.slug)) used.set(c.slug, s.id);
  const missing = [...used.keys()].filter((slug) => !m.characters.find((c) => c.slug === slug));
  const unlockedChars = m.characters.filter((c) => c.status !== 'locked');
  for (const slug of missing) blockers.push(`Shot ${used.get(slug)} uses "${slug}" but there is no characters/${slug}/CANON.md.`);
  const noneYet = m.characters.length === 0 && m.shots.length === 0;
  const castTarget = missing[0] || (unlockedChars[0] && unlockedChars[0].slug) || '<name>';
  gates.push(gate('Characters locked', 'Pre-production', !noneYet && !missing.length && !unlockedChars.length,
    noneYet ? 'no characters yet'
      : `${m.characters.length} character(s)` +
        (unlockedChars.length ? `, not locked: ${unlockedChars.map((c) => c.slug).join(', ')}` : '') +
        (missing.length ? `, missing: ${missing.join(', ')}` : ''),
    { command: `/film-cast ${castTarget}`, why: missing.length ? `Create ${castTarget} (used in the shots)` : noneYet ? 'Create your first character' : `Finish and lock ${castTarget}` }));

  const thin = m.shots.filter((s) => md.isEmpty(s.get('framing')) || md.isEmpty(s.get('action')));
  if (thin.length) warnings.push(`Shot(s) missing Framing or Action: ${thin.map((s) => s.id).join(', ')}.`);
  gates.push(gate('Shot list', 'Pre-production', m.shots.length > 0,
    m.shots.length ? `${m.shots.length} shot(s)` : 'no shots yet',
    { command: '/film-shots', why: 'Break the story into shots' }));

  const noKey = m.shots.filter((s) => md.isEmpty(s.get('keyframe')));
  const draftKey = m.shots.filter((s) => !md.isEmpty(s.get('keyframe')) && !/keyframe approved|clip/.test(s.get('status').toLowerCase()));
  const keyDone = m.shots.length > 0 && !noKey.length && !draftKey.length;
  gates.push(gate('Storyboard approved', 'Pre-production', keyDone,
    `${m.shots.length - noKey.length - draftKey.length}/${m.shots.length} keyframes approved` +
      (draftKey.length ? `, waiting for approval: ${draftKey.map((s) => s.id).join(', ')}` : ''),
    draftKey.length
      ? { command: '/film-import', why: `Review and approve the keyframe of shot ${draftKey[0].id}` }
      : { command: `/film-prompt ${noKey[0] ? noKey[0].id : ''}`.trim(), why: `Make the keyframe for shot ${noKey[0] ? noKey[0].id : ''}` }));

  // Shoot (manual in the MVP) -------------------------------------------------
  const noClip = m.shots.filter((s) => !/clip approved/.test(s.get('status').toLowerCase()));
  gates.push(gate('Clips approved', 'Shoot', m.shots.length > 0 && !noClip.length,
    `${m.shots.length - noClip.length}/${m.shots.length} clips approved`,
    { command: `/film-prompt ${noClip[0] ? noClip[0].id : ''} --kind video`.trim(), why: `Make the clip for shot ${noClip[0] ? noClip[0].id : ''}` }));

  // Stage = stage of the first gate not done; next = its action (inbox first).
  const first = gates.find((g) => !g.done);
  const stage = first ? first.stage : 'Deliver';
  const files = inbox(dir);
  let next;
  if (files.length) next = { command: '/film-import', why: `${files.length} file(s) waiting in inbox/` };
  else if (first) next = first.next;
  else next = { command: '—', why: 'All MVP gates passed. Edit the clips together (/film-cut is not in the MVP yet).' };

  const counts = { approved: 0, draft: 0, retired: 0 };
  for (const a of state.assets) counts[a.status] = (counts[a.status] || 0) + 1;

  return { title: m.film.get('title') || '', stage, gates, blockers, warnings, next, shots: m.shots, inbox: files, assets: state.assets.length, counts };
}

function cell(s) {
  return String(s || '').replace(/\|/g, '\\|') || '—';
}

function render(r) {
  const L = [];
  L.push(`# STATE — ${r.title}`, '', '<!-- Written by `filmism status`. Do not edit by hand. -->', '');
  L.push(`- **Stage:** ${r.stage}`);
  L.push(`- **Next:** ${r.next.command} — ${r.next.why}`);
  L.push(`- **Updated:** ${film.today()}`, '');
  L.push('## Gates', '', '| | Gate | Stage | Detail |', '|---|---|---|---|');
  for (const g of r.gates) L.push(`| ${g.done ? '✅' : '⬜'} | ${g.name} | ${g.stage} | ${cell(g.detail)} |`);
  L.push('');
  if (r.blockers.length) { L.push('## Blockers', ''); r.blockers.forEach((b) => L.push(`- ${b}`)); L.push(''); }
  if (r.warnings.length) { L.push('## Warnings', ''); r.warnings.forEach((w) => L.push(`- ${w}`)); L.push(''); }
  if (r.shots.length) {
    L.push('## Shots', '', '| Shot | Title | Characters | Status | Keyframe | Clip |', '|---|---|---|---|---|---|');
    for (const s of r.shots) {
      L.push(`| ${s.id} | ${cell(s.title)} | ${cell(s.get('characters'))} | ${cell(s.get('status'))} | ${cell(s.get('keyframe'))} | ${cell(s.get('clip'))} |`);
    }
    L.push('');
  }
  L.push('## Assets', '');
  L.push(`- Imported: ${r.assets} (approved ${r.counts.approved || 0}, draft ${r.counts.draft || 0}, retired ${r.counts.retired || 0})`);
  L.push(`- Inbox: ${r.inbox.length ? r.inbox.join(', ') : 'empty'}`);
  L.push('- Credits: external mode — not tracked', '');
  return L.join('\n');
}

function status(dir) {
  const r = evaluate(dir);
  const text = render(r);
  film.write(dir, 'STATE.md', text);
  return { ...r, text };
}

module.exports = { status, evaluate, render, STAGES };
