"use client";

import Link from "next/link";
import { coverUrl } from "@/lib/archive";
import { useFavorites, useRecents, type ShelfEntry } from "@/lib/useShelf";

function ShelfRow({
  title,
  emptyMessage,
  entries,
  action,
}: {
  title: string;
  emptyMessage: string;
  entries: ShelfEntry[];
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        {entries.length > 0 ? action : null}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {entries.map((entry) => (
            <Link
              key={entry.identifier}
              href={`/play/${encodeURIComponent(entry.identifier)}`}
              className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 transition hover:border-emerald-500/60"
            >
              <div className="aspect-[4/3] overflow-hidden bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl(entry.identifier)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>
              <div className="p-3">
                <h3 className="truncate text-sm font-medium text-zinc-100" title={entry.title}>
                  {entry.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function FavoritesPage() {
  const { favorites, hydrated } = useFavorites();
  const { recents, clearRecents } = useRecents();

  // Avoid rendering "empty shelf" copy before localStorage has been read.
  if (!hydrated) {
    return <p className="text-sm text-zinc-500">Loading your shelf…</p>;
  }

  return (
    <div className="space-y-12">
      <ShelfRow
        title="Favourites"
        entries={favorites}
        emptyMessage="No favourites yet — tap the ☆ on any game to keep it here."
      />
      <ShelfRow
        title="Recently played"
        entries={recents}
        emptyMessage="Nothing played yet. Your history stays on this device."
        action={
          <button
            type="button"
            onClick={clearRecents}
            className="text-sm text-zinc-500 transition hover:text-zinc-300"
          >
            Clear
          </button>
        }
      />
    </div>
  );
}
