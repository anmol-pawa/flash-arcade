/**
 * The query engine. Pure async functions over a PGlite instance so the same
 * code runs in the browser worker and in the Node test suite.
 */
import type { PGlite } from "@electric-sql/pglite";
import { RESET_SQL, seedSql } from "@/content/schema";
import type { Mission } from "@/content/types";
import { isDirty } from "../dialect/concepts";
import { DialectError, NeedColumns } from "../dialect/errors";
import { Dialect, DialectHint, detectMismatch, lintOracle } from "../dialect/lint";
import { transpileOracle } from "../dialect/oracle";
import { splitStatements, tokenize } from "../sql/tokenize";
import { tutor } from "./errorTutor";

export type Cell = string | number | boolean | null;

export interface ResultSet {
  columns: string[];
  rows: Cell[][];
}

export interface SqlError {
  code?: string;
  message: string;
  title: string;
  explain: string;
  oracle?: string;
  mismatch: DialectHint[];
  position?: number;
}

export interface RunOk {
  ok: true;
  result: ResultSet | null;
  /** e.g. "UPDATE 3" for the last statement */
  command: string;
  statements: number;
  executed: string;
  notes: string[];
  ms: number;
}
export interface RunErr {
  ok: false;
  error: SqlError;
  executed?: string;
  notes: string[];
  ms: number;
}
export type RunResult = RunOk | RunErr;

export interface Verdict {
  run: RunResult;
  correct: boolean;
  reason?: string;
  expected?: ResultSet;
  /** Planner cost of the player's final SELECT vs the reference answer's. */
  cost?: { player: number; reference: number };
  plan?: string;
}

type Db = PGlite;

let dirty = true;

export async function resetDatabase(db: Db): Promise<void> {
  await db.exec(RESET_SQL);
  await db.exec(seedSql());
  await db.exec("ANALYZE");
  dirty = false;
}

async function ensureClean(db: Db) {
  if (dirty) await resetDatabase(db);
}

export function markDirty() {
  dirty = true;
}

/* ---------------------------------------------------------------- values */

function normalize(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return String(v);
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
  }
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return "\\x" + Array.from(v, (b) => b.toString(16).padStart(2, "0")).join("");
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);

