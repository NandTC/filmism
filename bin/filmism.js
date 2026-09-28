#!/usr/bin/env node
'use strict';
// Filmism CLI. The slash commands call this; you can also run it by hand.

const path = require('path');
const readline = require('readline');
const film = require('../lib/film');

const HELP = `Filmism — AI filmmaking workflow for Claude Code

Install
  filmism install --local            into this project (.claude/)
  filmism install --global           for all projects (~/.claude/)

Film
  filmism new <name> [--idea "..."] [--dir <parent>]
  filmism character <name>           create characters/<name>/CANON.md
  filmism location <name>            create locations/<name>/LOCATION.md
  filmism lock <story|bible|character:<name>|location:<name>>
  filmism unlock <same> --reason "..."

Prompts
  filmism compile <shot:<n>|character:<name>[:look]>
        [--kind image|video|sheet] [--format generic|midjourney] [--draft]

Assets
  filmism inbox                      list files waiting in inbox/
  filmism import <file> --as <shot:<n>|character:<name>[:look]|location:<name>|style>
        [--status draft|approved] [--source midjourney] [--note "..."] [--prompt <id>]
  filmism approve <asset id | file | key>

State
  filmism status [--json]

Options
  --film <folder>   which film (default: the film here, or the only one below)
`;

const BOOL = new Set(['draft', 'json', 'local', 'global', 'claude', 'help']);

function parse(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (BOOL.has(k)) opt[k] = true;
      else { opt[k] = argv[i + 1]; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

async function runInstall(opt) {
  let scope = opt.global ? 'global' : opt.local ? 'local' : null;
  if (!scope) {
    if (!process.stdin.isTTY) { console.log(HELP); return; }
    const a = (await ask('Install Filmism for this project only (L) or for all projects (g)? [L/g] ')).toLowerCase();
    scope = a.startsWith('g') ? 'global' : 'local';
  }
  const r = require('../lib/install').install({ scope, dir: opt.dir || process.cwd() });
  console.log(`Filmism installed (${scope}) in ${r.base}`);
  console.log(`Commands: ${r.commands.join(' ')}`);
  if (!r.ffmpeg) console.log('Note: ffmpeg not found. The MVP does not need it; editing (later) will.');
  console.log('Higgsfield (automatic generation) is a planned adapter — see .claude/filmism/adapters/higgsfield.md');
  console.log('Filmism installed. Open Claude Code here and type /film-new to start.');
}

async function main(argv) {
  const { pos, opt } = parse(argv);
  const cmd = pos.shift();
  if (opt.help || cmd === 'help') return console.log(HELP);
  if (!cmd || cmd === 'install') return runInstall(opt);

  if (cmd === 'new') {
    if (!pos.length) throw new Error('Give the film a name: filmism new <name>');
    const dir = film.createFilm(pos.join(' '), { idea: opt.idea || '', parent: opt.dir ? path.resolve(opt.dir) : process.cwd() });
    console.log(`Created ${path.relative(process.cwd(), dir) || '.'}/ with FILM.md, STORY.md, BIBLE.md, SHOTS.md, STATE.md`);
    return;
  }

  const dir = film.findFilm(opt.film);
  const rel = (p) => path.relative(process.cwd(), path.join(dir, p));

  switch (cmd) {
    case 'character':
    case 'location': {
      if (!pos.length) throw new Error(`filmism ${cmd} <name>`);
      const r = cmd === 'character' ? film.createCharacter(dir, pos.join(' ')) : film.createLocation(dir, pos.join(' '));
      console.log(`Created ${rel(r)}`);
      return;
    }
    case 'lock': {
      const r = require('../lib/lock').lock(dir, pos[0]);
      console.log(`Locked ${pos[0]} (${rel(r)})`);
      return;
    }
    case 'unlock': {
      const r = require('../lib/lock').unlock(dir, pos[0], opt.reason);
      console.log(`Unlocked ${pos[0]} (${rel(r)}) — revision logged`);
      return;
    }
    case 'compile': {
      if (!pos[0]) throw new Error('filmism compile <shot:<n>|character:<name>[:look]>');
      const r = require('../lib/compile').compile(dir, pos[0], { kind: opt.kind, format: opt.format, draft: !!opt.draft });
      console.log(r.text);
      console.log(`--- saved ${rel(r.rel)} (${r.status}${r.retired ? `, previous kept in ${rel(r.retired)}` : ''})`);
      return;
    }
    case 'inbox': {
      const files = require('../lib/importer').inbox(dir);
      console.log(files.length ? files.map(rel).join('\n') : 'inbox/ is empty');
      return;
    }
    case 'import': {
      if (!pos[0]) throw new Error('filmism import <file> --as <what>');
      const src = path.isAbsolute(pos[0]) || require('fs').existsSync(pos[0]) ? pos[0] : path.join(dir, pos[0]);
      const r = require('../lib/importer').importAsset(dir, src, {
        as: opt.as, status: opt.status, source: opt.source, note: opt.note, prompt: opt.prompt,
      });
      console.log(`${r.moved ? 'Moved' : 'Copied'} ${r.asset.original} -> ${rel(r.asset.file)} [${r.asset.id}, ${r.asset.status}]`);
      if (r.retired) console.log(`Previous version kept in ${rel(r.retired.to)}`);
      if (r.asset.prompt_id) console.log(`Linked to prompt ${r.asset.prompt_id}`);
      return;
    }
    case 'approve': {
      const a = require('../lib/importer').approve(dir, pos[0]);
      console.log(`Approved ${rel(a.file)} [${a.id}]`);
      return;
    }
    case 'status': {
      const r = require('../lib/status').status(dir);
      if (opt.json) {
        const { text, shots, ...rest } = r;
        console.log(JSON.stringify({ ...rest, shots: shots.map((s) => ({ id: s.id, title: s.title, status: s.get('status') })) }, null, 2));
      } else console.log(r.text.replace(/<!--.*?-->\n\n/, ''));
      return;
    }
    default:
      throw new Error(`Unknown command "${cmd}". Run: filmism help`);
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`filmism: ${e.message}`);
  process.exit(1);
});
