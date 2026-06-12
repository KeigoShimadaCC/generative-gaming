import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
  },
  oxc: {
    jsx: {
      importSource: "react",
      runtime: "automatic",
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: `${root}app` },
      { find: /^@harness\/(.+)$/, replacement: `${root}src/harness/$1` },
    ],
  },
  test: {
    environment: "node",
    include: ["app/components/diary/**/*.test.ts"],
  },
});
