'use strict';
// Tiny markdown helpers for Filmism files.
// Conventions: fields are "- **Key:** value" lines; sections are "#" headings.
// Anything inside <!-- comments --> is ignored when reading, and kept when editing.

const FIELD_RE = /^- \*\*(.+?):\*\*[ \t]?(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

// Mark each line as "live" (not inside an HTML comment).
function scan(text) {
  const lines = text.split('\n');
  let inComment = false;
  return lines.map((line) => {
    const startsInComment = inComment || line.trimStart().startsWith('<!--');
    // Update comment state by walking the markers on this line.
    let i = 0;
    while (i < line.length) {
      if (!inComment && line.startsWith('<!--', i)) { inComment = true; i += 4; }
      else if (inComment && line.startsWith('-->', i)) { inComment = false; i += 3; }
      else i += 1;
    }
    return { line, live: !startsInComment };
  });
}

function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

// All headings with their line ranges. `end` is exclusive and stops at the next
// heading of the same or higher level.
function sections(text) {
  const info = scan(text);
  const heads = [];
  info.forEach(({ line, live }, i) => {
    if (!live) return;
    const m = line.match(HEADING_RE);
    if (m) heads.push({ level: m[1].length, title: m[2], line: i });
  });
  return heads.map((h, idx) => {
    let end = info.length;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) { end = heads[j].line; break; }
    }
    return { ...h, start: h.line, end };
  });
}

function norm(s) {
  return String(s).trim().toLowerCase();
}

function findSection(text, match) {
  const test = typeof match === 'function' ? match : (t) => norm(t) === norm(match);
  return sections(text).find((s) => test(s.title, s.level)) || null;
}

// Body of a section (lines after the heading, up to its end), raw.
function sectionBody(text, match) {
  const s = findSection(text, match);
  if (!s) return null;
  return text.split('\n').slice(s.start + 1, s.end).join('\n');
}

// Text before the first heading after the title (the "front matter" fields).
function head(text) {
  const all = sections(text);
  const lines = text.split('\n');
  const second = all.find((s) => s.level >= 2);
  return lines.slice(0, second ? second.start : lines.length).join('\n');
}

// Fields in a chunk of text, ignoring comments. Returns a Map keyed by lower-case name.
function fields(text) {
  const out = new Map();
  for (const { line, live } of scan(text)) {
    if (!live) continue;
    const m = line.match(FIELD_RE);
    if (m && !out.has(norm(m[1]))) out.set(norm(m[1]), m[2].trim());
  }
  return out;
}

function field(text, key) {
  const v = fields(text).get(norm(key));
  return v === undefined ? undefined : v;
}

// Set a field value in `text` (first live occurrence). Throws if the field is missing.
function setField(text, key, value) {
  const info = scan(text);
  const idx = info.findIndex(({ line, live }) => {
    if (!live) return false;
    const m = line.match(FIELD_RE);
    return m && norm(m[1]) === norm(key);
  });
  if (idx === -1) throw new Error(`Field "${key}" not found`);
  const m = info[idx].line.match(FIELD_RE);
  const lines = info.map((x) => x.line);
  lines[idx] = `- **${m[1]}:**${value === '' ? '' : ' ' + value}`;
  return lines.join('\n');
}

// Apply `fn(bodyText) -> newBodyText` to one section, keeping everything else.
function editSection(text, match, fn) {
  const s = findSection(text, match);
  if (!s) throw new Error(`Section "${match}" not found`);
  const lines = text.split('\n');
  const body = lines.slice(s.start + 1, s.end).join('\n');
  const next = fn(body).split('\n');
  return [...lines.slice(0, s.start + 1), ...next, ...lines.slice(s.end)].join('\n');
}

// Prose of a section: comments removed, field lines and sub-sections excluded,
// whitespace collapsed. Deterministic, ready to drop into a prompt.
function prose(body) {
  if (body == null) return '';
  const cut = [];
  for (const { line, live } of scan(body)) {
    if (!live) continue;
    if (HEADING_RE.test(line)) break;
    if (FIELD_RE.test(line)) continue;
    cut.push(line);
  }
  return stripComments(cut.join('\n')).replace(/\s+/g, ' ').trim();
}

// List items ("- item") in a section body, excluding field lines and comments.
function listItems(body) {
  if (body == null) return [];
  const out = [];
  for (const { line, live } of scan(body)) {
    if (!live || FIELD_RE.test(line)) continue;
    const m = line.match(/^- (.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

// Add "- item" to the end of a section body's live content, if not already there.
function addListItem(body, item) {
  if (listItems(body).some((x) => x === item || x.startsWith(item + ' '))) return body;
  const lines = body.replace(/\s+$/, '').split('\n');
  lines.push(`- ${item}`, '');
  return lines.join('\n');
}

function removeListItem(body, startsWith) {
  return body
    .split('\n')
    .filter((l) => !(l.startsWith('- ') && (l.slice(2) === startsWith || l.slice(2).startsWith(startsWith + ' '))))
    .join('\n');
}

function isEmpty(v) {
  return v === undefined || v === null || String(v).trim() === '' || String(v).trim() === '—' || String(v).trim() === '-';
}

module.exports = {
  scan, stripComments, sections, findSection, sectionBody, head, fields, field, setField,
  editSection, prose, listItems, addListItem, removeListItem, isEmpty, norm,
};
