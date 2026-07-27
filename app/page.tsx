"use client";

import { useState } from "react";
import GameGrid from "@/components/GameGrid";
import SearchBar from "@/components/SearchBar";
import { DEFAULT_COLLECTION, type CollectionKey, type SortKey } from "@/lib/archive";

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [collection, setCollection] = useState<CollectionKey>(DEFAULT_COLLECTION);

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
      </section>

      <SearchBar
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        collection={collection}
        onCollectionChange={setCollection}
      />

      <GameGrid search={search} sort={sort} collection={collection} />
    </div>
  );
}
