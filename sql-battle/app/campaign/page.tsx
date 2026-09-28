"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BOSS_GLYPH } from "@/components/menu/bossGlyph";
import { Chip, LinkButton, NavLink } from "@/components/ui/kit";
import { CHAPTERS } from "@/content/chapters";
import { sfx } from "@/game/audio/synth";
import { sqlClient } from "@/lib/db/client";
import { unlockedChapters, useSave } from "@/lib/save";

// winding path positions (percent of the map box)
const POS: [number, number][] = [
  [8, 78],
  [22, 58],
  [14, 32],
  [32, 18],
  [46, 40],
  [40, 70],
  [60, 80],
  [70, 54],
  [62, 26],
  [86, 22],
];

export default function CampaignPage() {
  const save = useSave();
  const unlocked = unlockedChapters(save);
  const [sel, setSel] = useState(unlocked);
  const ch = CHAPTERS[sel - 1];

  useEffect(() => {
    sqlClient().warmup();
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", ch.color);
  }, [ch.color]);

  const path = POS.map(([x, y], i) => `${i ? "L" : "M"} ${x * 10} ${y * 6}`).join(" ");

  return (
    <main className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-6">
      <header className="flex items-center gap-4">
        <NavLink href="/">← Menu</NavLink>
        <h1 className="font-display text-xl font-bold tracking-[0.25em]">CAMPAIGN</h1>
        <div className="ml-auto text-xs text-white/40">Beat a boss to unlock the next chapter</div>
      </header>

      <div className="mt-6 grid flex-1 gap-5 lg:grid-cols-[1fr_380px]">
        <div className="panel relative aspect-[5/3] w-full overflow-hidden">
          <div className="grid-bg absolute inset-0 opacity-60" />
          <svg viewBox="0 0 1000 600" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <path d={path} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <motion.path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.02, (unlocked - 1) / 9) }} transition={{ duration: 1.6, ease: "easeInOut" }} />
          </svg>
          {CHAPTERS.map((c, i) => {
            const [x, y] = POS[i];
            const locked = c.n > unlocked;
            const stars = save.stars[c.n] ?? 0;
            const active = sel === c.n;
            return (
              <motion.button
                key={c.n}
                data-testid={`node-${c.n}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 260, damping: 18 }}
                whileHover={locked ? {} : { scale: 1.12 }}
                whileTap={locked ? {} : { scale: 0.95 }}
                onHoverStart={() => !locked && sfx.hover()}
                onClick={() => {
                  sfx.click();
                  setSel(c.n);
                }}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <div
                  className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-2xl sm:h-16 sm:w-16 sm:text-3xl"
                  style={{
                    background: locked ? "#15122a" : `radial-gradient(circle at 30% 30%, ${c.color}66, #0b0718 70%)`,
                    color: locked ? "rgba(255,255,255,0.2)" : c.color,
                    boxShadow: active ? `0 0 0 3px ${c.color}, 0 0 40px ${c.color}` : locked ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : `inset 0 0 0 1px ${c.color}66`,
                  }}
                >
                  {locked ? "🔒" : BOSS_GLYPH[c.boss]}
                  {c.n === unlocked && !stars && <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full" style={{ background: c.color }} />}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/60">{c.n}</div>
                <div className="text-[11px] leading-none text-amber-300">{"★".repeat(stars)}</div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.aside key={ch.n} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="panel flex flex-col p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: ch.color }}>
              Chapter {ch.n} · {ch.title}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-4xl" style={{ background: `radial-gradient(circle at 30% 30%, ${ch.color}55, #0b0718)`, color: ch.color, textShadow: `0 0 20px ${ch.color}` }}>
                {BOSS_GLYPH[ch.boss]}
              </div>
              <div>
                <h2 className="font-display text-2xl font-black tracking-wide" style={{ color: ch.color }}>
                  {ch.bossName}
                </h2>
                <div className="text-xs uppercase tracking-[0.25em] text-white/40">{ch.bossTitle}</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/70">{ch.intro}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {ch.topics.map((t) => (
                <Chip key={t} color={ch.color}>
                  {t}
                </Chip>
              ))}
            </div>
            <h3 className="mt-5 text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Rounds</h3>
            <ol className="mt-2 space-y-1.5 text-sm">
              {ch.missions.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${save.cleared.includes(m.id) ? "bg-emerald-400 text-black" : "bg-white/10 text-white/50"}`}>{save.cleared.includes(m.id) ? "✓" : i + 1}</span>
                  <span className="text-white/80">{m.title}</span>
                  {m.kind === "defense" && <span className="text-[10px] uppercase tracking-widest text-rose-300">defend</span>}
                </li>
              ))}
            </ol>
            <div className="mt-auto pt-6">
              {ch.n <= unlocked ? (
                <LinkButton href={`/battle/${ch.n}`} onClick={() => sfx.unlock()} variant="primary" size="lg" className="w-full font-display tracking-[0.3em]">
                  ENTER BATTLE
                </LinkButton>
              ) : (
                <div className="rounded-xl border border-white/10 p-3 text-center text-sm text-white/45">Defeat {CHAPTERS[ch.n - 2].bossName} to unlock.</div>
              )}
            </div>
          </motion.aside>
        </AnimatePresence>
      </div>
    </main>
  );
}
