"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import GameCard from "@/components/GameCard";
import type { CollectionKey, SearchResult, SortKey } from "@/lib/archive";

async function fetchPage(
  search: string,
  sort: SortKey,
  collection: CollectionKey,
  page: number,
  signal?: AbortSignal
): Promise<SearchResult> {
  const params = new URLSearchParams({
    q: search,
    sort,
    collection,
    page: String(page),
  });
  const res = await fetch(`/api/search?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error("Couldn't reach the Internet Archive. Try again in a moment.");
  }
  return res.json();
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60">
      <div className="aspect-[4/3] animate-pulse bg-zinc-800/60" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
        <div className="h-2 w-1/3 animate-pulse rounded bg-zinc-800/70" />
      </div>
    </div>
  );
}

export default function GameGrid({
  search,
  sort,
  collection,
}: {
  search: string;
  sort: SortKey;
  collection: CollectionKey;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery({
    queryKey: ["games", search, sort, collection],
    queryFn: ({ pageParam, signal }) =>
      fetchPage(search, sort, collection, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-500/40 bg-red-500/5 p-6 text-center text-sm text-red-300">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
    );
  }

  const games = data?.pages.flatMap((page) => page.games) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  if (games.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-10 text-center">
        <p className="text-zinc-300">Nothing matched that search.</p>
        <p className="mt-2 text-sm text-zinc-500">
          Try a shorter title, or a studio name like{" "}
          <span className="text-zinc-400">Armor Games</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        {/* "games" is wrong once animations and toys are in scope. */}
        {total.toLocaleString()} {collection === "games" ? "game" : "item"}
        {total === 1 ? "" : "s"}
        {search ? ` matching “${search}”` : " preserved and playable"}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {games.map((game) => (
          <GameCard key={game.identifier} game={game} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-px" aria-hidden />

      {isFetchingNextPage ? (
        <p className="py-4 text-center text-sm text-zinc-500">Loading more…</p>
      ) : null}
      {!hasNextPage && games.length > 0 ? (
        <p className="py-4 text-center text-sm text-zinc-600">
          That&apos;s every match.
        </p>
      ) : null}
    </div>
  );
}
