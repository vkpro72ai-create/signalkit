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
      '**/next-env.d.ts',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      '**/.chrome-profile/**',
      '**/coverage/**',
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
  {
    // Engineering law: all AI calls go through LlmRouterService. No feature
    // module may build a provider adapter or call a provider directly. The LLM
    // module itself is exempt (it IS the router).
    files: ['apps/**/*.{ts,tsx}'],
    ignores: ['apps/api/src/llm/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@signalkit/llm',
              importNames: [
                'createAdapter',
                'OpenAICompatibleAdapter',
                'AnthropicAdapter',
                'GoogleAdapter',
                'DefaultLLMRouter',
              ],
              message:
                'Do not call LLM providers directly. Route AI generation through LlmRouterService (docs/AGENT_RULES.md).',
            },
          ],
        },
      ],
    },
  },
  {
    // Node-run config files (next.config.mjs, *.config.{js,mjs}) legitimately use
    // Node globals like `process`. Scope these globals to config files only.
    files: ['**/*.config.{js,mjs}', '**/next.config.mjs'],
    languageOptions: {
      globals: { process: 'readonly', __dirname: 'readonly', module: 'readonly', require: 'readonly' },
    },
  },
  prettier,
];
