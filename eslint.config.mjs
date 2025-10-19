import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default defineConfig(
  // 基础设置
  {
    ignores: [
      'node_modules',
      'dist',
      'build',
      '.next',
      '**/coverage',
      '**/generated',
    ],
  },

  // 通用 JS/TS 规则
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true, // 自动识别每包 tsconfig.json
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'prettier': prettierPlugin
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      'no-undef': 'off',
      'no-console': 'off',
      'no-debugger': 'warn',
      'prettier/prettier': 'error',
    },
  },

  // React + Next.js 前端应用
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },

  // Node.js 控制台应用（apps/console）
  {
    files: ['apps/console/**/*.{ts,js}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-process-exit': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // 最后应用 Prettier
  {
    files: ['**/*.{ts,tsx,js,jsx}'], // all JS/TS files in monorepo
    ...prettier,
  }
);
