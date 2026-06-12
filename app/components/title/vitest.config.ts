import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: `${root}app` },
      { find: /^@engine\/(.+)$/, replacement: `${root}src/engine/$1` },
      {
        find: /^@engine\/state$/,
        replacement: `${root}src/engine/state/index.ts`,
      },
    ],
  },
  test: {
    environment: "node",
    include: ["app/components/title/**/*.test.ts"],
  },
});
