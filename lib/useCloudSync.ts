"use client";

import { useEffect } from "react";
import {
  FAVORITES_KEY,
  RECENTS_KEY,
  SHELF_EVENT,
  type ShelfEntry,
} from "@/lib/useShelf";

/**
 * Mirrors the browser's shelf and game saves into the server database.
 *
 * localStorage stays the fast path the UI reads from; the database is the copy
 * that survives the browser clearing site data for the origin, which is how a
 * shelf could previously vanish between visits with nothing wrong in the app.
 *
 * Sync is deliberately additive. Nothing here deletes server state that the
 * browser happens not to have, because "this browser has no copy" and "the user
 * removed it" look identical from here, and the failure modes are not
 * symmetric: a wrongly-kept entry is a minor annoyance, a wrongly-deleted save
 * is lost progress.
 */

const PUSH_DEBOUNCE_MS = 1_500;
const SAVE_POLL_MS = 15_000;
const MAX_RECENTS = 24;

function readLocal(key: string): ShelfEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ShelfEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as ShelfEntry).identifier === "string"
    );
  } catch {
    return [];
  }
}

function writeLocal(key: string, entries: ShelfEntry[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Storage blocked; the server copy is still authoritative next visit.
  }
}

/** Union by identifier, local first so the user's own ordering survives. */
function mergeEntries(local: ShelfEntry[], remote: ShelfEntry[]): ShelfEntry[] {
  const byId = new Map<string, ShelfEntry>();
  for (const entry of [...local, ...remote]) {
    const existing = byId.get(entry.identifier);
    if (!existing) {
      byId.set(entry.identifier, entry);
      continue;
    }
    // Same game on both sides: keep whichever was played more recently.
    if ((entry.playedAt ?? 0) > (existing.playedAt ?? 0)) {
      byId.set(entry.identifier, entry);
    }
  }
  return [...byId.values()];
}

function ruffleSaveKeys(): string[] {
  const prefix = `${window.location.hostname}/`;
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

function collectSaves(): Record<string, string> {
  const saves: Record<string, string> = {};
  for (const key of ruffleSaveKeys()) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) saves[key] = value;
    } catch {
      // Skip unreadable entries rather than aborting the whole sync.
    }
  }
  return saves;
}

/**
 * Runs once for the app. Mounted from the client Providers tree so it covers
 * every route without each page having to opt in.
 */
export function useCloudSync(): void {
  useEffect(() => {
    let cancelled = false;
    let pushTimer: number | undefined;

    const pushShelf = async () => {
      const body = {
        favorites: readLocal(FAVORITES_KEY),
        recents: readLocal(RECENTS_KEY),
      };
      try {
        await fetch("/api/shelf", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // Offline or server down. The browser copy is unaffected, and the next
        // change pushes again — nothing to report to the user.
      }
    };

    const schedulePush = () => {
      if (pushTimer !== undefined) window.clearTimeout(pushTimer);
      pushTimer = window.setTimeout(() => {
        if (!cancelled) void pushShelf();
      }, PUSH_DEBOUNCE_MS);
    };

    const pullThenPush = async () => {
      try {
        const res = await fetch("/api/shelf");
        if (!res.ok || cancelled) return;
        const remote = (await res.json()) as {
          favorites?: ShelfEntry[];
          recents?: ShelfEntry[];
        };
        if (cancelled) return;

        const favorites = mergeEntries(
          readLocal(FAVORITES_KEY),
          Array.isArray(remote.favorites) ? remote.favorites : []
        );
        const recents = mergeEntries(
          readLocal(RECENTS_KEY),
          Array.isArray(remote.recents) ? remote.recents : []
        )
          .sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0))
          .slice(0, MAX_RECENTS);

        writeLocal(FAVORITES_KEY, favorites);
        writeLocal(RECENTS_KEY, recents);
        // Tell the live hooks their store changed, so a restored shelf appears
        // without a reload.
        window.dispatchEvent(new Event(SHELF_EVENT));
      } catch {
        // Leave the local copy alone; it is still perfectly usable.
      }
      if (!cancelled) await pushShelf();
    };

    const restoreSaves = async () => {
      try {
        const res = await fetch("/api/saves");
        if (!res.ok || cancelled) return;
        const { saves } = (await res.json()) as { saves?: Record<string, string> };
        if (!saves || cancelled) return;

        for (const [key, payload] of Object.entries(saves)) {
          // Only fill gaps. Overwriting a key the browser already holds could
          // replace progress made since the last upload with an older copy.
          if (window.localStorage.getItem(key) === null) {
            try {
              window.localStorage.setItem(key, payload);
            } catch {
              break; // Quota exhausted; stop rather than thrash.
            }
          }
        }
      } catch {
        // Nothing restored; games simply start from whatever is local.
      }
    };

    const pushSaves = async () => {
      const saves = collectSaves();
      if (Object.keys(saves).length === 0) return;
      try {
        await fetch("/api/saves", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ saves }),
        });
      } catch {
        // Retried on the next tick.
      }
    };

    void pullThenPush();
    void restoreSaves();

    window.addEventListener(SHELF_EVENT, schedulePush);
    const saveTimer = window.setInterval(() => {
      if (!cancelled) void pushSaves();
    }, SAVE_POLL_MS);
    // Catch progress made right before the tab closes.
    const onHide = () => {
      if (document.visibilityState === "hidden") void pushSaves();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      cancelled = true;
      if (pushTimer !== undefined) window.clearTimeout(pushTimer);
      window.clearInterval(saveTimer);
      window.removeEventListener(SHELF_EVENT, schedulePush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);
}
