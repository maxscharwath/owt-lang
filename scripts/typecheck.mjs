// Type-check every package (tsc) and every example (owt-tsc, which also checks `.owt` markup).
// Usage: node scripts/typecheck.mjs [--no-examples]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const owtTsc = join(root, 'packages/owt-tsc/bin/owt-tsc.cjs');

const dirs = (parent) =>
  readdirSync(join(root, parent), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, parent, d.name, 'tsconfig.json')))
    .map((d) => join(root, parent, d.name));

const jobs = dirs('packages').map((dir) => ({ dir, bin: tsc }));
if (!process.argv.includes('--no-examples')) {
  if (!existsSync(join(root, 'packages/owt-tsc/dist'))) {
    console.error('owt-tsc is not built: run `pnpm build` first (or pass --no-examples)');
    process.exit(1);
  }
  for (const dir of [...dirs('examples'), join(root, 'benchmark')]) jobs.push({ dir, bin: owtTsc });
}

let failed = 0;
for (const { dir, bin } of jobs) {
  const name = relative(root, dir);
  const result = spawnSync(process.execPath, [bin, '--noEmit', '-p', 'tsconfig.json'], { cwd: dir, encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`ok    ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}\n${result.stdout}${result.stderr}`);
  }
}
if (failed > 0) {
  console.error(`${failed} project(s) failed to type-check`);
  process.exit(1);
}
