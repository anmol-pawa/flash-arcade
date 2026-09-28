"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BOSS_GLYPH } from "@/components/menu/bossGlyph";
import { Button, DialectToggle, Modal } from "@/components/ui/kit";
import { CHAPTERS } from "@/content/chapters";
import { CODEX } from "@/content/codex";
import { setMusic, setVolume, sfx } from "@/game/audio/synth";
import { sqlClient } from "@/lib/db/client";
import { level, resetSave, unlockedChapters, updateSave, useSave } from "@/lib/save";

const FLOATER_WORDS = ["SELECT", "JOIN", "GROUP BY", "OVER (PARTITION BY)", "WITH RECURSIVE", "CONNECT BY PRIOR", "MERGE INTO", "ROLLBACK", "EXPLAIN", "NVL()", "COALESCE()", "FETCH FIRST", "LATERAL", "PIVOT", "EXISTS", "ROW_NUMBER()", "SAVEPOINT", "CREATE INDEX"];

// deterministic layout so server and client render the same markup
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const FLOATERS = FLOATER_WORDS.map((t, i) => ({ t, x: rand(i + 1) * 100, y: rand(i + 50) * 100, d: 14 + rand(i + 99) * 16, s: i % 3 }));

export default function Home() {
  const save = useSave();
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", "#5eead4");
    sqlClient().warmup(); // boot Postgres while the player reads the menu
  }, []);

  const cleared = Object.keys(save.stars).length;
  const totalStars = Object.values(save.stars).reduce((a, b) => a + b, 0);
  const next = CHAPTERS[Math.min(unlockedChapters(save), 10) - 1];

  const modes = [
    { href: `/battle/${next.n}`, title: cleared ? "Continue" : "Start campaign", sub: `Chapter ${next.n}: ${next.bossName}`, color: next.color, glyph: BOSS_GLYPH[next.boss], big: true },
    { href: "/campaign", title: "Campaign map", sub: `${cleared}/10 bosses · ${totalStars}★`, color: "#fbbf24", glyph: "⌖" },
    { href: "/arena", title: "Endless Arena", sub: `Best: ${save.arenaBest} waves`, color: "#f97316", glyph: "∞" },
    { href: "/versus", title: "Versus (hot-seat)", sub: "Two mages, one keyboard", color: "#f472b6", glyph: "⚔" },
    { href: "/sandbox", title: "Sandbox", sub: "Free SQL playground", color: "#60a5fa", glyph: "⌨" },
    { href: "/codex", title: "Codex", sub: `${save.codex.length}/${CODEX.length} entries unlocked: definitions, both dialects, enterprise use, quizzes`, color: "#a78bfa", glyph: "📖", wide: true },
    { href: "/bestiary", title: "Bestiary", sub: "Meet the bosses, preview every spell", color: "#4ade80", glyph: "☠" },
  ];

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      {FLOATERS.map((f, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute select-none font-mono font-bold text-[var(--accent)]"
          style={{ left: `${f.x}%`, top: `${f.y}%`, fontSize: 12 + f.s * 5, opacity: 0.06 + f.s * 0.03 }}
          animate={{ y: [0, -40, 0], opacity: [0.05, 0.14, 0.05] }}
          transition={{ duration: f.d, repeat: Infinity, ease: "easeInOut" }}
        >
          {f.t}
        </motion.div>
      ))}

      <div className="relative mx-auto flex max-w-6xl flex-col px-5 pb-16 pt-10 sm:pt-16">
        <header className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.3em] text-white/40">Lv {level(save.xp)} · {save.xp} XP</div>
          <div className="flex items-center gap-2">
            <DialectToggle value={save.dialect} onChange={(d) => updateSave((s) => ({ ...s, dialect: d }))} />
            <Button size="sm" onClick={() => setSettings(true)}>
              ⚙
            </Button>
          </div>
        </header>

        <section className="mt-12 text-center sm:mt-16">
          <motion.div initial={{ opacity: 0, letterSpacing: "0.8em" }} animate={{ opacity: 1, letterSpacing: "0.35em" }} transition={{ duration: 1.2, ease: "easeOut" }} className="text-[11px] font-bold uppercase text-white/50">
            Oracle · PostgreSQL · Battle Academy
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, scale: 0.8, filter: "blur(12px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.1 }}
            className="mt-3 font-display text-5xl font-black tracking-[0.12em] sm:text-7xl md:text-8xl"
          >
            <span className="text-white">QUERY</span>
            <span className="neon-text text-[var(--accent)]">CLASH</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
            A 1v1 battle game where <span className="text-white">SQL is your spellbook</span>. Defeat ten bosses, from the NULL-haunted intern to the all-seeing Optimizer, by writing real queries that run on a real Postgres engine in your browser. Every spell is taught in <span className="text-sky-300">PostgreSQL</span> and{" "}
            <span className="text-rose-300">Oracle</span>.
          </motion.p>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((m, i) => (
            <motion.div key={m.href} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.07, type: "spring", stiffness: 180, damping: 20 }} className={m.big ? "sm:col-span-2 lg:col-span-1 lg:row-span-2" : "wide" in m && m.wide ? "lg:col-span-2" : ""}>
              <Link
                href={m.href}
                onMouseEnter={() => sfx.hover()}
                onClick={() => {
                  sfx.unlock();
                  sfx.click();
                }}
                className="group relative flex h-full min-h-[112px] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-[#0e0a1f]/80 p-5 transition-transform duration-300 hover:-translate-y-1"
                style={{ boxShadow: `inset 0 0 0 1px ${m.color}22` }}
              >
                <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-30 blur-2xl transition-opacity duration-300 group-hover:opacity-60" style={{ background: m.color }} />
                <div className={`absolute right-5 top-4 font-display ${m.big ? "text-7xl" : "text-4xl"} opacity-80 transition-transform duration-300 group-hover:scale-110`} style={{ color: m.color, textShadow: `0 0 24px ${m.color}` }}>
                  {m.glyph}
                </div>
                <div className={`font-display font-bold tracking-wide ${m.big ? "text-2xl" : "text-lg"}`}>{m.title}</div>
                <div className="mt-1 text-sm text-white/55">{m.sub}</div>
                {m.big && <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1.5 font-display text-xs font-bold tracking-[0.3em] text-[#07050f]" style={{ background: m.color }}>PLAY ▸</div>}
              </Link>
            </motion.div>
          ))}
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            ["Write real SQL", "Your queries run on PostgreSQL 18, compiled to WebAssembly, inside your browser. Oracle mode checks Oracle rules, raises real ORA- errors, and shows the translation."],
            ["Concepts become attacks", "JOINs throw chains, window functions slash, recursive CTEs summon minions. Combos, fast casts and cheaper execution plans hit harder."],
            ["Learn it for real work", "Every win unlocks a Codex entry: a definition, syntax in both dialects, how it's used in enterprise systems, common pitfalls and a quiz."],
          ].map(([t, d]) => (
            <div key={t} className="panel p-5">
              <div className="font-display text-sm font-bold tracking-wider text-[var(--accent)]">{t}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{d}</p>
            </div>
          ))}
        </section>
      </div>

      <Modal open={settings} onClose={() => setSettings(false)}>
        <h2 className="font-display text-xl font-bold tracking-wider">Settings</h2>
        <div className="mt-5 space-y-4 text-sm">
          <label className="flex items-center justify-between gap-4">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={save.settings.volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                updateSave((s) => ({ ...s, settings: { ...s.settings, volume: v } }));
              }}
              className="w-40 accent-[var(--accent)]"
            />
          </label>
          {(
            [
              ["music", "Music"],
              ["reducedMotion", "Reduced motion (less shake, fewer particles)"],
              ["zen", "Zen mode (no round timer)"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center justify-between gap-4">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={save.settings[k]}
                onChange={(e) => {
                  if (k === "music") setMusic(e.target.checked);
                  updateSave((s) => ({ ...s, settings: { ...s.settings, [k]: e.target.checked } }));
                }}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
          ))}
          <div className="border-t border-white/10 pt-4">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm("Reset all progress, stars and Codex unlocks?")) resetSave();
              }}
            >
              Reset progress
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
