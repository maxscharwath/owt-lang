import { build } from 'esbuild';

// One self-contained file (TypeScript included) so editors only need Node.js.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  mainFields: ['module', 'main'],
  format: 'cjs',
  target: 'node20',
  sourcemap: 'linked',
  minifySyntax: true,
  logLevel: 'warning',
  // keep `require.resolve` of optional TS plugins working
  external: [],
  define: { 'import.meta.url': 'importMetaUrl' },
  banner: { js: "const importMetaUrl = require('url').pathToFileURL(__filename).href;" },
});

// The bundled TypeScript looks for its lib.*.d.ts files next to the executing script.
import { copyFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const tsLib = dirname(createRequire(import.meta.url).resolve('typescript/lib/typescript.js'));
for (const file of readdirSync(tsLib)) {
  if (file.startsWith('lib.') && file.endsWith('.d.ts')) copyFileSync(join(tsLib, file), join('dist', file));
}
