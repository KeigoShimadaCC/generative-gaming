import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/determinism-audit/**/*.test.ts"],
  },
});
