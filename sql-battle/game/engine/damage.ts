/**
 * Damage model. A correct query deals base damage scaled by:
 *   combo  — distinct advanced concepts used in one query
 *   speed  — time left on the clock
 *   plan   — planner cost vs the reference answer (EXPLAIN)
 *   focus  — hints spent this round
 * First-try, hint-free, fast answers crit.
 */
import { AttackInfo, Concept, attackFor, comboCount } from "@/lib/dialect/concepts";

export interface DamageInput {
  concepts: Concept[];
  secondsLeft: number;
  totalSeconds: number;
  cost?: { player: number; reference: number };
  hintsUsed: number;
  attempts: number;
  base?: number;
}

export interface DamageResult {
  damage: number;
  crit: boolean;
  attack: AttackInfo;
  combo: number;
  mult: { combo: number; speed: number; plan: number; hints: number; crit: number };
  planLabel: string;
}

export function planMultiplier(cost?: { player: number; reference: number }): { mult: number; label: string } {
  if (!cost || !isFinite(cost.player) || !isFinite(cost.reference) || cost.reference <= 0) return { mult: 1, label: "" };
  const ratio = cost.player / cost.reference;
  if (ratio <= 1.05) return { mult: 1.2, label: "Optimal plan" };
  if (ratio <= 1.5) return { mult: 1, label: "Efficient plan" };
  if (ratio <= 3) return { mult: 0.9, label: "Costly plan" };
  return { mult: 0.75, label: "Heavy plan" };
}

export function computeDamage(i: DamageInput): DamageResult {
  const base = i.base ?? 100;
  const combo = comboCount(i.concepts);
  const comboM = 1 + 0.1 * Math.min(combo, 6);
  const speedM = 1 + 0.5 * Math.max(0, Math.min(1, i.secondsLeft / Math.max(1, i.totalSeconds)));
  const plan = planMultiplier(i.cost);
  const hintsM = Math.max(0.55, 1 - 0.15 * i.hintsUsed);
  const crit = i.attempts === 1 && i.hintsUsed === 0 && speedM >= 1.3;
  const critM = crit ? 1.5 : 1;
  const damage = Math.round(base * comboM * speedM * plan.mult * hintsM * critM);
  return {
    damage,
    crit,
    attack: attackFor(i.concepts),
    combo,
    mult: { combo: comboM, speed: speedM, plan: plan.mult, hints: hintsM, crit: critM },
    planLabel: plan.label,
  };
}

/** Damage the boss deals when the player misses or runs out of time. */
export function counterDamage(chapter: number, timeout: boolean): number {
  return Math.round((timeout ? 16 : 9) + chapter * 1.2);
}

export function starsFor(hpPct: number, hints: number): 1 | 2 | 3 {
  if (hpPct >= 0.7 && hints <= 2) return 3;
  if (hpPct >= 0.35) return 2;
  return 1;
}
