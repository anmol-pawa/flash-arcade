"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FilterBar, { type Filters } from "@/components/FilterBar";
import GameGrid from "@/components/GameGrid";
import {
  DEFAULT_COLLECTION,
  isCollectionKey,
  isDecadeKey,
  isGenreKey,
} from "@/lib/archive";

const VALID_SORTS = ["popular", "title", "recent"] as const;

/**
 * The URL is the single source of truth for filters, so a filtered view can be
 * shared or bookmarked, and going back from a game returns to the same shelf
 * rather than a reset grid.
 */
function parseFilters(params: URLSearchParams): Filters {
  const collection = params.get("collection") ?? "";
  const sort = params.get("sort") ?? "";
  const genre = params.get("genre") ?? "";
  const decade = params.get("era") ?? "";

  return {
    search: params.get("q") ?? "",
    sort: (VALID_SORTS as readonly string[]).includes(sort)
      ? (sort as Filters["sort"])
      : "popular",
    collection: isCollectionKey(collection) ? collection : DEFAULT_COLLECTION,
    genre: isGenreKey(genre) ? genre : undefined,
    decade: isDecadeKey(decade) ? decade : undefined,
  };
}

/** Only non-default values are written, keeping shared links readable. */
function serializeFilters(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.decade) params.set("era", filters.decade);
  if (filters.sort !== "popular") params.set("sort", filters.sort);
  if (filters.collection !== DEFAULT_COLLECTION) {
    params.set("collection", filters.collection);
  }
  return params.toString();
}

export default function ArcadeBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const handleChange = useCallback(
    (next: Filters) => {
      const query = serializeFilters(next);
      // `replace`, not `push`: a debounced search box would otherwise stack a
      // history entry per keystroke and bury the page the user came from.
      // `scroll: false` keeps the grid still while filters change.
      router.replace(query ? `/?${query}` : "/", { scroll: false });
    },
    [router]
  );

  return (
    <>
      <FilterBar filters={filters} onChange={handleChange} />
      <GameGrid filters={filters} />
    </>
  );
}
