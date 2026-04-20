import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
// import nextConfig from 'eslint-config-next/core-web-vitals.js';

// 导入 FlatCompat 以处理遗留的配置 (commented out to avoid circular config)
// import { FlatCompat } from '@eslint/eslintrc';

// 实例化 FlatCompat，并指定 monorepo 的根目录 (commented out)
// const compat = new FlatCompat({
//   baseDirectory: import.meta.dirname,
// });

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
      'apps/web/next-env.d.ts',
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

  // Relax no-explicit-any in tests and exchange connectors
  {
    files: ['**/*.{test,spec}.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['packages/exchange-connectors/**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // React + Next.js 前端应用
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },

  // Next.js 前端应用配置 (使用 FlatCompat)
  // Next.js config via FlatCompat removed to prevent circular reference
  // ...compat.extends('next/core-web-vitals').map((config) => ({
  //   ...config,
  //   files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
  //   settings: {
  //     ...config.settings,
  //     next: {
  //       rootDir: 'apps/web/',
  //     },
  //   },
  //   rules: {
  //     ...config.rules,
  //     '@next/next/no-html-link-for-pages': 'off',
  //     'react/display-name': 'off',
  //   },
  // })),

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
