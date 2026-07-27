"use client";

import Link from "next/link";
import { coverUrl, type GameSummary } from "@/lib/archive";
import { useFavorites } from "@/lib/useShelf";

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M plays`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k plays`;
  return `${count} plays`;
}

export default function GameCard({ game }: { game: GameSummary }) {
  const { isFavorite, toggleFavorite, hydrated } = useFavorites();
  const favorited = hydrated && isFavorite(game.identifier);

  return (
    <div className="group relative">
      <Link
        href={`/play/${encodeURIComponent(game.identifier)}`}
        className="block overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 transition hover:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <div className="aspect-[4/3] overflow-hidden bg-zinc-950">
          {/* Archive thumbnails are arbitrary remote images across thousands of
              items; next/image optimisation would add cost with no real gain. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl(game.identifier)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </div>
        <div className="p-3">
          <h3 className="truncate text-sm font-medium text-zinc-100" title={game.title}>
            {game.title}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {formatDownloads(game.downloads)}
            {game.year ? ` · ${game.year}` : ""}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggleFavorite(game)}
        aria-label={favorited ? `Remove ${game.title} from favourites` : `Add ${game.title} to favourites`}
        aria-pressed={favorited}
        className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-lg leading-none backdrop-blur transition hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <span className={favorited ? "text-amber-400" : "text-zinc-500"} aria-hidden>
          {favorited ? "★" : "☆"}
        </span>
      </button>
    </div>
  );
}
