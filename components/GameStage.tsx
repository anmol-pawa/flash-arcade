"use client";

import { useEffect } from "react";
import RufflePlayer from "@/components/RufflePlayer";
import {
  detailsUrl,
  proxyAssetUrl,
  proxyBaseUrl,
  type GameDetail,
} from "@/lib/archive";
import { useFavorites, useRecents } from "@/lib/useShelf";

/**
 * Client shell around the emulator: owns the shelf side effects (recently
 * played, favourites) so the play page itself can stay a server component.
 */
export default function GameStage({ game }: { game: GameDetail }) {
  const { recordPlay } = useRecents();
  const { isFavorite, toggleFavorite, hydrated } = useFavorites();

  useEffect(() => {
    recordPlay({ identifier: game.identifier, title: game.title });
  }, [game.identifier, game.title, recordPlay]);

  const favorited = hydrated && isFavorite(game.identifier);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          {game.title}
        </h1>
        <button
          type="button"
          onClick={() => toggleFavorite(game)}
          aria-pressed={favorited}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
        >
          <span className={favorited ? "text-amber-400" : "text-zinc-500"} aria-hidden>
            {favorited ? "★" : "☆"}
          </span>{" "}
          {favorited ? "In your shelf" : "Add to shelf"}
        </button>
      </div>

      <RufflePlayer
        // Remount cleanly when navigating between games.
        key={game.identifier}
        swfUrl={proxyAssetUrl(game.identifier, game.swfFilename)}
        baseUrl={proxyBaseUrl(game.identifier)}
        title={game.title}
        width={game.width}
        height={game.height}
        archiveUrl={detailsUrl(game.identifier)}
      />
    </div>
  );
}
