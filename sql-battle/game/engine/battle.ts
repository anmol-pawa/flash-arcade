/**
 * The battle state machine: a pure reducer with no rendering code.
 *
 *   intro → round ⇄ (cast: hit / miss / timeout) → debrief → round … → victory | defeat
 */
import type { DamageResult } from "./damage";

export type Phase = "loading" | "intro" | "round" | "casting" | "debrief" | "victory" | "defeat";

export interface Side {
  name: string;
  hp: number;
  maxHp: number;
}

export interface BattleStats {
  casts: number;
  hits: number;
  misses: number;
  crits: number;
  hints: number;
  bestCombo: number;
  damageDealt: number;
  damageTaken: number;
}

export interface BattleState {
  phase: Phase;
  round: number;
  missionIds: string[];
  missionIndex: number;
  player: Side;
  foe: Side;
  focus: number;
  hintsThisRound: number;
  attempts: number;
  scouted: boolean;
  timeLeft: number;
  timeTotal: number;
  last?: { kind: "hit"; dmg: DamageResult } | { kind: "miss"; dmg: number } | { kind: "timeout"; dmg: number };
  stats: BattleStats;
}

export type Action =
  | { type: "load"; missionIds: string[]; player: Side; foe: Side }
  | { type: "begin-round"; time: number }
  | { type: "tick"; dt: number; paused?: boolean }
  | { type: "cast" }
  | { type: "hit"; dmg: DamageResult; finisher: boolean; clamp: boolean }
  | { type: "damage"; target: "player" | "foe"; dmg: number }
  | { type: "wave"; foe: Side; heal: number }
  | { type: "miss"; dmg: number }
  | { type: "timeout"; dmg: number }
  | { type: "hint"; cost: number }
  | { type: "scout"; cost: number }
  | { type: "next" }
  | { type: "resolve-miss" }
  | { type: "end"; won: boolean };

export const MAX_FOCUS = 100;

export const emptyStats = (): BattleStats => ({ casts: 0, hits: 0, misses: 0, crits: 0, hints: 0, bestCombo: 0, damageDealt: 0, damageTaken: 0 });

export function initialState(): BattleState {
  return {
    phase: "loading",
    round: 0,
    missionIds: [],
    missionIndex: 0,
    player: { name: "", hp: 100, maxHp: 100 },
    foe: { name: "", hp: 100, maxHp: 100 },
    focus: MAX_FOCUS,
    hintsThisRound: 0,
    attempts: 0,
    scouted: false,
    timeLeft: 0,
    timeTotal: 0,
    stats: emptyStats(),
  };
}

export function reducer(s: BattleState, a: Action): BattleState {
  switch (a.type) {
    case "load":
      return { ...initialState(), phase: "intro", missionIds: a.missionIds, player: a.player, foe: a.foe };
    case "begin-round":
      return { ...s, phase: "round", round: s.round + 1, hintsThisRound: 0, attempts: 0, scouted: false, timeLeft: a.time, timeTotal: a.time, last: undefined };
    case "tick": {
      if (s.phase !== "round" || a.paused) return s;
      return { ...s, timeLeft: Math.max(0, s.timeLeft - a.dt) };
    }
    case "cast":
      return { ...s, phase: "casting", attempts: s.attempts + 1, stats: { ...s.stats, casts: s.stats.casts + 1 } };
    case "hit": {
      const remaining = s.missionIds.length - s.missionIndex - 1;
      let dmg = a.dmg.damage;
      // Keep the foe alive until the last mission, then guarantee the KO.
      if (a.clamp && !a.finisher && remaining > 0) dmg = Math.min(dmg, Math.max(1, s.foe.hp - remaining * 8));
      if (a.clamp && (a.finisher || remaining === 0)) dmg = Math.max(dmg, s.foe.hp);
      const hp = Math.max(0, s.foe.hp - dmg);
      return {
        ...s,
        phase: "debrief",
        foe: { ...s.foe, hp },
        focus: Math.min(MAX_FOCUS, s.focus + 15),
        last: { kind: "hit", dmg: { ...a.dmg, damage: dmg } },
        stats: {
          ...s.stats,
          hits: s.stats.hits + 1,
          crits: s.stats.crits + (a.dmg.crit ? 1 : 0),
          bestCombo: Math.max(s.stats.bestCombo, a.dmg.combo),
          damageDealt: s.stats.damageDealt + a.dmg.damage,
        },
      };
    }
    case "miss":
    case "timeout": {
      const hp = Math.max(0, s.player.hp - a.dmg);
      return {
        ...s,
        phase: hp <= 0 ? "defeat" : "casting",
        player: { ...s.player, hp },
        last: { kind: a.type, dmg: a.dmg },
        timeLeft: a.type === "timeout" ? s.timeTotal : s.timeLeft,
        stats: { ...s.stats, misses: s.stats.misses + 1, damageTaken: s.stats.damageTaken + a.dmg },
      };
    }
    case "damage": {
      const side = s[a.target];
      const hp = Math.max(0, side.hp - a.dmg);
      const stats =
        a.target === "player"
          ? { ...s.stats, damageTaken: s.stats.damageTaken + a.dmg }
          : { ...s.stats, damageDealt: s.stats.damageDealt + a.dmg };
      return { ...s, [a.target]: { ...side, hp }, stats };
    }
    case "wave":
      return { ...s, phase: "intro", foe: a.foe, player: { ...s.player, hp: Math.min(s.player.maxHp, s.player.hp + a.heal) }, missionIndex: s.missionIndex + 1 };
    case "resolve-miss":
      return s.phase === "casting" ? { ...s, phase: "round" } : s;
    case "end":
      return { ...s, phase: a.won ? "victory" : "defeat" };
    case "hint":
      if (s.focus < a.cost) return s;
      return { ...s, focus: s.focus - a.cost, hintsThisRound: s.hintsThisRound + 1, stats: { ...s.stats, hints: s.stats.hints + 1 } };
    case "scout":
      if (s.focus < a.cost || s.scouted) return s;
      return { ...s, focus: s.focus - a.cost, scouted: true };
    case "next": {
      if (s.foe.hp <= 0) return { ...s, phase: "victory" };
      return { ...s, missionIndex: s.missionIndex + 1 };
    }
  }
}
