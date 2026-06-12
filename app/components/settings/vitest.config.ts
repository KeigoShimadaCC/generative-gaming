import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: "@", replacement: `${root}app` }],
  },
  test: {
    environment: "node",
    include: ["app/components/settings/**/*.test.ts"],
  },
});
