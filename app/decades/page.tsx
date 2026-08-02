import type { Metadata } from "next";
import { Suspense } from "react";
import {
  DECADES,
  searchGames,
  type DecadeKey,
  type GameSummary,
} from "@/lib/archive";
import DecadeShelf from "@/components/DecadeShelf";

export const metadata: Metadata = {
  title: "Top 30 by decade — Flash Arcade",
  description:
    "The 30 most-played preserved Flash games from each decade, 1995 through today.",
};

// The Archive's catalogue barely moves, so these lists are prerendered rather
// than rebuilt per request. Note the effective window is the 5 minutes that
// `searchGames` sets on its own fetch — Next takes the shorter of the two — so
// raising this number alone would not lengthen the cache.
export const revalidate = 86_400;

const TOP_N = 30;

async function DecadeSection({ decade }: { decade: DecadeKey }) {
  let games: GameSummary[] = [];
  let failed = false;

  try {
    const result = await searchGames({
      collection: "everything",
      decade,
      sort: "popular",
      rows: TOP_N,
      page: 1,
    });
    games = result.games;
  } catch {
    failed = true;
  }

  return <DecadeShelf decade={decade} games={games} failed={failed} />;
}

function ShelfSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-32 animate-pulse rounded bg-zinc-800" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="aspect-[4/3] animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/60"
          />
        ))}
      </div>
    </div>
  );
}

export default function DecadesPage() {
  const decades = Object.keys(DECADES) as DecadeKey[];

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Top 30 by decade
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          The most-played preserved items from each era, ranked by download count.
          Only about half the library carries a usable year, so treat these as a
          well-stocked shelf rather than a definitive chart.
        </p>
        <nav className="flex flex-wrap gap-2 pt-1">
          {decades.map((key) => (
            <a
              key={key}
              href={`#${key}`}
              className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 transition hover:border-emerald-500/60 hover:text-emerald-300"
            >
              {DECADES[key].label}
            </a>
          ))}
        </nav>
      </section>

      {decades.map((key) => (
        // Each decade streams in on its own so one slow Archive call doesn't
        // hold up the whole page.
        <Suspense key={key} fallback={<ShelfSkeleton />}>
          <DecadeSection decade={key} />
        </Suspense>
      ))}
    </div>
  );
}
