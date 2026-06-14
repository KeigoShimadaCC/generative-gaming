import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    // Tests with "@live" in the test name are excluded by default. Set CODEX_LIVE=1 to include provider-backed contract tests.
    testNamePattern: process.env.CODEX_LIVE === "1" ? undefined : /^(?!.*@live).*$/i
  }
});
