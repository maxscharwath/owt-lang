/**
 * `owt-tsc`: TypeScript's `tsc` with `.owt` support (type-check whole
 * projects, emit declarations for libraries). Accepts every tsc flag.
 */
import { createRequire } from 'node:module';
import { runTsc } from '@volar/typescript/lib/quickstart/runTsc';
import { createOwtLanguagePlugin } from '@owt/language-core';

export function run(): void {
  const require = createRequire(`${process.cwd()}/`);
  let tscPath: string;
  try {
    tscPath = require.resolve('typescript/lib/tsc');
  } catch {
    tscPath = createRequire(__filename).resolve('typescript/lib/tsc');
  }
  runTsc(tscPath, ['.owt'], (ts) => [createOwtLanguagePlugin<string>(ts)]);
}