function toResultSet(r: { rows: unknown[]; fields: { name: string; dataTypeID: number }[] }, dialect: Dialect): ResultSet {
  const numeric = r.fields.map((f) => NUMERIC_OIDS.has(f.dataTypeID));
  return {
    columns: r.fields.map((f) => (dialect === "oracle" && /^[a-z_][a-z0-9_$#]*$/.test(f.name) ? f.name.toUpperCase() : f.name)),
    rows: (r.rows as unknown[][]).map((row) =>
      row.map((v, i) => {
        const n = normalize(v);
        if (numeric[i] && typeof n === "string" && n !== "" && !isNaN(Number(n))) return Number(n);
        return n;
      }),
    ),
  };
}

/* -------------------------------------------------------------- execution */

function sqlErrorFrom(e: unknown, dialect: Dialect, sql: string): SqlError {
  const mismatch = detectMismatch(sql, dialect);
  if (e instanceof DialectError) {
    return { code: e.code, message: e.message, title: "Not valid Oracle SQL", explain: e.hint, oracle: e.message, mismatch };
  }
  const err = e as { code?: string; message?: string; position?: string };
  const message = err.message ?? String(e);
  const t = tutor(err.code, message, dialect);
  return { code: err.code, message, title: t.title, explain: t.explain, oracle: t.oracle, mismatch, position: err.position ? Number(err.position) : undefined };
}

async function transpile(db: Db, sql: string) {
  const columns: Record<string, string[]> = {};
  for (let i = 0; i < 6; i++) {
    try {
      return transpileOracle(sql, { columns });
    } catch (e) {
      if (!(e instanceof NeedColumns)) throw e;
      const r = await db.query(e.probe);
      columns[e.probe] = r.fields.map((f) => f.name);
    }
  }
  throw new DialectError("ORA-EMU", "Query too complex to emulate", "Try simplifying nested PIVOT / CONNECT BY clauses.");
}

/** Run a script exactly as the player wrote it (after dialect translation). */
export async function runScript(db: Db, sql: string, dialect: Dialect): Promise<RunResult> {
  const t0 = performance.now();
  let executed = sql;
  let notes: string[] = [];
  if (!splitStatements(sql).length) {
    return { ok: false, error: { message: "Nothing to run", title: "Empty spell", explain: "Write a SQL statement first.", mismatch: [] }, notes, ms: 0 };
  }
  try {
    if (dialect === "oracle") {
      notes = lintOracle(sql);
      const tr = await transpile(db, sql);
      executed = tr.sql;
      notes = [...notes, ...tr.notes];
    }
    if (isDirty(sql)) dirty = true;
    const results = await db.exec(executed, { rowMode: "array" });
    const last = [...results].reverse().find((r) => r.fields.length > 0);
    const lastAny = results[results.length - 1];
    const stmtCount = splitStatements(executed).length;
    const lead = tokenize(splitStatements(executed).at(-1) ?? "")[0]?.u ?? "";
    const command = lastAny && !lastAny.fields.length && lastAny.affectedRows !== undefined ? `${lead} ${lastAny.affectedRows}` : lead;
    return {
      ok: true,
      result: last ? toResultSet(last as never, dialect) : null,
      command,
      statements: stmtCount,
      executed,
      notes,
      ms: performance.now() - t0,
    };
  } catch (e) {
    dirty = true; // a failed script may have left partial work behind
    try {
      await db.exec("ROLLBACK");
    } catch {
      /* no transaction open */
    }
    return { ok: false, error: sqlErrorFrom(e, dialect, sql), executed, notes, ms: performance.now() - t0 };
  }
}

/** Run a mission attempt from a clean database: setup, player SQL, then the check query. */
async function runMission(db: Db, m: Mission, sql: string, dialect: Dialect): Promise<{ run: RunResult; observed: ResultSet | null }> {
  await ensureClean(db);
  if (m.setup) {
    dirty = true;
    await db.exec(m.setup);
  }
  const run = await runScript(db, sql, dialect);
  if (!run.ok) return { run, observed: null };
  let observed = run.result;
  if (m.check) {
    dirty = true;
    try {
      const r = await db.query(m.check, [], { rowMode: "array" });
      observed = toResultSet(r as never, dialect);
    } catch (e) {
      return { run: { ok: false, error: sqlErrorFrom(e, dialect, sql), notes: run.notes, ms: run.ms }, observed: null };
    }
  }
  if (m.setup || m.check || isDirty(sql)) {
    try {
      await db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
  }
  return { run, observed };
}

const expectedCache = new Map<string, ResultSet | null>();

export async function expectedFor(db: Db, m: Mission, dialect: Dialect): Promise<ResultSet | null> {
  const key = `${m.id}:${dialect}`;
  if (expectedCache.has(key)) return expectedCache.get(key)!;
  const { run, observed } = await runMission(db, m, m.solution[dialect], dialect);
  if (!run.ok) throw new Error(`Reference solution for ${m.id} (${dialect}) failed: ${run.error.message}\n${run.executed ?? ""}`);
  expectedCache.set(key, observed);
  return observed;
}

async function planCost(db: Db, sql: string): Promise<{ cost: number; text: string } | null> {
  const stmt = splitStatements(sql).at(-1);
  const lead = tokenize(stmt ?? "")[0]?.u;
  if (!stmt || (lead !== "SELECT" && lead !== "WITH")) return null;
  try {
    const j = await db.query<{ "QUERY PLAN": { Plan: { "Total Cost": number } }[] }>(`EXPLAIN (FORMAT JSON) ${stmt}`);
    const cost = j.rows[0]["QUERY PLAN"][0].Plan["Total Cost"];
    const t = await db.query<{ "QUERY PLAN": string }>(`EXPLAIN ${stmt}`);
    return { cost, text: t.rows.map((r) => r["QUERY PLAN"]).join("\n") };
  } catch {
    return null;
  }
}

export async function evaluate(db: Db, m: Mission, sql: string, dialect: Dialect): Promise<Verdict> {
  const expected = await expectedFor(db, m, dialect);
  const { run, observed } = await runMission(db, m, sql, dialect);
  if (!run.ok) return { run, correct: false, expected: expected ?? undefined };

  const cmp = compareResults(expected, observed, !!m.ordered);
  let cost: Verdict["cost"];
  let plan: string | undefined;
  if (cmp.ok && !m.check) {
    const mine = await planCost(db, run.executed);
    const refSql = dialect === "oracle" ? (await transpile(db, m.solution.oracle)).sql : m.solution.postgres;
    const ref = await planCost(db, refSql);
    if (mine && ref) cost = { player: mine.cost, reference: ref.cost };
    plan = mine?.text;
  }
  return { run, correct: cmp.ok, reason: cmp.reason, expected: expected ?? undefined, cost, plan };
}

/* ------------------------------------------------------------- comparison */

function key(v: Cell): string {
  if (v === null) return "∅";
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  if (s !== "" && !isNaN(Number(s)) && /^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 100) / 100);
  return s;
}

function rowKey(r: Cell[]) {
  return r.map(key).join("␟");
}

export function compareResults(expected: ResultSet | null, actual: ResultSet | null, ordered: boolean): { ok: boolean; reason?: string } {
  if (!expected) return { ok: true };
  if (!actual) return { ok: false, reason: "Your spell produced no result set. The target is a query result — end with a SELECT." };

  let act = actual;
  if (actual.columns.length !== expected.columns.length) {
    const projected = projectByName(expected, actual);
    if (!projected) {
      return { ok: false, reason: `The target has ${expected.columns.length} column${expected.columns.length === 1 ? "" : "s"} (${expected.columns.join(", ")}); your result has ${actual.columns.length}.` };
    }
    act = projected;
  }
  if (act.rows.length !== expected.rows.length) {
    return { ok: false, reason: `The target has ${expected.rows.length} row${expected.rows.length === 1 ? "" : "s"}; your result has ${act.rows.length}.` };
  }
  const tryMatch = (a: ResultSet) => {
    const e = expected.rows.map(rowKey);
    const g = a.rows.map(rowKey);
    if (ordered) {
      const i = e.findIndex((k, n) => k !== g[n]);
      return i < 0 ? null : i;
    }
    const es = [...e].sort();
    const gs = [...g].sort();
    const i = es.findIndex((k, n) => k !== gs[n]);
    return i < 0 ? null : i;
  };
  let bad = tryMatch(act);
  if (bad === null) return { ok: true };
  const byName = projectByName(expected, actual);
  if (byName && tryMatch(byName) === null) return { ok: true };

  if (ordered) {
    const sortedMatch = [...expected.rows.map(rowKey)].sort().join() === [...act.rows.map(rowKey)].sort().join();
    if (sortedMatch) return { ok: false, reason: "Right rows, wrong order. Check your ORDER BY (column, direction, tie-breakers)." };
    bad = bad ?? 0;
    return { ok: false, reason: `Row ${bad + 1} differs from the target.` };
  }
  return { ok: false, reason: "Same shape, but some values differ from the target. Compare your filters and calculations." };
}

function projectByName(expected: ResultSet, actual: ResultSet): ResultSet | null {
  const idx = expected.columns.map((c) => actual.columns.findIndex((a) => a.toLowerCase() === c.toLowerCase()));
  if (idx.some((i) => i < 0)) return null;
  return { columns: expected.columns, rows: actual.rows.map((r) => idx.map((i) => r[i])) };
}
