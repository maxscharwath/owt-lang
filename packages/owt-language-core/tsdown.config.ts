import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  external: [/^@babel\//, /^@owt\//, /^@volar\//, 'typescript'],
});
