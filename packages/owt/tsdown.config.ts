import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/internal.ts', 'src/dom.ts', 'src/elements.ts'],
  format: 'esm',
  dts: true,
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
});
