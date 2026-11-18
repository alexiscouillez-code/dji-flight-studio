import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are published as TypeScript sources.
  transpilePackages: [
    "@dfs/shared-types",
    "@dfs/geographic-engine",
    "@dfs/trajectory-engine",
    "@dfs/drone-adapters",
    "@dfs/flight-safety",
    "@dfs/cinematic-engine",
    "@dfs/flight-simulator",
    "@dfs/dji-adapter",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;
