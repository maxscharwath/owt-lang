// Build the workspace packages the current package depends on (`@owt/vite`, `@owt/compiler`...),
// in dependency order, so `pnpm run build` works in a fresh clone (CI, Vercel, Netlify) without
// running `pnpm build` at the root first. Used by the examples: "build": "node ../../scripts/build-deps.mjs && vite build".
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { name } = JSON.parse(readFileSync('package.json', 'utf8'));
// `name^...` = the dependencies of `name` (not `name` itself); arguments are passed without a
// shell, so `^` is not mangled by cmd.exe on Windows
const args = ['--filter', `${name}^...`, 'run', 'build'];
const execpath = process.env.npm_execpath;
const result =
  execpath !== undefined && execpath.includes('pnpm')
    ? /\.[cm]?js$/.test(execpath)
      ? spawnSync(process.execPath, [execpath, ...args], { stdio: 'inherit' })
      : spawnSync(execpath, args, { stdio: 'inherit' })
    : spawnSync('pnpm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error !== undefined) console.error(result.error.message);
process.exit(result.status ?? 1);
