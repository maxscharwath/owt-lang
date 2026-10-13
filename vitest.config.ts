import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const r = (p: string) => resolve(import.meta.dirname, p);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/src/**/*.spec.ts', 'packages/**/test/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/fixture/**'],
  },
  resolve: {
    alias: [
      { find: /^owt\/internal$/, replacement: r('./packages/owt/src/internal.ts') },
      { find: /^owt\/dom$/, replacement: r('./packages/owt/src/dom.ts') },
      { find: /^owt$/, replacement: r('./packages/owt/src/index.ts') },
      { find: /^@owt\/ast$/, replacement: r('./packages/owt-ast/src/index.ts') },
      { find: /^@owt\/parser$/, replacement: r('./packages/owt-parser/src/index.ts') },
      { find: /^@owt\/compiler$/, replacement: r('./packages/owt-compiler/src/index.ts') },
      { find: /^@owt\/language-core$/, replacement: r('./packages/owt-language-core/src/index.ts') },
    ],
  },
});
