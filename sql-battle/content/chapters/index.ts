import type { Chapter, Mission } from "../types";
import { CHAPTERS_1_5 } from "./part1";
import { CHAPTERS_6_10 } from "./part2";

export const CHAPTERS: Chapter[] = [...CHAPTERS_1_5, ...CHAPTERS_6_10];

export const ALL_MISSIONS: (Mission & { chapter: number })[] = CHAPTERS.flatMap((c) => c.missions.map((m) => ({ ...m, chapter: c.n })));

export function chapterByNumber(n: number): Chapter | undefined {
  return CHAPTERS.find((c) => c.n === n);
}

/** Seconds on the clock for a mission. */
export function missionTime(m: Mission, chapter: number): number {
  return m.time ?? 150 + chapter * 20;
}
