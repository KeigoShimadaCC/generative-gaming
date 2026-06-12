import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
  },
  resolve: {
    alias: [
      { find: "@", replacement: `${root}app` },
      { find: /^@engine\/(.+)$/, replacement: `${root}src/engine/$1` },
    ],
  },
  test: {
    environment: "node",
    include: ["app/store/**/*.test.ts"],
  },
});
