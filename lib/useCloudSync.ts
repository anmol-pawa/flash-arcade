"use client";

import { useEffect } from "react";

/**
 * Mirrors the browser's Ruffle save games into the server database.
 *
 * The shelf (favourites/recently-played) no longer goes through here — it
 * reads and writes `/api/shelf` directly via TanStack Query in
 * `lib/useShelf.ts`, with no localStorage copy to sync. Game saves are
 * different: Ruffle itself persists SharedObjects to localStorage (see
 * `lib/ruffleSaves.ts`), which this app doesn't control, so mirroring those
 * to the database is still the right shape here.
 *
 * Sync is deliberately additive. Nothing here deletes server state that the
 * browser happens not to have, because "this browser has no copy" and "the
 * user removed it" look identical from here, and the failure modes are not
 * symmetric: a wrongly-kept entry is a minor annoyance, a wrongly-deleted
 * save is lost progress.
 */

const SAVE_POLL_MS = 15_000;

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

    void restoreSaves();

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
      window.clearInterval(saveTimer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);
}
