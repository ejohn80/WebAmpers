// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import {defineConfig, globalIgnores} from "eslint/config";

export default defineConfig([
  // Ignore these paths/patterns entirely
  globalIgnores([
    "dist/**",
    "coverage/**",
    "node_modules/**",
    "src/tests/**",
    "**/*.test.{js,jsx,ts,tsx}",
    "**/*.spec.{js,jsx,ts,tsx}",
  ]),

  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {jsx: true},
        sourceType: "module",
      },
    },
    rules: {
      // keep your uppercase/ALL_CAPS unused var allowance
      "no-unused-vars": [
        "error",
        {varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_"},
      ],
    },
  },
]);
