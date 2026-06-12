import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";

const appClientBoundaryPatterns = [
  {
    group: [
      "**/src/**",
      "@engine/*/*",
      "@harness/*/*",
      "**/src/director/**",
      "**/src/gauntlet/**",
      "**/src/cli/**",
      "**/src/evals/**",
      "**/src/config/**",
      "**/src/schemas/**"
    ],
    message:
      "app client code may only import engine/harness public surfaces (API routes under app/api are exempt)."
  }
];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "references/**",
      "runs/**",
      ".next/**"
    ]
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    ignores: ["app/api/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-restricted-imports": ["error", { patterns: appClientBoundaryPatterns }]
    }
  },
  {
    files: ["app/api/**/*.{ts,tsx}"],
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
      ...tsPlugin.configs.recommended.rules
    }
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
