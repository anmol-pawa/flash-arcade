import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { CHAPTERS } from "@/content/chapters";
import { CODEX } from "@/content/codex";
import { compareResults, evaluate, expectedFor, resetDatabase } from "@/lib/db/engine";
import { lintOracle } from "@/lib/dialect/lint";

let db: PGlite;
beforeAll(async () => {
  db = await PGlite.create();
  await resetDatabase(db);
});

/**
 * Every mission's Oracle and PostgreSQL answers must produce the same,
 * non-empty result — otherwise the game would mark a correct answer wrong.
 */
describe("mission integrity", () => {
  const ids = new Set<string>();
  for (const ch of CHAPTERS) {
    for (const m of ch.missions) {
      it(`${m.id}: both dialects agree`, async () => {
        expect(ids.has(m.id), "duplicate id").toBe(false);
        ids.add(m.id);
        expect(() => lintOracle(m.solution.oracle)).not.toThrow();
        const pg = await expectedFor(db, m, "postgres");
        const ora = await expectedFor(db, m, "oracle");
        expect(pg?.rows.length ?? 0, "reference result is empty").toBeGreaterThan(0);
        const cmp = compareResults(pg, ora, !!m.ordered);
        expect(cmp, `${cmp.reason}\npg: ${JSON.stringify(pg?.rows.slice(0, 5))}\nora: ${JSON.stringify(ora?.rows.slice(0, 5))}`).toEqual({ ok: true });
        for (const c of m.codex) expect(CODEX.some((e) => e.id === c), `unknown codex entry ${c}`).toBe(true);
        expect(m.hints.length).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("a correct answer written in the other style still passes", async () => {
    const m = CHAPTERS[2].missions.find((x) => x.id === "c3-null-aggregates")!;
    const v = await evaluate(db, m, "select count(*) staff, count(commission_pct) on_commission, round(avg(coalesce(commission_pct,0)),3) avg_commission from employees", "oracle");
    expect(v.correct).toBe(true);
  });

  it("a wrong answer is rejected with a reason", async () => {
    const m = CHAPTERS[0].missions[1];
    const v = await evaluate(db, m, "SELECT emp_id, last_name, salary FROM employees WHERE salary >= 100000", "postgres");
    expect(v.correct).toBe(false);
    expect(v.reason).toMatch(/rows/);
  });

  it("defense missions require the counter-move", async () => {
    const m = CHAPTERS[5].missions.find((x) => x.id === "c6-undo")!;
    expect((await evaluate(db, m, "SELECT 1", "postgres")).correct).toBe(false);
    expect((await evaluate(db, m, "ROLLBACK", "oracle")).correct).toBe(true);
  });
});
