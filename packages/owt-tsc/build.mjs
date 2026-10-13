import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['typescript', '@volar/typescript', '@owt/language-core'],
  sourcemap: true,
  logLevel: 'warning',
});
