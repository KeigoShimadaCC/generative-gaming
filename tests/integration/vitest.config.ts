import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testNamePattern: process.env.CODEX_LIVE === "1" ? undefined : /^(?!.*@live).*$/i,
  },
});
