import type { Dialect } from "@/lib/dialect/lint";

export type { Dialect };

export interface Mission {
  id: string;
  title: string;
  /** Boss line shown when the round opens. */
  taunt: string;
  /** The precise task the player must solve. `backticks` render as code. */
  task: string;
  /** "defense" missions open with the boss attacking the data. */
  kind?: "attack" | "defense";
  /** Canonical answers. Both must produce the same result (enforced by tests). */
  solution: Record<Dialect, string>;
  /** Raw PostgreSQL run before the player's SQL (e.g. the boss corrupting data). */
  setup?: string;
  /** Raw PostgreSQL query whose result is compared instead of the player's output. */
  check?: string;
  /** Row order matters (the task asks for ORDER BY). */
  ordered?: boolean;
  /** Progressive hints: concept → structure → near-answer. */
  hints: string[];
  /** Codex entries unlocked by winning the round. */
  codex: string[];
  /** Tables to highlight in the schema explorer. */
  tables: string[];
  /** Optional starter text for the editor. */
  starter?: Partial<Record<Dialect, string>>;
  /** Seconds on the clock (default depends on chapter). */
  time?: number;
}

export type BossId =
  | "nulloth"
  | "joinmaster"
  | "aggregon"
  | "subzero"
  | "reaper"
  | "transactor"
  | "schemaforge"
  | "windwraith"
  | "hydra"
  | "optimizer";

export interface Chapter {
  n: number;
  boss: BossId;
  bossName: string;
  bossTitle: string;
  title: string;
  topics: string[];
  intro: string;
  defeat: string;
  color: string;
  missions: Mission[];
}

export interface CodexEntry {
  id: string;
  title: string;
  category: "Basics" | "Joins" | "Aggregation" | "Subqueries" | "DML" | "Transactions" | "DDL" | "Analytics" | "Hierarchies" | "Performance" | "Modern SQL";
  definition: string;
  syntax: Record<Dialect, string>;
  enterprise: string;
  pitfalls: string[];
  /** Differences between Oracle and PostgreSQL worth remembering. */
  dialectNotes?: string;
  quiz?: { q: string; options: string[]; answer: number; why: string };
}
