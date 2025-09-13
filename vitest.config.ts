import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/src/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      'owt-ast': r('./packages/owt-ast/src/index.ts'),
      'owt-parser': r('./packages/owt-parser/src/index.ts'),
      'owt-compiler': r('./packages/owt-compiler/src/index.ts'),
      'owt-runtime': r('./packages/owt-runtime/src/index.ts'),
      'vite-plugin-owt': r('./packages/vite-plugin-owt/src/index.ts'),
    },
  },
});
