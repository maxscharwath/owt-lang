// Flat ESLint config for the OWT monorepo.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/server/**',
      '**/.tmp/**',
      '**/build/**',
      'packages/owt-jetbrains/**',
      'benchmark/results/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module', ecmaVersion: 'latest' },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Ban explicit any
      '@typescript-eslint/no-explicit-any': 'error',
      // Extensionless local imports in TypeScript sources
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['./*.js', './**/*.js', '../*.js', '../**/*.js'], message: 'Use extensionless local imports' },
          ],
        },
      ],
    },
  },
);
