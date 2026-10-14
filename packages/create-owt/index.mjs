#!/usr/bin/env node
// create-owt: scaffold an OWT app.
//   npm create owt@latest [directory] [-- --template minimal|todo] [--yes]
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const TEMPLATES = {
  minimal: 'A counter: state, derived values and conditionals',
  todo: 'A todo list: lists, bindings, pattern matching, transitions, localStorage',
};
const OWT_VERSION = '^1.0.0-beta.1';
const here = fileURLToPath(new URL('.', import.meta.url));

function parseArgs(argv) {
  const out = { dir: null, template: null, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--template' || a === '-t') out.template = argv[++i] ?? null;
    else if (a.startsWith('--template=')) out.template = a.slice(11);
    else if (!a.startsWith('-') && out.dir === null) out.dir = a;
  }
  return out;
}

function packageManager() {
  const agent = process.env.npm_config_user_agent ?? '';
  for (const pm of ['pnpm', 'yarn', 'bun']) if (agent.startsWith(pm)) return pm;
  return 'npm';
}

/** `my app` → `my-app` (valid npm package name). */
function packageName(dir) {
  return basename(resolve(dir))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-') || 'owt-app';
}

function titleOf(name) {
  return name
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function copyDir(from, to, vars) {
  for (const entry of readdirSync(from)) {
    const source = join(from, entry);
    // npm drops dotfiles like .gitignore from published packages: they are stored as `_name`
    let target = entry.startsWith('_') ? `.${entry.slice(1)}` : entry;
    if (target.startsWith('src_')) target = join('src', target.slice(4));
    const dest = join(to, target);
    if (statSync(source).isDirectory()) {
      mkdirSync(dest, { recursive: true });
      copyDir(source, dest, vars);
    } else {
      mkdirSync(join(dest, '..'), { recursive: true });
      const text = readFileSync(source, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, key) => vars[key] ?? m);
      writeFileSync(dest, text);
    }
  }
}

export async function create(argv = process.argv.slice(2), io = { input: process.stdin, output: process.stdout }) {
  const args = parseArgs(argv);
  const log = (s = '') => io.output.write(`${s}\n`);
  if (args.help) {
    log('Usage: npm create owt@latest [directory] [-- --template minimal|todo] [--yes]');
    log();
    for (const [name, description] of Object.entries(TEMPLATES)) log(`  ${name.padEnd(8)} ${description}`);
    return null;
  }
  const interactive = !args.yes && io.input.isTTY !== false;
  const rl = interactive ? createInterface({ input: io.input, output: io.output }) : null;
  const ask = async (question, fallback) => {
    if (rl === null) return fallback;
    const answer = (await rl.question(`${question} (${fallback}) `)).trim();
    return answer === '' ? fallback : answer;
  };
  try {
    log('\n  OWT: make it happen.\n');
    const dir = args.dir ?? (await ask('Project directory?', 'owt-app'));
    const names = Object.keys(TEMPLATES);
    let template = args.template;
    if (template === null) {
      if (rl !== null) names.forEach((n, i) => log(`  ${i + 1}. ${n.padEnd(8)} ${TEMPLATES[n]}`));
      const answer = await ask('Template?', 'todo');
      template = names[Number(answer) - 1] ?? answer;
    }
    if (!(template in TEMPLATES)) throw new Error(`Unknown template "${template}" (available: ${names.join(', ')})`);
    const target = resolve(dir);
    if (existsSync(target) && readdirSync(target).length > 0) {
      const overwrite = await ask(`${relative(process.cwd(), target) || '.'} is not empty. Continue and overwrite files?`, args.yes ? 'yes' : 'no');
      if (!overwrite.toLowerCase().startsWith('y')) throw new Error('Cancelled: the directory is not empty');
    }
    const name = packageName(dir);
    const pm = packageManager();
    const vars = { name, title: titleOf(name), owtVersion: OWT_VERSION, pm };
    mkdirSync(target, { recursive: true });
    copyDir(join(here, 'templates', 'shared'), target, vars);
    copyDir(join(here, 'templates', template), target, vars);
    const cd = relative(process.cwd(), target);
    log(`\n  Created ${name} (${template}) in ${target}\n`);
    log('  Next steps:');
    if (cd !== '') log(`    cd ${cd.includes(' ') ? JSON.stringify(cd) : cd}`);
    log(`    ${pm} install`);
    log(`    ${pm} run dev\n`);
    return { target, name, template };
  } finally {
    rl?.close();
  }
}

// run as a command (also through the node_modules/.bin symlink), not when imported by tests
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  create().catch((err) => {
    console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
