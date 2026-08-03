"use client";

/**
 * Helpers for the SharedObject data Ruffle writes on a game's behalf.
 *
 * Flash games saved progress via SharedObject ("Flash cookies"). Ruffle
 * implements that on top of localStorage, keyed as:
 *
 *     {hostname}/{swf directory path}/{save name}
 *
 * Nothing here writes save data — the emulator owns that. We only look it up so
 * the UI can tell the player their progress is being kept, and let them clear it.
 */

/** Directory portion of a SWF path, which is what Ruffle scopes saves to. */
function swfDirectory(swfPathname: string): string {
  return swfPathname.split("/").slice(1, -1).join("/");
}

/**
 * Find the save entries belonging to one movie. Mirrors the matching Ruffle
 * itself uses when deciding whether a stored save applies to the loaded SWF.
 */
export function findSaveKeys(swfPathname: string): string[] {
  if (typeof window === "undefined") return [];

  const directory = swfDirectory(swfPathname);
  if (!directory) return [];

  const host = window.location.hostname;
  const keys: string[] = [];

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(`${host}/`)) continue;
      // Drop the hostname and the save name to recover the SWF directory.
      const middle = key.split("/").slice(1, -1).join("/");
      if (middle && middle === directory) keys.push(key);
    }
  } catch {
    // Storage blocked (private mode); treat as "no saves".
    return [];
  }

  return keys;
}

export function clearSaves(swfPathname: string): number {
  const keys = findSaveKeys(swfPathname);
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing useful to do; the count below reflects the attempt.
    }
  }
  return keys.length;
}

/** Total bytes of stored save data, for a rough "how much progress" readout. */
export function saveSize(swfPathname: string): number {
  return findSaveKeys(swfPathname).reduce((total, key) => {
    try {
      return total + (window.localStorage.getItem(key)?.length ?? 0);
    } catch {
      return total;
    }
  }, 0);
}
