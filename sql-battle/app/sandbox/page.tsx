"use client";
import { useEffect, useRef, useState } from "react";
import { Feedback, ResultPanel, ResultTab } from "@/components/battle/ResultPanel";
import { SchemaExplorer } from "@/components/battle/SchemaExplorer";
import { SpellDeck } from "@/components/battle/SpellDeck";
import { SqlEditor, SqlEditorHandle } from "@/components/battle/SqlEditor";
import { Button, DialectToggle, NavLink } from "@/components/ui/kit";
import { sqlClient, useDbStatus } from "@/lib/db/client";
import type { Dialect } from "@/lib/dialect/lint";
import { updateSave, useSave } from "@/lib/save";

const EXAMPLES: { label: string; sql: Record<Dialect, string> }[] = [
  {
    label: "Org chart",
    sql: {
      postgres: "WITH RECURSIVE org AS (\n  SELECT emp_id, last_name, 1 AS lvl, last_name::text AS path\n  FROM employees WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.emp_id, e.last_name, o.lvl + 1, o.path || ' > ' || e.last_name\n  FROM employees e JOIN org o ON e.manager_id = o.emp_id\n)\nSELECT repeat('  ', lvl - 1) || last_name AS org, path FROM org ORDER BY path;",
      oracle: "SELECT LPAD(' ', 2 * (LEVEL - 1)) || last_name AS org,\n       SYS_CONNECT_BY_PATH(last_name, ' > ') AS path\nFROM employees\nSTART WITH manager_id IS NULL\nCONNECT BY PRIOR emp_id = manager_id\nORDER SIBLINGS BY last_name;",
    },
  },
  {
    label: "Top 3 earners",
    sql: {
      postgres: "SELECT last_name, salary\nFROM employees\nORDER BY salary DESC\nLIMIT 3;",
      oracle: "SELECT * FROM (\n  SELECT last_name, salary FROM employees ORDER BY salary DESC\n)\nWHERE ROWNUM <= 3;",
    },
  },
  {
    label: "Revenue pivot",
    sql: {
      postgres:
        "SELECT c.segment,\n  COUNT(*) FILTER (WHERE o.status = 'DELIVERED') AS delivered,\n  COUNT(*) FILTER (WHERE o.status = 'PENDING') AS pending\nFROM orders o JOIN customers c USING (customer_id)\nGROUP BY c.segment;",
      oracle:
        "SELECT * FROM (\n  SELECT c.segment, o.status FROM orders o JOIN customers c ON c.customer_id = o.customer_id\n)\nPIVOT (COUNT(*) FOR status IN ('DELIVERED' AS delivered, 'PENDING' AS pending));",
    },
  },
  {
    label: "Legacy outer join",
    sql: {
      postgres: "SELECT d.dept_name, e.last_name\nFROM departments d\nLEFT JOIN employees e ON e.dept_id = d.dept_id;",
      oracle: "SELECT d.dept_name, e.last_name\nFROM departments d, employees e\nWHERE d.dept_id = e.dept_id(+);",
    },
  },
  {
    label: "Running balance",
    sql: {
      postgres: "SELECT account_id, txn_date, amount,\n  SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date, txn_id) AS running\nFROM transactions\nORDER BY account_id, txn_date;",
      oracle: "SELECT account_id, txn_date, amount,\n  SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date, txn_id) AS running\nFROM transactions\nORDER BY account_id, txn_date;",
    },
  },
];

export default function SandboxPage() {
  const save = useSave();
  const dialect = save.dialect;
  const [sql, setSql] = useState(EXAMPLES[0].sql[dialect]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tab, setTab] = useState<ResultTab>("result");
  const status = useDbStatus();
  const [running, setRunning] = useState(false);
  const editor = useRef<SqlEditorHandle>(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", "#60a5fa");
  }, []);

  async function run() {
    if (running || !sql.trim()) return;
    setRunning(true);
    const r = await sqlClient().run(sql, dialect);
    setFeedback({ run: r });
    setTab(r.ok ? "result" : "tutor");
    setRunning(false);
  }

  return (
    <main className="flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh">
      <header className="flex flex-wrap items-center gap-3 px-1">
        <NavLink href="/">← Menu</NavLink>
        <h1 className="font-display text-lg font-bold tracking-[0.25em]">SANDBOX</h1>
        <span className="text-xs text-white/40">{status === "ready" ? "PostgreSQL 18 (WASM) ready" : status === "booting" ? "Booting database…" : "Engine error"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
            onChange={(e) => {
              const ex = EXAMPLES[Number(e.target.value)];
              if (ex) setSql(ex.sql[dialect]);
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Load example…
            </option>
            {EXAMPLES.map((e, i) => (
              <option key={e.label} value={i}>
                {e.label}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => sqlClient().reset().then(() => setFeedback(null))}>
            ↺ Reset DB
          </Button>
          <DialectToggle value={dialect} onChange={(d) => updateSave((s) => ({ ...s, dialect: d }))} />
        </div>
      </header>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_minmax(320px,440px)]">
        <section className="panel min-h-0 overflow-y-auto p-4 scroll-thin">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/35">Schema</div>
          <SchemaExplorer dialect={dialect} highlight={["employees"]} onInsert={(t) => editor.current?.insert(t)} />
        </section>
        <section className="panel flex min-h-[420px] flex-col gap-3 p-4">
          <SpellDeck dialect={dialect} maxChapter={10} onCast={(t) => editor.current?.insert(t)} />
          <div className="relative min-h-[200px] flex-1">
            <SqlEditor ref={editor} value={sql} onChange={setSql} dialect={dialect} onRun={run} onPreview={run} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/35">Ctrl/⌘ + Enter to run. Changes are reset with ↺.</span>
            <Button variant="primary" className="ml-auto" onClick={run} disabled={status !== "ready" || running}>
              {running ? "Running…" : "▶ Run"}
            </Button>
          </div>
        </section>
        <section className="panel flex min-h-[320px] flex-col p-4">
          <ResultPanel tab={tab} setTab={setTab} feedback={feedback} expected={undefined} scouted={false} scoutCost={0} canScout={false} dialect={dialect} sql={sql} hideTarget />
        </section>
      </div>
    </main>
  );
}
