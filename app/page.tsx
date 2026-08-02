"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import GameGrid from "@/components/GameGrid";
import FilterBar, { type Filters } from "@/components/FilterBar";
import { DECADES, DEFAULT_COLLECTION, type DecadeKey } from "@/lib/archive";

export default function HomePage() {
  const [filters, setFilters] = useState<Filters>({
    search: "",
    sort: "popular",
    collection: DEFAULT_COLLECTION,
  });

  const handleChange = useCallback((next: Filters) => setFilters(next), []);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Flash didn&apos;t have to die.
        </h1>
        <p className="max-w-2xl text-zinc-400">
          Adobe pulled the plug on Flash Player in December 2020. The games survived
          anyway — preserved by the Internet Archive and playable here through Ruffle,
          an open-source emulator that runs in your browser. No plugin required.
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          <span>Not sure where to start?</span>
          <Link
            href="/decades"
            className="text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
          >
            Browse the top 30 of each decade
          </Link>
          <span aria-hidden>·</span>
          {(Object.keys(DECADES) as DecadeKey[]).map((key) => (
            <Link
              key={key}
              href={`/decades#${key}`}
              className="text-zinc-400 underline underline-offset-4 hover:text-zinc-200"
            >
              {DECADES[key].label}
            </Link>
          ))}
        </p>
      </section>

      <FilterBar filters={filters} onChange={handleChange} />

      <GameGrid filters={filters} />
    </div>
  );
}
