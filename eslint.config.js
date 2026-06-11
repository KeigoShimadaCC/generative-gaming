import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "references/**",
      "runs/**"
    ]
  },
  {
    files: ["src/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TODO-PHASE-05: Replace this placeholder with concrete layer-boundary import rules.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "TODO-PHASE-05-layer-boundary-placeholder",
              message:
                "TODO-PHASE-05: replace with concrete module boundary restrictions."
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
];
