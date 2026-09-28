import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This app lives in its own folder with its own lockfile; don't let Next
  // pick up a parent directory's lockfile as the workspace root.
  turbopack: { root: path.resolve(".") },
  outputFileTracingRoot: path.resolve("."),
  async headers() {
    return [
      {
        // PGlite's WASM and filesystem bundle are large and immutable per version.
        source: "/pglite/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
