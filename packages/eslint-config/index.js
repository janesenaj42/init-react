// The team's ESLint Standard for TypeScript React projects.
// Replace or extend the rules below with the org's own rules; every project picks
// them up by bumping this package's version.
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const MAX_FUNCTION_LINES = 30;

export default defineConfig([
  globalIgnores(["dist", "build", "coverage"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    // The team's code review standards that a linter can check.
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "max-lines-per-function": [
        "error",
        { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true },
      ],
      "no-magic-numbers": "off",
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
    },
  },
  {
    // Tests describe cases with literal values and long tables.
    files: ["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "max-lines-per-function": "off",
    },
  },
  // Must stay last: turns off every rule that would fight Prettier.
  prettier,
]);
