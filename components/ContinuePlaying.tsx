"use client";

import Link from "next/link";
import { coverUrl } from "@/lib/archive";
import { useRecents } from "@/lib/useShelf";

const MAX_SHOWN = 6;

/**
 * "Continue playing" shelf for the home page.
 *
 * Renders nothing until localStorage has been read, and nothing when there is
 * no history — a first-time visitor should see the library, not an empty rail
 * explaining what would go here.
 */
export default function ContinuePlaying() {
  const { recents, hydrated } = useRecents();

  if (!hydrated || recents.length === 0) return null;

  const shown = recents.slice(0, MAX_SHOWN);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Continue playing
        </h2>
        {recents.length > MAX_SHOWN ? (
          <Link
            href="/favorites"
            className="text-xs text-zinc-500 underline underline-offset-4 transition hover:text-zinc-300"
          >
            All {recents.length}
          </Link>
        ) : null}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {shown.map((entry) => (
          <Link
            key={entry.identifier}
            href={`/play/${encodeURIComponent(entry.identifier)}`}
            className="group w-36 shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 transition hover:border-emerald-500/60"
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
            <p
              className="truncate px-2.5 py-2 text-xs text-zinc-300"
              title={entry.title}
            >
              {entry.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
