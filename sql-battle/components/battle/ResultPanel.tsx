"use client";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useMemo } from "react";
import type { ResultSet, RunResult } from "@/lib/db/engine";
import { DialectError, NeedColumns } from "@/lib/dialect/errors";
import { Dialect, lintOracle } from "@/lib/dialect/lint";
import { transpileOracle } from "@/lib/dialect/oracle";
import { sfx } from "@/game/audio/synth";
import { Button, CodeBlock } from "../ui/kit";
import { ResultGrid } from "./ResultGrid";

export type ResultTab = "result" | "target" | "tutor" | "lens" | "plan";

export interface Feedback {
  run?: RunResult;
  reason?: string;
  correct?: boolean;
  preview?: boolean;
}

export function ResultPanel({
  tab,
  setTab,
  feedback,
  expected,
  scouted,
  onScout,
  scoutCost,
  canScout,
  dialect,
  sql,
  plan,
  planLabel,
  hideTarget,
}: {
  tab: ResultTab;
  setTab: (t: ResultTab) => void;
  feedback: Feedback | null;
  expected: ResultSet | null | undefined;
  scouted: boolean;
  onScout?: () => void;
  scoutCost: number;
  canScout: boolean;
  dialect: Dialect;
  sql: string;
  plan?: string;
  planLabel?: string;
  hideTarget?: boolean;
}) {
  const tabs: { id: ResultTab; label: string; dot?: boolean }[] = [
    { id: "result", label: "Result" },
    ...(hideTarget ? [] : [{ id: "target" as const, label: "Target" }]),
    { id: "tutor", label: "Tutor", dot: !!feedback && (feedback.run?.ok === false || feedback.correct === false) },
    { id: "lens", label: "Lens" },
    { id: "plan", label: "Plan" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex gap-1 border-b border-white/10" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              sfx.click();
              setTab(t.id);
            }}
            className={`relative px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors ${tab === t.id ? "text-white" : "text-white/40 hover:text-white/70"}`}
          >
            {t.label}
            {t.dot && <span className="absolute right-0.5 top-1 h-1.5 w-1.5 rounded-full bg-rose-400" />}
            {tab === t.id && <motion.span layoutId="rtab" className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-[var(--accent)]" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto scroll-thin">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            {tab === "result" && <ResultTabView feedback={feedback} />}
            {tab === "target" && <TargetView expected={expected} scouted={scouted} onScout={onScout} cost={scoutCost} canScout={canScout} />}
            {tab === "tutor" && <TutorView feedback={feedback} dialect={dialect} />}
            {tab === "lens" && <LensView dialect={dialect} sql={sql} />}
            {tab === "plan" && <PlanView plan={plan} label={planLabel} dialect={dialect} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-32 items-center justify-center px-6 text-center text-sm text-white/35">{children}</div>;
}

function ResultTabView({ feedback }: { feedback: Feedback | null }) {
  if (!feedback?.run) return <Empty>Cast a spell (Ctrl/⌘+Enter) or preview it (Ctrl/⌘+Shift+Enter) to see the output.</Empty>;
  const r = feedback.run;
  if (!r.ok)
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
        <div className="font-bold text-rose-300">{r.error.title}</div>
        <div className="mt-1 font-mono text-xs text-rose-200/80">{r.error.oracle ?? r.error.message}</div>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-white/45">
        <span className="font-mono">
          {r.command} · {r.statements} statement{r.statements === 1 ? "" : "s"} · {r.ms.toFixed(0)} ms
        </span>
        {feedback.preview && <span className="rounded bg-white/10 px-1.5 py-0.5 uppercase tracking-widest">preview</span>}
        {feedback.correct === true && <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 font-bold uppercase tracking-widest text-emerald-300">match</span>}
        {feedback.correct === false && <span className="rounded bg-rose-400/20 px-1.5 py-0.5 font-bold uppercase tracking-widest text-rose-300">no match</span>}
      </div>
      {r.result ? <ResultGrid result={r.result} /> : <Empty>Statement executed — no rows returned.</Empty>}
    </div>
  );
}

function TargetView({ expected, scouted, onScout, cost, canScout }: { expected: ResultSet | null | undefined; scouted: boolean; onScout?: () => void; cost: number; canScout: boolean }) {
  if (!scouted)
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="text-3xl">🔮</div>
        <p className="max-w-xs text-sm text-white/55">Scout the boss&apos;s weakness: reveal the exact result your spell must produce.</p>
        <Button variant="primary" size="sm" onClick={onScout} disabled={!canScout}>
          Scout target · {cost} focus
        </Button>
      </div>
    );
  if (expected === undefined) return <Empty>Scouting…</Empty>;
  if (expected === null) return <Empty>This round is judged on the database state, not a result set.</Empty>;
  return <ResultGrid result={expected} max={12} accent="#fbbf24" />;
}

function TutorView({ feedback, dialect }: { feedback: Feedback | null; dialect: Dialect }) {
  if (!feedback) return <Empty>The tutor explains errors and wrong answers here, including the Oracle error you&apos;d see in production.</Empty>;
  const r = feedback.run;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {r && !r.ok && (
        <>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
            <div className="text-xs font-bold uppercase tracking-widest text-rose-300">{r.error.title}</div>
            <p className="mt-1.5 leading-relaxed text-white/80">{r.error.explain}</p>
          </div>
          {dialect === "oracle" && r.error.oracle && (
            <div className="rounded-xl border border-red-400/30 bg-black/40 p-3 font-mono text-xs">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-red-300/80">Oracle would say</div>
              <div className="text-red-200">{r.error.oracle}</div>
            </div>
          )}
          {/* lint errors (ORA-/PLS-) were raised before the query reached PostgreSQL */}
          {!/^(ORA|PLS)-/.test(r.error.code ?? "") && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/40">{dialect === "oracle" ? "Emulator (PostgreSQL) message" : "PostgreSQL message"}</div>
            <div className="text-white/70">
              {r.error.code ? `[${r.error.code}] ` : ""}
              {r.error.message}
            </div>
          </div>
          )}
          {r.error.mismatch.length > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
              <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Wrong dialect?</div>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-white/80">
                {r.error.mismatch.map((m) => (
                  <li key={m.found}>
                    <code className="text-amber-200">{m.found}</code> — {m.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {r?.ok && feedback.correct === false && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Valid SQL — wrong answer</div>
          <p className="mt-1.5 leading-relaxed text-white/80">{feedback.reason}</p>
          <p className="mt-2 text-xs text-white/50">Tip: open the Target tab to scout the expected result, or buy a hint.</p>
        </div>
      )}
      {r?.ok && feedback.correct !== false && <Empty>{feedback.correct ? "Direct hit! Nothing to fix." : "No problems detected."}</Empty>}
      {r?.notes && r.notes.length > 0 && (
        <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3">
          <div className="text-xs font-bold uppercase tracking-widest text-sky-300">Dialect notes</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-white/70">
            {r.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LensView({ dialect, sql }: { dialect: Dialect; sql: string }) {
  const deferred = useDeferredValue(sql);
  const out = useMemo(() => {
    if (dialect !== "oracle") return null;
    if (!deferred.trim()) return { sql: "", notes: [] as string[], error: "" };
    try {
      const notes = lintOracle(deferred);
      const r = transpileOracle(deferred);
      return { sql: r.sql, notes: [...notes, ...r.notes], error: "" };
    } catch (e) {
      if (e instanceof NeedColumns) return { sql: "", notes: [], error: "This query needs table metadata to translate (PIVOT / SELECT * with CONNECT BY). Cast or preview it to see the full translation in the Tutor tab." };
      if (e instanceof DialectError) return { sql: "", notes: [], error: `${e.message} — ${e.hint}` };
      return { sql: "", notes: [], error: String(e) };
    }
  }, [dialect, deferred]);

  if (dialect !== "oracle")
    return (
      <Empty>
        The Translation Lens shows how Oracle SQL maps to PostgreSQL. Switch the dialect to <b className="mx-1 text-red-300">Oracle</b> to use it.
      </Empty>
    );
  if (!out || (!out.sql && !out.error)) return <Empty>Start typing Oracle SQL — the PostgreSQL translation appears here live.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {out.error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{out.error}</div> : <CodeBlock code={out.sql} label="Runs on the engine as PostgreSQL" color="#60a5fa" />}
      {out.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-white/65">
          {out.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <p className="text-[10px] uppercase tracking-widest text-white/30">Oracle is emulated: your SQL is validated against Oracle rules, then translated.</p>
    </div>
  );
}

function PlanView({ plan, label, dialect }: { plan?: string; label?: string; dialect: Dialect }) {
  if (!plan) return <Empty>After a successful SELECT, the planner&apos;s execution plan appears here. Cheaper plans deal bonus damage.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {label && <div className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">{label}</div>}
      <CodeBlock code={plan} label={dialect === "oracle" ? "Plan (PostgreSQL planner; Oracle: EXPLAIN PLAN + DBMS_XPLAN)" : "EXPLAIN"} />
    </div>
  );
}
