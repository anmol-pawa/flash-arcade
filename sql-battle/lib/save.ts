"use client";
/**
 * Progress lives in localStorage (per browser). Everything is wrapped in
 * try/catch so private windows and blocked storage just mean "no saves".
 */
import { useSyncExternalStore } from "react";
import type { Dialect } from "./dialect/lint";

export interface Settings {
  volume: number;
  music: boolean;
  reducedMotion: boolean;
  zen: boolean; // no round timer
}

export interface SaveData {
  version: 1;
  dialect: Dialect;
  xp: number;
  stars: Record<number, number>; // chapter → best stars
  cleared: string[]; // mission ids won at least once
  codex: string[]; // unlocked codex ids
  quizzes: string[]; // codex ids whose quiz was answered correctly
  arenaBest: number;
  settings: Settings;
  seenIntro: boolean;
}

const KEY = "query-clash-save-v1";

const DEFAULT: SaveData = {
  version: 1,
  dialect: "postgres",
  xp: 0,
  stars: {},
  cleared: [],
  codex: ["select", "where", "null"],
  quizzes: [],
  arenaBest: 0,
  settings: { volume: 0.6, music: true, reducedMotion: false, zen: false },
  seenIntro: false,
};

let cache: SaveData | null = null;
const listeners = new Set<() => void>();

function load(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULT, ...JSON.parse(raw), settings: { ...DEFAULT.settings, ...(JSON.parse(raw).settings ?? {}) } } : { ...DEFAULT };
  } catch {
    cache = { ...DEFAULT };
  }
  return cache!;
}

export function getSave(): SaveData {
  return typeof window === "undefined" ? DEFAULT : load();
}

export function updateSave(fn: (s: SaveData) => SaveData) {
  cache = fn(load());
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export function resetSave() {
  updateSave(() => ({ ...DEFAULT }));
}

export function useSave(): SaveData {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => DEFAULT,
  );
}

export function unlockedChapters(s: SaveData): number {
  // chapter n+1 unlocks when chapter n has at least one star
  let n = 1;
  while (s.stars[n]) n++;
  return Math.min(n, 10);
}

export const level = (xp: number) => Math.floor(Math.sqrt(xp / 120)) + 1;
