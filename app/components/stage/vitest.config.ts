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
      { find: /^@engine\/(.+)$/, replacement: `${root}src/engine/$1` },
      {
        find: /^@engine\/map$/,
        replacement: `${root}src/engine/map/index.ts`,
      },
      {
        find: /^@engine\/render$/,
        replacement: `${root}src/engine/render/index.ts`,
      },
      {
        find: /^@engine\/render\/grid$/,
        replacement: `${root}src/engine/render/grid.ts`,
      },
      {
        find: /^@engine\/state$/,
        replacement: `${root}src/engine/state/index.ts`,
      },
    ],
  },
  test: {
    environment: "node",
    include: ["app/components/stage/**/*.test.ts"],
  },
});
