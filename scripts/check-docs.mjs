// Type-check the code samples of README.md with owt-tsc, so the docs never drift from the language.
// The samples are written to a temporary folder inside examples/showcase (for its tsconfig and
// dependencies), together with small stubs for the modules they import.
// Usage: node scripts/check-docs.mjs   (needs `pnpm build`)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const showcase = join(root, 'examples/showcase');
const out = join(showcase, 'src/__docs');

const readme = readFileSync(join(root, 'README.md'), 'utf8');
const blocks = [];
const fence = /```(owt|ts)\n([\s\S]*?)```/g;
for (let m = fence.exec(readme); m !== null; m = fence.exec(readme)) blocks.push(m[2]);

const files = {
  'types.ts': 'export type Todo = { id: string; text: string; done: boolean }\n',
  'api.ts': 'export async function fetchUser(id: number) { return { name: `User ${id}` } }\n',
  'actions.ts': "export { tooltip } from '../actions'\n",
  'widgets.owt': ['Posts(userId: number)', 'Likes(userId: number)', 'Chart(userId: number)', 'Pin(title: string)']
    .map((sig) => `export component ${sig} { <p>{String(${sig.slice(sig.indexOf('(') + 1, sig.indexOf(':'))})}</p> }\n`)
    .join(''),
};
for (const code of blocks) {
  if (code.includes('component TodoList')) files['TodoList.owt'] = code;
  else if (code.includes('component App(name')) files['App.owt'] = code;
  else if (code.includes('component Profile')) files['Profile.owt'] = code;
  else if (code.trimStart().startsWith('<Profile')) {
    files['Use.owt'] = `import { Profile } from './Profile.owt'\nexport component Use(id: number) {\n${code}}\n`;
  } else if (code.includes('// store.ts')) files['store.ts'] = code;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [name, code] of Object.entries(files)) writeFileSync(join(out, name), code);
const result = spawnSync(process.execPath, [join(root, 'packages/owt-tsc/bin/owt-tsc.cjs'), '--noEmit', '-p', 'tsconfig.json'], {
  cwd: showcase,
  encoding: 'utf8',
});
rmSync(out, { recursive: true, force: true });
if (result.status !== 0) {
  console.error(`README samples do not type-check:\n${result.stdout}${result.stderr}`);
  process.exit(1);
}
console.log(`ok    README samples (${Object.keys(files).length} files)`);
