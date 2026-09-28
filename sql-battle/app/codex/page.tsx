"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Chip, CodeBlock, NavLink } from "@/components/ui/kit";
import { CODEX } from "@/content/codex";
import type { CodexEntry } from "@/content/types";
import { sfx } from "@/game/audio/synth";
import { updateSave, useSave } from "@/lib/save";

const CATS = ["All", ...new Set(CODEX.map((c) => c.category))] as const;

export default function CodexPage() {
  const save = useSave();
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState("");
  const [study, setStudy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", "#a78bfa");
  }, []);

  const list = useMemo(
    () => CODEX.filter((c) => (cat === "All" || c.category === cat) && (!q || `${c.title} ${c.definition} ${c.syntax.postgres} ${c.syntax.oracle}`.toLowerCase().includes(q.toLowerCase()))),
    [cat, q],
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-center gap-4">
        <NavLink href="/">← Menu</NavLink>
        <h1 className="font-display text-xl font-bold tracking-[0.25em]">CODEX</h1>
        <span className="text-xs text-white/40">
          {save.codex.length}/{CODEX.length} unlocked · {save.quizzes.length} quizzes mastered
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={study} onChange={(e) => setStudy(e.target.checked)} className="accent-[var(--accent)]" />
          Study mode (show locked entries)
        </label>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => {
              sfx.click();
              setCat(c);
            }}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${cat === c ? "bg-[var(--accent)] text-black" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
          >
            {c}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="ml-auto w-48 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {list.map((e, i) => {
          const unlocked = save.codex.includes(e.id) || study;
          return (
            <motion.div key={e.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }} className={`panel overflow-hidden ${open === e.id ? "md:col-span-2" : ""}`}>
              <button
                className="flex w-full items-start gap-3 p-4 text-left"
                onClick={() => {
                  if (!unlocked) return sfx.error();
                  sfx.click();
                  setOpen(open === e.id ? null : e.id);
                }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--accent)]">{e.category}</span>
                    {save.quizzes.includes(e.id) && <Chip color="#fde047">★ mastered</Chip>}
                    {!save.codex.includes(e.id) && <Chip>{study ? "study" : "locked"}</Chip>}
                  </div>
                  <div className={`mt-1 font-display text-base font-bold ${unlocked ? "" : "blur-[3px]"}`}>{e.title}</div>
                  {open !== e.id && <p className={`mt-1 line-clamp-2 text-sm text-white/60 ${unlocked ? "" : "select-none blur-[4px]"}`}>{e.definition}</p>}
                </div>
                <span className="text-white/30">{open === e.id ? "−" : "+"}</span>
              </button>
              <AnimatePresence>{open === e.id && unlocked && <EntryBody e={e} />}</AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </main>
  );
}

function EntryBody({ e }: { e: CodexEntry }) {
  const save = useSave();
  const [pick, setPick] = useState<number | null>(null);
  const mastered = save.quizzes.includes(e.id);
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-white/10">
      <div className="space-y-4 p-4">
        <p className="text-sm leading-relaxed text-white/80">{e.definition}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <CodeBlock code={e.syntax.postgres} label="PostgreSQL" color="#60a5fa" />
          <CodeBlock code={e.syntax.oracle} label="Oracle" color="#f87171" />
        </div>
        {e.dialectNotes && (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3 text-sm text-white/75">
            <span className="font-semibold text-sky-300">Oracle vs PostgreSQL: </span>
            {e.dialectNotes}
          </div>
        )}
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm leading-relaxed text-white/75">
          <span className="font-semibold text-emerald-300">In the enterprise: </span>
          {e.enterprise}
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-rose-300">Pitfalls</div>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-white/70">
            {e.pitfalls.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
        {e.quiz && (
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">Quick quiz {mastered && "· mastered"}</div>
            <div className="mt-1.5 text-sm font-semibold">{e.quiz.q}</div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {e.quiz.options.map((o, i) => {
                const chosen = pick === i;
                const right = i === e.quiz!.answer;
                return (
                  <button
                    key={i}
                    disabled={pick !== null}
                    onClick={() => {
                      setPick(i);
                      if (right) {
                        sfx.unlockCodex();
                        if (!mastered) updateSave((s) => ({ ...s, quizzes: [...s.quizzes, e.id], xp: s.xp + 40 }));
                      } else sfx.error();
                    }}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${pick === null ? "border-white/10 hover:bg-white/10" : right ? "border-emerald-400 bg-emerald-400/15" : chosen ? "border-rose-400 bg-rose-400/15" : "border-white/5 opacity-50"}`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
            {pick !== null && (
              <p className="mt-2 text-sm text-white/70">
                {pick === e.quiz.answer ? "✓ Correct! " : "✗ Not quite. "}
                {e.quiz.why}
                {pick !== e.quiz.answer && (
                  <button className="ml-2 text-xs underline" onClick={() => setPick(null)}>
                    retry
                  </button>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
