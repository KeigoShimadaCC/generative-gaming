import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  webpack: (config, { dev, webpack }) => {
    const fallbackProviderShim = path.resolve(
      process.cwd(),
      "app/api/director/fallback-provider-web.ts",
    );

    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      "../../harness/fallback-provider.js": fallbackProviderShim,
    };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /harness\/fallback-provider\.js$/,
        fallbackProviderShim,
      ),
    );

    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        aggregateTimeout: 300,
        ignored: [
          "**/.git/**",
          "**/.next/**",
          "**/coverage/**",
          "**/dist/**",
          "**/node_modules/**",
          "**/references/**",
          "**/runs/**",
        ],
        poll: 1000,
      };
    }

    return config;
  },
};

export default nextConfig;
