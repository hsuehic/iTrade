import tseslint from "typescript-eslint";
import eslintPluginImport from "eslint-plugin-import";
import prettier from "eslint-config-prettier";
import { FlatCompat } from "@eslint/eslintrc";
import eslintPluginPrettier from "eslint-plugin-prettier";

const compat = new FlatCompat();

export default [
  // Global ignores (apply regardless of file types)
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/build/**",
      "**/out/**",
      "**/*.d.ts",
      "eslint.config.mjs",
    ],
  },

  // Base recommended + TypeScript
  ...tseslint.configs.recommended,

  // Next.js app (only apply to apps/web)
  ...compat
    .extends("next", "next/core-web-vitals", "next/typescript")
    .map((cfg) => ({
      ...cfg,
      files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
      rules: {
        ...(cfg.rules || {}),
        "@next/next/no-html-link-for-pages": "off",
      },
    })),

  // Import plugin rules
  {
    plugins: { import: eslintPluginImport },
    rules: {
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
        },
      ],
    },
  },

  // Project-specific customizations
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Run Prettier via ESLint so format-on-save works with the ESLint formatter
  {
    plugins: { prettier: eslintPluginPrettier },
    rules: {
      "prettier/prettier": "error",
    },
  },

  // Prettier last to disable conflicting rules
  prettier,
];


