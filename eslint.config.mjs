// Flat ESLint config for the OWT monorepo
// Requires: eslint, @typescript-eslint/parser, @typescript-eslint/eslint-plugin

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Ban explicit any
      '@typescript-eslint/no-explicit-any': 'error',

      // Ban relative imports ending with .js (use extensionless imports in TS)
      // Examples blocked: ./x.js, ../x.js, ./dir/x.js
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['./*.js'], message: 'Use extensionless local import: ./name' },
            { group: ['./**/*.js'], message: 'Use extensionless local import: ./path/name' },
            { group: ['../*.js'], message: 'Use extensionless local import: ../name' },
            { group: ['../**/*.js'], message: 'Use extensionless local import: ../path/name' },
          ],
        },
      ],
    },
  },
];

