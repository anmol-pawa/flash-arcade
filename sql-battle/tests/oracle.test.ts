import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { compareResults, resetDatabase, runScript } from "@/lib/db/engine";
import { DialectError } from "@/lib/dialect/errors";
import { detectMismatch, lintOracle } from "@/lib/dialect/lint";
import { transpileOracle } from "@/lib/dialect/oracle";

let db: PGlite;
beforeAll(async () => {
  db = await PGlite.create();
  await resetDatabase(db);
});

/** Each Oracle query must return exactly what the hand-written PostgreSQL does. */
const PAIRS: [string, string, string, boolean?][] = [
  ["dual + nvl", "SELECT NVL(NULL, 5) AS v FROM dual", "SELECT 5 AS v"],
  ["nvl on column", "SELECT emp_id, NVL(commission_pct, 0) AS c FROM employees", "SELECT emp_id, COALESCE(commission_pct, 0) AS c FROM employees"],
  ["nvl2", "SELECT emp_id, NVL2(commission_pct, 'Y', 'N') f FROM employees", "SELECT emp_id, CASE WHEN commission_pct IS NULL THEN 'N' ELSE 'Y' END FROM employees"],
  ["decode", "SELECT emp_id, DECODE(dept_id, 20, 'ENG', 30, 'SALES', 'OTHER') d FROM employees", "SELECT emp_id, CASE dept_id WHEN 20 THEN 'ENG' WHEN 30 THEN 'SALES' ELSE 'OTHER' END FROM employees"],
  ["decode null", "SELECT emp_id, DECODE(dept_id, NULL, 'none', 'some') FROM employees", "SELECT emp_id, CASE WHEN dept_id IS NULL THEN 'none' ELSE 'some' END FROM employees"],
  ["rownum top-n", "SELECT * FROM (SELECT emp_id, salary FROM employees ORDER BY salary DESC) WHERE ROWNUM <= 3", "SELECT emp_id, salary FROM employees ORDER BY salary DESC LIMIT 3", true],
  ["fetch first", "SELECT emp_id FROM employees ORDER BY emp_id FETCH FIRST 5 ROWS ONLY", "SELECT emp_id FROM employees ORDER BY emp_id LIMIT 5", true],
  ["minus", "SELECT customer_id FROM customers MINUS SELECT customer_id FROM orders", "SELECT customer_id FROM customers EXCEPT SELECT customer_id FROM orders"],
  [
    "(+) outer join",
    "SELECT d.dept_name, e.emp_id FROM departments d, employees e WHERE d.dept_id = e.dept_id(+)",
    "SELECT d.dept_name, e.emp_id FROM departments d LEFT JOIN employees e ON d.dept_id = e.dept_id",
  ],
  [
    "(+) with filter",
    "SELECT c.name, o.order_id FROM customers c, orders o WHERE c.customer_id = o.customer_id(+) AND c.country = 'India'",
    "SELECT c.name, o.order_id FROM customers c LEFT JOIN orders o ON c.customer_id = o.customer_id WHERE c.country = 'India'",
  ],
  [
    "connect by",
    "SELECT emp_id, LEVEL AS lvl FROM employees START WITH manager_id IS NULL CONNECT BY PRIOR emp_id = manager_id",
    "WITH RECURSIVE h AS (SELECT emp_id, 1 AS lvl FROM employees WHERE manager_id IS NULL UNION ALL SELECT e.emp_id, h.lvl + 1 FROM employees e JOIN h ON e.manager_id = h.emp_id) SELECT emp_id, lvl FROM h",
  ],
  [
    "connect by path + alias",
    "SELECT e.last_name, SYS_CONNECT_BY_PATH(e.last_name, '/') p FROM employees e START WITH e.emp_id = 101 CONNECT BY PRIOR e.emp_id = e.manager_id",
    "WITH RECURSIVE h AS (SELECT last_name, emp_id, '/' || last_name AS p FROM employees WHERE emp_id = 101 UNION ALL SELECT e.last_name, e.emp_id, h.p || '/' || e.last_name FROM employees e JOIN h ON e.manager_id = h.emp_id) SELECT last_name, p FROM h",
  ],
  [
    "connect by root + leaf",
    "SELECT emp_id, CONNECT_BY_ROOT last_name AS root, CONNECT_BY_ISLEAF AS leaf FROM employees START WITH manager_id = 100 CONNECT BY PRIOR emp_id = manager_id",
    "WITH RECURSIVE h AS (SELECT emp_id, last_name AS root FROM employees WHERE manager_id = 100 UNION ALL SELECT e.emp_id, h.root FROM employees e JOIN h ON e.manager_id = h.emp_id) SELECT emp_id, root, CASE WHEN EXISTS (SELECT 1 FROM employees x WHERE x.manager_id = h.emp_id) THEN 0 ELSE 1 END FROM h",
  ],
  ["connect by star", "SELECT * FROM categories START WITH parent_id IS NULL CONNECT BY PRIOR category_id = parent_id", "SELECT * FROM categories"],
  ["level generator", "SELECT LEVEL AS n FROM dual CONNECT BY LEVEL <= 5", "SELECT generate_series(1, 5) AS n", true],
  [
    "listagg",
    "SELECT dept_id, LISTAGG(last_name, ', ') WITHIN GROUP (ORDER BY last_name) names FROM employees GROUP BY dept_id",
    "SELECT dept_id, STRING_AGG(last_name, ', ' ORDER BY last_name) FROM employees GROUP BY dept_id",
  ],
  [
    "pivot",
    "SELECT * FROM (SELECT status, customer_id FROM orders) PIVOT (COUNT(*) FOR status IN ('DELIVERED' AS delivered, 'PENDING' AS pending))",
    "SELECT customer_id, COUNT(*) FILTER (WHERE status = 'DELIVERED'), COUNT(*) FILTER (WHERE status = 'PENDING') FROM orders GROUP BY customer_id",
  ],
  ["add_months", "SELECT ADD_MONTHS(DATE '2024-01-31', 1) d FROM dual", "SELECT DATE '2024-02-29'"],
  ["trunc date fmt", "SELECT TRUNC(DATE '2024-05-17', 'MM') d FROM dual", "SELECT DATE '2024-05-01'"],
  ["instr", "SELECT INSTR('database', 'base') i FROM dual", "SELECT 5"],
  ["to_number", "SELECT TO_NUMBER('42') + 1 n FROM dual", "SELECT 43"],
  [
    "oracle recursive with",
    "WITH chain (emp_id, depth) AS (SELECT emp_id, 1 FROM employees WHERE manager_id IS NULL UNION ALL SELECT e.emp_id, c.depth + 1 FROM employees e JOIN chain c ON e.manager_id = c.emp_id) SELECT emp_id, depth FROM chain",
    "WITH RECURSIVE chain (emp_id, depth) AS (SELECT emp_id, 1 FROM employees WHERE manager_id IS NULL UNION ALL SELECT e.emp_id, c.depth + 1 FROM employees e JOIN chain c ON e.manager_id = c.emp_id) SELECT emp_id, depth FROM chain",
  ],
  ["regexp_replace global", "SELECT REGEXP_REPLACE('a-b-c', '-', '+') r FROM dual", "SELECT 'a+b+c'"],
];

