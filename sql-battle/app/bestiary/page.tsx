"use client";
import { useEffect, useRef, useState } from "react";
import { StageHandle, StageView } from "@/components/battle/StageView";
import { BOSS_GLYPH } from "@/components/menu/bossGlyph";
import { Button, Chip, NavLink } from "@/components/ui/kit";
import { CHAPTERS } from "@/content/chapters";
import { sfx } from "@/game/audio/synth";
import { ATTACKS, AttackKind } from "@/lib/dialect/concepts";
import { useSave } from "@/lib/save";
import { orbitronFamily } from "../fonts";

const SPELL_SOURCE: Record<AttackKind, string> = {
  bolt: "WHERE / basic SELECT",
  chain: "JOIN",
  slam: "GROUP BY, aggregates",
  surge: "INSERT / UPDATE / DELETE",
  shield: "COMMIT / ROLLBACK / SAVEPOINT",
  forge: "CREATE / ALTER / constraints",
  mirror: "Subqueries, EXISTS",
  fusion: "UNION / INTERSECT / EXCEPT",
  haste: "CREATE INDEX / EXPLAIN",
  summon: "WITH (CTEs), recursion",
  blade: "Window functions (OVER)",
  storm: "MERGE / ON CONFLICT",
  vortex: "PIVOT / FILTER",
  lance: "JSON functions",
};

/** Meet the bosses and preview every spell's animation. */
export default function BestiaryPage() {
  const save = useSave();
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const stage = useRef<StageHandle>(null);
  const ch = CHAPTERS[idx];

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", ch.color);
  }, [ch.color]);

  async function play(fn: () => Promise<void> | undefined) {
    if (busy) return;
    sfx.unlock();
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-4">
        <NavLink href="/">← Menu</NavLink>
        <h1 className="font-display text-xl font-bold tracking-[0.25em]">BESTIARY</h1>
        <span className="text-xs text-white/40">Every boss, every spell</span>
      </header>
      <div className="flex gap-2 overflow-x-auto pb-1 scroll-thin" data-testid="boss-tabs">
        {CHAPTERS.map((c, i) => (
          <button
            key={c.boss}
            onClick={() => {
              sfx.click();
              setIdx(i);
            }}
            className="flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors"
            style={{ borderColor: i === idx ? c.color : "rgba(255,255,255,0.08)", background: i === idx ? `${c.color}22` : "transparent", color: i === idx ? c.color : "rgba(255,255,255,0.6)" }}
          >
            <span className="text-lg">{BOSS_GLYPH[c.boss]}</span>
            {c.bossName}
          </button>
        ))}
      </div>
      <div className="relative h-[46vh] min-h-[280px] overflow-hidden rounded-2xl border border-white/10">
        <StageView key={ch.boss} ref={stage} boss={ch.boss} accent={ch.color} reducedMotion={save.settings.reducedMotion} font={orbitronFamily} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="panel p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Your spells (which SQL casts them)</div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Object.values(ATTACKS).map((a) => {
              const hex = "#" + a.color.toString(16).padStart(6, "0");
              return (
                <button
                  key={a.kind}
                  data-attack={a.kind}
                  disabled={busy}
                  onClick={() => play(() => stage.current?.stage()?.attack("left", a.kind, a.color, 80 + a.tier * 30, a.tier >= 4, false))}
                  className="rounded-xl border p-2.5 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ borderColor: `${hex}55`, background: `linear-gradient(160deg, ${hex}22, transparent)` }}
                >
                  <div className="font-display text-xs font-bold tracking-wider" style={{ color: hex }}>
                    {a.name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/50">{SPELL_SOURCE[a.kind]}</div>
                  <div className="mt-1 text-[10px] text-white/30">tier {a.tier}</div>
                </button>
              );
            })}
          </div>
        </section>
        <aside className="panel flex flex-col gap-3 p-4">
          <div className="font-display text-lg font-bold" style={{ color: ch.color }}>
            {ch.bossName}
          </div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/40">{ch.bossTitle}</div>
          <p className="text-sm leading-relaxed text-white/65">{ch.intro}</p>
          <div className="flex flex-wrap gap-1.5">
            {ch.topics.slice(0, 4).map((t) => (
              <Chip key={t} color={ch.color}>
                {t}
              </Chip>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => play(() => stage.current?.stage()?.counter("right", 12))}>
              Boss attack
            </Button>
            <Button size="sm" disabled={busy} onClick={() => play(() => stage.current?.stage()?.attack("left", "vortex", 0xfde047, 999, true, true))}>
              Finisher
            </Button>
          </div>
        </aside>
      </div>
    </main>
  );
}
