"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Player volume, remembered across games and tabs.
 *
 * Modelled with `useSyncExternalStore` for the same reason as the shelf:
 * localStorage is an external store, so this gives a correct server snapshot
 * (the default level) without a hydration mismatch or a setState-in-effect.
 */

const KEY = "flash-arcade:volume";
const EVENT = "flash-arcade:volume-change";
const DEFAULT_VOLUME = 1;

function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}

let cachedRaw: string | null = null;
let cachedValue = DEFAULT_VOLUME;

function readVolume(): number {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return DEFAULT_VOLUME;
  }
  // getSnapshot must be referentially stable while the data is unchanged.
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = raw === null ? DEFAULT_VOLUME : clamp(Number(raw));
  return cachedValue;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useVolume(): [number, (next: number) => void] {
  const volume = useSyncExternalStore(subscribe, readVolume, () => DEFAULT_VOLUME);

  const setVolume = useCallback((next: number) => {
    try {
      window.localStorage.setItem(KEY, String(clamp(next)));
    } catch {
      // Storage blocked; the level still applies for this session below.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [volume, setVolume];
}