describe("Oracle → PostgreSQL transpiler", () => {
  for (const [name, ora, pg, ordered] of PAIRS) {
    it(name, async () => {
      const a = await runScript(db, ora, "oracle");
      if (!a.ok) throw new Error(`${a.error.message}\n--- executed:\n${a.executed}`);
      const b = await runScript(db, pg, "postgres");
      if (!b.ok) throw new Error(`reference failed: ${b.error.message}`);
      const cmp = compareResults(b.result, a.result, !!ordered);
      expect(cmp, `${cmp.reason}\n--- executed:\n${a.executed}`).toEqual({ ok: true });
    });
  }

  it("rewrites DDL and sequences", async () => {
    const script = `
      CREATE SEQUENCE ticket_seq START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
      CREATE TABLE tickets (id NUMBER(10) PRIMARY KEY, title VARCHAR2(50) NOT NULL, body CLOB, created DATE DEFAULT SYSDATE);
      ALTER TABLE tickets ADD (priority NUMBER(1), owner VARCHAR2(30));
      ALTER TABLE tickets MODIFY (title VARCHAR2(80));
      INSERT INTO tickets (id, title, priority) VALUES (ticket_seq.NEXTVAL, 'Printer on fire', 1);
      INSERT INTO tickets (id, title, priority) VALUES (ticket_seq.NEXTVAL, 'Coffee low', 3);
      COMMIT;
      SELECT id, title, priority FROM tickets ORDER BY id`;
    const r = await runScript(db, script, "oracle");
    if (!r.ok) throw new Error(`${r.error.message}\n${r.executed}`);
    expect(r.result?.rows).toEqual([
      [1, "Printer on fire", 1],
      [2, "Coffee low", 3],
    ]);
    expect(r.result?.columns).toEqual(["ID", "TITLE", "PRIORITY"]);
    await resetDatabase(db);
  });

  it("supports MERGE with an Oracle-style WHERE on the update branch", async () => {
    const r = await runScript(
      db,
      `MERGE INTO products p
       USING (SELECT 7 AS product_id, 99 AS new_price FROM dual UNION ALL SELECT 99, 10 FROM dual) s
       ON (p.product_id = s.product_id)
       WHEN MATCHED THEN UPDATE SET p.price = s.new_price WHERE p.discontinued = 'N'
       WHEN NOT MATCHED THEN INSERT (product_id, name, category_id, price, stock) VALUES (s.product_id, 'New thing', 9, s.new_price, 0);
       SELECT product_id, price FROM products WHERE product_id IN (7, 99) ORDER BY 1`,
      "oracle",
    );
    if (!r.ok) throw new Error(`${r.error.message}\n${r.executed}`);
    expect(r.result?.rows).toEqual([
      [7, 99],
      [99, 10],
    ]);
    await resetDatabase(db);
  });

  it("emulates implicit transactions and ROLLBACK", async () => {
    const r = await runScript(db, "UPDATE employees SET salary = 1 WHERE dept_id = 20; ROLLBACK; SELECT MIN(salary) m FROM employees WHERE dept_id = 20", "oracle");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.result?.rows[0][0]).toBe(72000);
    await resetDatabase(db);
  });
});

