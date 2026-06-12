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
      {
        find: /^@engine\/state$/,
        replacement: `${root}src/engine/state/index.ts`,
      },
      {
        find: /^@engine\/run$/,
        replacement: `${root}src/engine/run/index.ts`,
      },
      {
        find: /^@engine\/turn$/,
        replacement: `${root}src/engine/turn/index.ts`,
      },
      { find: /^@engine\/(.+)$/, replacement: `${root}src/engine/$1` },
      { find: /^@harness\/(.+)$/, replacement: `${root}src/harness/$1` },
    ],
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testNamePattern: process.env.CODEX_LIVE === "1" ? undefined : /^(?!.*@live).*$/i,
  },
});
