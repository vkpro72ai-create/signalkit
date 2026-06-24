// @ts-check
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

/**
 * Flat ESLint config shared across the SignalKit monorepo.
 * See docs/AGENT_RULES.md for the engineering laws this enforces.
 */
export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // TypeScript performs name/type resolution; the core rule produces false
      // positives on types and JSX, so defer to the compiler.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      // Engineering law: no fake/placeholder-only code paths slipping in silently.
      'no-warning-comments': ['warn', { terms: ['fixme', 'xxx'], location: 'anywhere' }],
    },
  },
  {
    // NestJS dependency injection needs runtime class imports for constructor
    // metadata (emitDecoratorMetadata), so `import type` would break DI here.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  prettier,
];
