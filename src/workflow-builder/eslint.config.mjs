// @ts-check
// Ported from src/gui/eslint.config.mjs so the two frontends share one style
// identity. The @stylistic block and TS/core rules are carried over verbatim; the
// Angular-specific pieces (angular-eslint, inline-template processor, selector rules,
// the HTML template block) are removed, and React correctness + JSX a11y are added.
// See docs/Workflow-Builder-App.md section 13.
import tsEslint from 'typescript-eslint';
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tsEslint.config(
    // Global ignores
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'coverage/**',
            'playwright-report/**',
            'vite.config.ts',
            'vitest.config.ts',
            'playwright.config.ts',
        ],
    },
    // TypeScript / TSX files configuration
    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            eslint.configs.recommended,
            ...tsEslint.configs.recommended,
            ...tsEslint.configs.stylistic,
        ],
        languageOptions: {
            parserOptions: {
                project: ['tsconfig.json'],
            },
        },
        settings: {
            react: {
                version: '18.3',
            },
        },
        plugins: {
            '@stylistic': stylistic,
            'react': react,
            'react-hooks': reactHooks,
            'jsx-a11y': jsxA11y,
        },
        rules: {
            // Formatting rules (using @stylistic plugin) - carried over verbatim.
            '@stylistic/indent': ['error', 4],
            '@stylistic/arrow-parens': 'error',
            '@stylistic/brace-style': 'error',
            '@stylistic/comma-dangle': ['error', {
                'arrays': 'always-multiline',
                'objects': 'always-multiline',
                'imports': 'always-multiline',
                'exports': 'always-multiline',
                'functions': 'always-multiline',
            }],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/array-element-newline': ['error', {
                'minItems': 3,
            }],
            '@stylistic/array-bracket-newline': ['error', 'consistent'],
            '@stylistic/quotes': ['error', 'single', {
                'avoidEscape': true,
            }],

            // Core ESLint rules - carried over.
            'curly': ['error', 'all'],

            // TypeScript specific rules - carried over.
            '@typescript-eslint/no-unused-vars': ['error', {
                'argsIgnorePattern': '^__',
            }],

            // Error detection rules - carried over.
            'no-sparse-arrays': ['error'],
            'no-dupe-keys': ['error'],

            // React correctness (replaces the Angular selector/template rules).
            ...react.configs.recommended.rules,
            ...react.configs['jsx-runtime'].rules,
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // JSX accessibility (preserves the intent of the Angular template-
            // accessibility config, now for JSX).
            ...jsxA11y.flatConfigs.recommended.rules,
        },
    },
);
