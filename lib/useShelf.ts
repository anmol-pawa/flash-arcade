"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { GameSummary } from "@/lib/archive";

/**
 * Favourites and recently-played, persisted in localStorage.
 *
 * There is no account system by design — the arcade is a static front-end over
 * the Internet Archive, so a user's shelf lives entirely on their device.
 *
 * localStorage is an external store, so this is modelled with
 * `useSyncExternalStore` rather than effect-driven state: it gives correct
 * server/client snapshots for free and avoids cascading renders on hydration.
 */

const FAVORITES_KEY = "flash-arcade:favorites";
const RECENTS_KEY = "flash-arcade:recents";
const MAX_RECENTS = 24;

/** Just enough to render a card without re-querying the Archive. */
export interface ShelfEntry {
  identifier: string;
  title: string;
  playedAt?: number;
}

/**
 * The native `storage` event only fires in *other* tabs, so writes broadcast
 * this event to keep every hook instance in this tab consistent too.
 */
const SHELF_EVENT = "flash-arcade:shelf-change";

/** Stable empty array — a fresh [] each call would loop useSyncExternalStore. */
const EMPTY: ShelfEntry[] = [];

function parse(raw: string | null): ShelfEntry[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const entries = parsed.filter(
      (entry): entry is ShelfEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ShelfEntry).identifier === "string"
    );
    return entries.length > 0 ? entries : EMPTY;
  } catch {
    // Corrupt storage — behave as though the shelf were empty.
    return EMPTY;
  }
}

/**
 * `getSnapshot` must return a referentially stable value while the underlying
 * data is unchanged, so parsed results are memoised against the raw string.
 */
const snapshotCache = new Map<string, { raw: string | null; value: ShelfEntry[] }>();

function readSnapshot(key: string): ShelfEntry[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Private mode or blocked storage.
    return EMPTY;
  }

  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.value;

  const value = parse(raw);
  snapshotCache.set(key, { raw, value });
  return value;
}

function write(key: string, entries: ShelfEntry[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Storage full or blocked; the shelf is a convenience, not core function.
  }
  window.dispatchEvent(new Event(SHELF_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(SHELF_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SHELF_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function useShelfStore(key: string): ShelfEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => readSnapshot(key),
    // Server render has no storage; the client swaps in real data after hydration.
    () => EMPTY
  );
}

const noopSubscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards — lets callers
 * avoid flashing "your shelf is empty" before storage has actually been read.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function useFavorites() {
  const favorites = useShelfStore(FAVORITES_KEY);
  const hydrated = useHydrated();

  const isFavorite = useCallback(
    (identifier: string) => favorites.some((entry) => entry.identifier === identifier),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (game: Pick<GameSummary, "identifier" | "title">) => {
      const current = readSnapshot(FAVORITES_KEY);
      const exists = current.some((entry) => entry.identifier === game.identifier);
      write(
        FAVORITES_KEY,
        exists
          ? current.filter((entry) => entry.identifier !== game.identifier)
          : [{ identifier: game.identifier, title: game.title }, ...current]
      );
    },
    []
  );

  return { favorites, isFavorite, toggleFavorite, hydrated };
}

export function useRecents() {
  const recents = useShelfStore(RECENTS_KEY);
  const hydrated = useHydrated();

  const recordPlay = useCallback((game: Pick<GameSummary, "identifier" | "title">) => {
    const current = readSnapshot(RECENTS_KEY);
    const deduped = current.filter((entry) => entry.identifier !== game.identifier);
    write(
      RECENTS_KEY,
      [
        { identifier: game.identifier, title: game.title, playedAt: Date.now() },
        ...deduped,
      ].slice(0, MAX_RECENTS)
    );
  }, []);

  const clearRecents = useCallback(() => write(RECENTS_KEY, []), []);

  return { recents, recordPlay, clearRecents, hydrated };
}
