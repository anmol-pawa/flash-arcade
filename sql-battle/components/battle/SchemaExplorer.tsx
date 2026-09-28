"use client";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TABLES } from "@/content/schema";
import { sfx } from "@/game/audio/synth";
import type { Dialect } from "@/lib/dialect/lint";

/** Browse the arena database. Click or drag table/column names into the editor. */
export function SchemaExplorer({ dialect, highlight, onInsert }: { dialect: Dialect; highlight: string[]; onInsert: (text: string) => void }) {
  const [open, setOpen] = useState<string | null>(highlight[0] ?? null);
  const ordered = [...TABLES].sort((a, b) => Number(highlight.includes(b.name)) - Number(highlight.includes(a.name)));
  return (
    <div className="flex flex-col gap-1" data-testid="schema">
      {ordered.map((t) => {
        const hot = highlight.includes(t.name);
        const name = dialect === "oracle" ? t.name.toUpperCase() : t.name;
        return (
          <div key={t.name} className={`rounded-lg border ${hot ? "border-[var(--accent)]/40 bg-[var(--accent)]/5" : "border-white/5 bg-white/[0.02]"}`}>
            <div className="flex items-center">
              <button
                className="flex-1 px-2.5 py-1.5 text-left text-xs"
                onClick={() => {
                  sfx.click();
                  setOpen(open === t.name ? null : t.name);
                }}
              >
                <span className="mr-1.5 inline-block w-3 text-white/40">{open === t.name ? "▾" : "▸"}</span>
                <span className={`font-mono font-semibold ${hot ? "text-[var(--accent)]" : "text-white/80"}`}>{name}</span>
                <span className="ml-2 text-[10px] uppercase tracking-wider text-white/30">{t.domain}</span>
              </button>
              <button
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", t.name)}
                onClick={() => onInsert(t.name)}
                title="Insert table name"
                className="mr-1 rounded px-1.5 text-xs text-white/40 hover:bg-white/10 hover:text-white"
              >
                +
              </button>
            </div>
            <AnimatePresence initial={false}>
              {open === t.name && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <p className="px-3 pb-1 text-[11px] text-white/40">{t.description}</p>
                  <ul className="px-1.5 pb-2">
                    {t.columns.map((c) => (
                      <li key={c.name}>
                        <button
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", c.name)}
                          onClick={() => onInsert(c.name)}
                          title={c.note ?? ""}
                          className="flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-0.5 text-left font-mono text-[11.5px] hover:bg-white/10"
                        >
                          <span className="text-white/85">
                            {dialect === "oracle" ? c.name.toUpperCase() : c.name}
                            {c.note?.startsWith("PK") && <span className="ml-1 text-amber-300">🔑</span>}
                          </span>
                          <span className="shrink-0 text-[10px] text-white/35">{dialect === "oracle" ? c.oracle : c.pg}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
