"use client";

import GameCard from "@/components/GameCard";
import type { GameSummary } from "@/lib/archive";

/**
 * "More like this" under the player. Client-side because the cards carry the
 * favourite toggle, which reads localStorage.
 */
export default function RelatedGames({
  games,
  reason,
}: {
  games: GameSummary[];
  reason: string;
}) {
  if (games.length === 0) return null;

  return (
    <section className="space-y-4 border-t border-zinc-800/80 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-100">More like this</h2>
        {/* Say why these were picked — the matching is fuzzy, and pretending
            otherwise would make a bad suggestion look like a bug. */}
        <p className="text-xs text-zinc-600">{reason}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {games.map((game) => (
          <GameCard key={game.identifier} game={game} />
        ))}
      </div>
    </section>
  );
}
