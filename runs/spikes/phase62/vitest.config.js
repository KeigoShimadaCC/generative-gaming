import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["runs/spikes/phase62/sprite-manifest.test.js"],
  },
});
