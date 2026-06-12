import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["runs/spikes/29-ambient-director/validate-manifest.test.ts"],
  },
});
