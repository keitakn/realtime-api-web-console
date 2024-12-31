import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import antfu from '@antfu/eslint-config';
import { FlatCompat } from '@eslint/eslintrc';
import tailwindcss from 'eslint-plugin-tailwindcss';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default antfu(
  {
    react: true,
    formatters: {
      css: true,
      html: true,
      markdown: 'prettier',
    },
    stylistic: {
      semi: true,
      overrides: {
        'semi': ['error', 'always'],
        'semi-spacing': ['error', { after: true, before: false }],
        'semi-style': ['error', 'last'],
        'no-extra-semi': 'error',
        'no-unexpected-multiline': 'error',
        'no-unreachable': 'error',
      },
    },
    typescript: {
      overrides: {
        'ts/consistent-type-definitions': ['error', 'type'],
      },
    },
    ignores: [
      '**/node_modules/',
      '**/.next/',
      '**/build/',
      '**/coverage/',
      '**/.eslintrc.json',
      '**/next-env.d.ts',
      '**/*.config.js',
      '**/storybook-static/',
      'public/mockServiceWorker.js',
      '**/vitest.config.mts',
      '**/vitest.setup.mts',
      'next.config.mjs',
      'tsconfig.json',
      'package.json',
      'package-lock.json',
    ],
  },
  {
    rules: {
      'node/prefer-global/process': 'off',
    },
  },
  ...compat.extends('plugin:@next/next/core-web-vitals'),
  ...tailwindcss.configs['flat/recommended'],
);
