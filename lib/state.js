'use strict';
// .filmism/state.json — the machine-readable asset log.
// Markdown files stay the source of truth for canon and shots; this file records
// every imported asset: where it came from, its version, status and what replaced it.

const fs = require('fs');
const path = require('path');

const REL = '.filmism/state.json';

function load(dir) {
  const p = path.join(dir, REL);
  if (!fs.existsSync(p)) return { version: 1, assets: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function save(dir, state) {
  const p = path.join(dir, REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n');
}

function nextId(state) {
  const n = state.assets.reduce((max, a) => Math.max(max, parseInt(a.id.slice(1), 10) || 0), 0) + 1;
  return 'a' + String(n).padStart(4, '0');
}

// The current (not retired) asset for a key, e.g. "shot:01:image".
function current(state, key) {
  return state.assets.filter((a) => a.key === key && a.status !== 'retired').pop() || null;
}

function versions(state, key) {
  return state.assets.filter((a) => a.key === key).reduce((max, a) => Math.max(max, a.version), 0);
}

module.exports = { REL, load, save, nextId, current, versions };
