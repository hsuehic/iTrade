import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// 导入 FlatCompat 以处理遗留的配置
import { FlatCompat } from '@eslint/eslintrc';

// 实例化 FlatCompat，并指定 monorepo 的根目录
// 这对于在子目录中找到 Next.js 实例至关重要
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default defineConfig(
  // 基础设置
  {
    ignores: [
      'node_modules',
      'dist',
      'build',
      '.next',
      '**/.next/**',
      '**/.next-*/**',
      '.next-*',
      '**/coverage',
      '**/generated',
    ],
  },

  // 通用 JS/TS 规则
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // projectService: true, // 自动识别每包 tsconfig.json
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        allowDefaultProject: true, // ✅ fallback for non-TS files
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
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
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },

  // Next.js 前端应用配置
  // 将 Next.js 配置和 `compat` 兼容配置合并
  ...compat
    .config({
      extends: ['next/core-web-vitals'],
      settings: {
        // 在 compat.config 中设置 rootDir
        next: {
          rootDir: 'apps/web/',
        },
      },
      rules: {
        '@next/next/no-html-link-for-pages': 'off',
        'react/display-name': 'off',
      },
    })
    .map((config) => ({
      ...config,
      files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
    })),

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
    files: ['**/*.{mjs,ts,tsx,js,jsx}'], // all JS/TS files in monorepo
    ...prettier,
  },
);