describe("Oracle lint", () => {
  const rejects: [string, string][] = [
    ["SELECT * FROM employees LIMIT 5", "ORA-00933"],
    ["SELECT salary::int FROM employees", "ORA-00911"],
    ["SELECT * FROM employees WHERE last_name ILIKE 'a%'", "ORA-00920"],
    ["SELECT e.emp_id FROM employees AS e", "ORA-00933"],
    ["SELECT STRING_AGG(last_name, ',') FROM employees", "ORA-00904"],
    ["BEGIN; UPDATE employees SET salary = 1; COMMIT;", "PLS-00103"],
    ["WITH RECURSIVE x AS (SELECT 1) SELECT * FROM x", "ORA-00905"],
    ["SELECT details->>'hub' FROM shipments", "ORA-00936"],
  ];
  for (const [sql, code] of rejects) {
    it(`rejects ${code}: ${sql.slice(0, 40)}`, () => {
      try {
        lintOracle(sql);
        throw new Error("expected rejection");
      } catch (e) {
        expect(e).toBeInstanceOf(DialectError);
        expect((e as DialectError).code).toBe(code);
      }
    });
  }
  it("accepts column aliases with AS and CTEs", () => {
    expect(() => lintOracle("WITH t AS (SELECT emp_id AS id FROM employees e) SELECT id AS x FROM t")).not.toThrow();
  });
  it("detects Oracle-isms in Postgres mode", () => {
    const h = detectMismatch("SELECT NVL(a, 0) FROM dual WHERE ROWNUM < 3", "postgres").map((x) => x.found);
    expect(h).toEqual(expect.arrayContaining(["NVL", "DUAL", "ROWNUM"]));
  });
  it("renders readable SQL", () => {
    const r = transpileOracle("SELECT NVL(commission_pct, 0) FROM employees");
    expect(r.sql).toBe("SELECT COALESCE(commission_pct, 0) FROM employees;");
  });
});
