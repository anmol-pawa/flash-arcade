import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Lets phones install Query Clash to the home screen as a full-screen app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Query Clash — SQL battle arena",
    short_name: "Query Clash",
    description: "A 1v1 battle game that teaches SQL in PostgreSQL and Oracle.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#07050f",
    theme_color: "#07050f",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
