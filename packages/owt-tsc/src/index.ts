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
  let warned = false;
  runTsc(tscPath, ['.owt'], (ts, options) => {
    const compilerOptions = options.options;
    if (!warned && !(compilerOptions.strictNullChecks ?? compilerOptions.strict ?? false)) {
      warned = true;
      process.stderr.write(
        'owt-tsc: warning: `strictNullChecks` is off. OWT code is only null-safe with "strict": true (or "strictNullChecks": true) in tsconfig.json.\n',
      );
    }
    return [createOwtLanguagePlugin<string>(ts)];
  });
}
