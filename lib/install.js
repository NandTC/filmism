'use strict';
// Installs Filmism into Claude Code: slash commands + the runtime they call.
//   local : <project>/.claude/commands/film-*.md  and  <project>/.claude/filmism/
//   global: ~/.claude/commands/film-*.md          and  ~/.claude/filmism/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { PKG_ROOT } = require('./film');

const RUNTIME = ['bin', 'lib', 'templates', 'adapters', 'package.json'];

function install({ scope = 'local', dir = process.cwd(), home = os.homedir() } = {}) {
  if (!['local', 'global'].includes(scope)) throw new Error('scope must be local or global');
  const base = scope === 'local' ? path.join(path.resolve(dir), '.claude') : path.join(home, '.claude');
  const runtime = path.join(base, 'filmism');
  if (path.resolve(runtime) === path.resolve(PKG_ROOT)) throw new Error('Refusing to install over the source folder');

  fs.mkdirSync(runtime, { recursive: true });
  for (const item of RUNTIME) {
    fs.cpSync(path.join(PKG_ROOT, item), path.join(runtime, item), { recursive: true, force: true });
  }

  // Commands call the CLI with a path that works from the project root (local) or anywhere (global).
  const cli = scope === 'local'
    ? 'node .claude/filmism/bin/filmism.js'
    : `node "${path.join(runtime, 'bin', 'filmism.js')}"`;
  const cmdDir = path.join(base, 'commands');
  fs.mkdirSync(cmdDir, { recursive: true });
  const commands = fs.readdirSync(path.join(PKG_ROOT, 'commands')).filter((f) => f.endsWith('.md')).sort();
  for (const f of commands) {
    const text = fs.readFileSync(path.join(PKG_ROOT, 'commands', f), 'utf8').split('{{FILMISM}}').join(cli);
    fs.writeFileSync(path.join(cmdDir, f), text);
  }

  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  return { base, runtime, commands: commands.map((f) => '/' + f.replace(/\.md$/, '')), ffmpeg };
}

module.exports = { install };
