#!/usr/bin/env node
// Grammar tests for syntaxes/owt.tmLanguage.json, run with vscode-tmgrammar-test.
//
//   node scripts/test-grammar.mjs                  run snapshot + assertion tests
//   node scripts/test-grammar.mjs --updateSnapshot  rewrite test/grammar/*.owt.snap
//
// - test/grammar/*.owt             snapshot fixtures (expected tokens in *.owt.snap)
// - test/grammar/assertions/*.owt  scope assertions (`// ^^^ scope` lines, see vscode-tmgrammar-test)
//
// The TypeScript and CSS grammars embedded by OWT come from the pinned `tm-grammars` package
// (the same grammars VS Code ships), so snapshots are stable across machines.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));

const update = process.argv.includes('--updateSnapshot') || process.argv.includes('-u');
const tester = path.dirname(require.resolve('vscode-tmgrammar-test/package.json'));
const embedded = ['typescript.json', 'css.json'].flatMap((file) => ['-g', require.resolve(`tm-grammars/grammars/${file}`)]);

function run(label, script, args) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, [path.join(tester, 'dist', script), ...args], { cwd: root, stdio: 'inherit' });
  return result.status === 0;
}

const snapshots = run('grammar snapshots', 'snapshot.js', [...embedded, ...(update ? ['--updateSnapshot'] : []), 'test/grammar/*.owt']);
const assertions = run('grammar assertions', 'unit.js', [...embedded, 'test/grammar/assertions/*.owt']);

if (!snapshots || !assertions) process.exit(1);
