import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gg: {
          bg: "var(--gg-bg)",
          surface: "var(--gg-surface)",
          "surface-raised": "var(--gg-surface-raised)",
          border: "var(--gg-border)",
          text: "var(--gg-text)",
          muted: "var(--gg-muted)",
          accent: "var(--gg-accent)",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
