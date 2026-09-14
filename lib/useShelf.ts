"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameSummary } from "@/lib/archive";

/**
 * Favourites and recently-played, backed entirely by `/api/shelf` — no
 * localStorage involved.
 *
 * This used to read from localStorage first and mirror to the server
 * asynchronously (see git history / CLAUDE.md for why that kept showing an
 * empty shelf: localStorage and cookies are both scoped per origin, so
 * `next dev` on :3000 and the desktop shortcut's `next start` on :3003 were,
 * as far as the browser is concerned, two unrelated sites with two unrelated
 * shelves — and any browser-side storage clear lost the local copy outright
 * regardless of port). The database is the only copy now; TanStack Query
 * (already used elsewhere in this app) owns fetching, caching, and optimistic
 * updates against it.
 *
 * There is still no account system — a device is identified by the same
 * opaque httpOnly cookie as before (`lib/device.ts`), set by the API route on
 * first visit. That cookie is not "local storage" in the sense this module
 * used to rely on: it is server-issued, httpOnly (invisible to page scripts),
 * and merely carries an id — it holds no shelf data itself.
 */

export interface ShelfEntry {
  identifier: string;
  title: string;
  playedAt?: number;
}

interface ShelfState {
  favorites: ShelfEntry[];
  recents: ShelfEntry[];
}

const MAX_RECENTS = 24;
const EMPTY_SHELF: ShelfState = { favorites: [], recents: [] };
/** Stable references — a fresh [] each render would break memoised callbacks. */
const EMPTY_ENTRIES: ShelfEntry[] = [];
const SHELF_QUERY_KEY = ["shelf"] as const;

function sanitizeEntries(value: unknown): ShelfEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ShelfEntry =>
      typeof entry === "object" && entry !== null && typeof (entry as ShelfEntry).identifier === "string"
  );
}

async function fetchShelf(): Promise<ShelfState> {
  const res = await fetch("/api/shelf");
  if (!res.ok) throw new Error(`Failed to load shelf (${res.status})`);
  const data = (await res.json()) as { favorites?: unknown; recents?: unknown };
  return {
    favorites: sanitizeEntries(data.favorites),
    recents: sanitizeEntries(data.recents),
  };
}

async function putShelf(state: ShelfState): Promise<void> {
  const res = await fetch("/api/shelf", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`Failed to save shelf (${res.status})`);
}

function useShelfQuery() {
  return useQuery({
    queryKey: SHELF_QUERY_KEY,
    queryFn: fetchShelf,
    // Small and cheap to refetch; unlike the Archive catalogue queries, there
    // is no reason to treat a stale shelf as acceptable.
    staleTime: 0,
  });
}

/**
 * Applies an updater against whatever the query cache currently holds,
 * optimistically, then persists the result and rolls back on failure.
 *
 * `updater` runs exactly once, inside `onMutate` — `mutationFn` persists
 * whatever `onMutate` already wrote into the cache rather than recomputing
 * it. Calling a *toggle*-shaped updater a second time against its own
 * output undoes it: `onMutate` writes the optimistic "added" state, and if
 * `mutationFn` then reran `updater` against that already-updated cache, the
 * favorite it just added would look present and get toggled straight back
 * off before ever reaching the server. (Found exactly this way: the star
 * flipped and stayed flipped in the UI, but the database kept the old
 * value — a reload showed the entry was never actually added.)
 *
 * Mutating via an updater function (rather than a precomputed next-state
 * object) keeps the returned callback's identity stable across renders —
 * `useMutation`'s `mutate` is stable, so `toggleFavorite`/`recordPlay` don't
 * change either. That matters concretely for `recordPlay`: it runs from a
 * `useEffect` keyed on the callback's identity in `GameStage`, and an
 * updater that closed over a stale `recents` snapshot would make that
 * identity change on every call, re-firing the effect in a loop.
 *
 * Returns `mutate` directly (not the whole `mutation` object, which is a new
 * reference every render) so callers can put it straight in a dependency
 * array without an eslint-disable.
 */
function useShelfMutation() {
  const queryClient = useQueryClient();

  const { mutate } = useMutation({
    mutationFn: async () => {
      const next = queryClient.getQueryData<ShelfState>(SHELF_QUERY_KEY) ?? EMPTY_SHELF;
      await putShelf(next);
      return next;
    },
    onMutate: async (updater: (current: ShelfState) => ShelfState) => {
      await queryClient.cancelQueries({ queryKey: SHELF_QUERY_KEY });
      const previous = queryClient.getQueryData<ShelfState>(SHELF_QUERY_KEY) ?? EMPTY_SHELF;
      queryClient.setQueryData(SHELF_QUERY_KEY, updater(previous));
      return { previous };
    },
    onError: (_error, _updater, context) => {
      if (context) queryClient.setQueryData(SHELF_QUERY_KEY, context.previous);
    },
  });

  return mutate;
}

export function useFavorites() {
  const { data, isLoading, isError } = useShelfQuery();
  const mutate = useShelfMutation();
  const favorites = data?.favorites ?? EMPTY_ENTRIES;

  const isFavorite = useCallback(
    (identifier: string) => favorites.some((entry) => entry.identifier === identifier),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (game: Pick<GameSummary, "identifier" | "title">) => {
      mutate((current) => {
        const exists = current.favorites.some((entry) => entry.identifier === game.identifier);
        return {
          ...current,
          favorites: exists
            ? current.favorites.filter((entry) => entry.identifier !== game.identifier)
            : [{ identifier: game.identifier, title: game.title }, ...current.favorites],
        };
      });
    },
    [mutate]
  );

  // "hydrated" keeps its old name (consumers already gate rendering on it)
  // but now means "the server has answered", not "localStorage was read".
  return { favorites, isFavorite, toggleFavorite, hydrated: !isLoading, isError };
}

export function useRecents() {
  const { data, isLoading, isError } = useShelfQuery();
  const mutate = useShelfMutation();
  const recents = data?.recents ?? EMPTY_ENTRIES;

  const recordPlay = useCallback(
    (game: Pick<GameSummary, "identifier" | "title">) => {
      mutate((current) => {
        const deduped = current.recents.filter((entry) => entry.identifier !== game.identifier);
        return {
          ...current,
          recents: [
            { identifier: game.identifier, title: game.title, playedAt: Date.now() },
            ...deduped,
          ].slice(0, MAX_RECENTS),
        };
      });
    },
    [mutate]
  );

  const clearRecents = useCallback(() => {
    mutate((current) => ({ ...current, recents: [] }));
  }, [mutate]);

  return { recents, recordPlay, clearRecents, hydrated: !isLoading, isError };
}
