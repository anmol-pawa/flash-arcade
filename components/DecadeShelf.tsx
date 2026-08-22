"use client";

import Link from "next/link";
import GameCard from "@/components/GameCard";
import { DECADES, type DecadeKey, type GameSummary } from "@/lib/archive";

/**
 * One decade's ranked shelf. Client-side because the cards carry the favourite
 * toggle, which reads localStorage.
 */
export default function DecadeShelf({
  decade,
  games,
  total,
  failed,
}: {
  decade: DecadeKey;
  games: GameSummary[];
  /** Everything the Archive has for this era, not just the shown top slice. */
  total: number;
  failed: boolean;
}) {
  const { label, from, to } = DECADES[decade];

  return (
    <section id={decade} className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800/80 pb-2">
        <h2 className="text-xl font-semibold text-zinc-100">{label}</h2>
        <p className="text-xs text-zinc-600">
          {from}–{to} · ranked by plays
        </p>
      </div>

      {/* Past the top 30, hand off to the main grid rather than paginating here:
          it already has infinite scroll, and search and genre stay available. */}
      <div className="flex justify-end">
        {!failed && total > games.length ? (
          <Link
            href={`/?era=${decade}&collection=everything`}
            className="text-xs text-emerald-400 underline underline-offset-4 transition hover:text-emerald-300"
          >
            Browse all {total.toLocaleString()} from the {label} →
          </Link>
        ) : null}
      </div>

      {failed ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/5 p-6 text-sm text-red-300">
          Couldn&apos;t load this decade from the Internet Archive.
        </p>
      ) : games.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
          Nothing from this decade carries a usable year in the Archive&apos;s data.
        </p>
      ) : (
        <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {games.map((game, index) => (
            <li key={game.identifier} className="relative">
              <span
                className="absolute -left-1 -top-1 z-10 grid h-6 w-6 place-items-center rounded-full bg-zinc-950/90 text-xs font-semibold text-emerald-400 ring-1 ring-zinc-800"
                aria-hidden
              >
                {index + 1}
              </span>
              <GameCard game={game} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
