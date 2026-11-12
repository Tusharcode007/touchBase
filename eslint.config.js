import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Allow intentionally unused args/vars when they start with "_".
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Security: never build code from strings.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["server/**/*.ts", "scripts/**/*.mjs", "shared/**/*.ts"],
    languageOptions: { globals: globals.node },
    rules: {
      // Logs must go through the redacting logger, never console.
      "no-console": ["error", { allow: ["error"] }],
    },
  },
  {
    files: ["web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Never inject raw HTML into the page (XSS risk).
      "no-restricted-properties": [
        "error",
        { object: "document", property: "write", message: "Do not write raw HTML." },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },
);
