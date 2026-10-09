import type { NextConfig } from "next";
import path from "node:path";

/**
 * Two build modes:
 *  - default (`npm run build`): a normal Next.js app for Vercel / `next start`.
 *  - static (`npm run build:pages`): STATIC_EXPORT=1 writes plain files to out/
 *    for static hosts such as GitHub Pages. BASE_PATH sets the sub-path the
 *    site is served from (e.g. "/flash-arcade").
 */
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // This app lives in its own folder with its own lockfile; don't let Next
  // pick up a parent directory's lockfile as the workspace root.
  turbopack: { root: path.resolve(".") },
  outputFileTracingRoot: path.resolve("."),
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_PWA: staticExport ? "1" : "" },
  ...(staticExport
    ? {
        output: "export",
        basePath: basePath || undefined,
        // /campaign/ → campaign/index.html, which every static host serves
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        async headers() {
          return [
            {
              // PGlite's WASM and filesystem bundle are large and immutable per version.
              source: "/pglite/:file*",
              headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
            },
          ];
        },
      }),
};

export default nextConfig;
