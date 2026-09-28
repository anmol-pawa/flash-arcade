"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ALL_MISSIONS, CHAPTERS, chapterByNumber, missionTime } from "@/content/chapters";
import { codexById } from "@/content/codex";
import type { BossId, Chapter } from "@/content/types";
import { sfx, startMusic, stopMusic, setMusic, setVolume } from "@/game/audio/synth";
import { MAX_FOCUS, initialState, reducer } from "@/game/engine/battle";
import { DamageResult, computeDamage, counterDamage, starsFor } from "@/game/engine/damage";
import { DbStatus, sqlClient, useDbStatus } from "@/lib/db/client";
import type { ResultSet } from "@/lib/db/engine";
import { detectConcepts } from "@/lib/dialect/concepts";
import type { Dialect } from "@/lib/dialect/lint";
import { unlockedChapters, updateSave, useSave } from "@/lib/save";
import { orbitronFamily } from "@/app/fonts";
import { Bar, Button, Chip, CodeBlock, DIALECT_COLOR, DIALECT_NAME, DialectToggle, LinkButton, Modal, RichText } from "../ui/kit";
import { Feedback, ResultPanel, ResultTab } from "./ResultPanel";
import { SchemaExplorer } from "./SchemaExplorer";
import { SpellDeck } from "./SpellDeck";
import { SqlEditor, SqlEditorHandle } from "./SqlEditor";
import { SymbolBar } from "./SymbolBar";
import { isTouch } from "@/lib/touch";
import { StageHandle, StageView } from "./StageView";

export type Mode = "campaign" | "arena" | "versus";

const HINT_COST = 20;
const SCOUT_COST = 15;
const BOSS_ORDER: BossId[] = CHAPTERS.map((c) => c.boss);

function shuffle<T>(xs: T[], seed = Date.now()): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Debrief {
  missionId: string;
  dmg: DamageResult;
  sql: string;
  dialect: Dialect;
  ko: boolean;
  newCodex: string[];
  side: "left" | "right";
}

export default function BattleScreen({ mode, chapter: chapterNo = 1, versusChapter = 10 }: { mode: Mode; chapter?: number; versusChapter?: number }) {
  const save = useSave();
  const [s, dispatch] = useReducer(reducer, undefined, initialState);
  const [wave, setWave] = useState(1);
  const [turn, setTurn] = useState<"left" | "right">("left");
  const [p2Dialect, setP2Dialect] = useState<Dialect>(save.dialect === "oracle" ? "postgres" : "oracle");
  const [sql, setSql] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tab, setTab] = useState<ResultTab>("result");
  const [expected, setExpected] = useState<ResultSet | null | undefined>(undefined);
  const [hints, setHints] = useState(0);
  const [banner, setBanner] = useState<{ title: string; sub?: string; color: string; chips?: string[] } | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const dbStatus = useDbStatus();
  const [stageReady, setStageReady] = useState(false);
  const [plan, setPlan] = useState<{ text?: string; label?: string }>({});
  const [paused, setPaused] = useState(false);
  const [endReady, setEndReady] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const stageBox = useRef<HTMLDivElement>(null);
  const stage = useRef<StageHandle>(null);
  const editor = useRef<SqlEditorHandle>(null);
  const busy = useRef(false);

  const chapter: Chapter = chapterByNumber(chapterNo) ?? CHAPTERS[0];
  const bossId: BossId | undefined = mode === "campaign" ? chapter.boss : mode === "arena" ? BOSS_ORDER[(wave - 1) % BOSS_ORDER.length] : undefined;
  const bossChapter = CHAPTERS.find((c) => c.boss === bossId);
  const accent = mode === "versus" ? "#f472b6" : (bossChapter?.color ?? chapter.color);
  const foeName = mode === "versus" ? "Player 2" : (bossChapter?.bossName ?? "");

  const mission = useMemo(() => ALL_MISSIONS.find((m) => m.id === s.missionIds[s.missionIndex]), [s.missionIds, s.missionIndex]);
  const activeSide: "left" | "right" = mode === "versus" ? turn : "left";
  const dialect: Dialect = mode === "versus" && turn === "right" ? p2Dialect : save.dialect;
  const maxCardChapter = mode === "campaign" ? chapterNo : mode === "versus" ? versusChapter : unlockedChapters(save);

  const setDialect = (d: Dialect) => {
    if (mode === "versus" && turn === "right") setP2Dialect(d);
    else updateSave((x) => ({ ...x, dialect: d }));
  };

  /* ------------------------------------------------------------ setup */
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);

  useEffect(() => {
    setVolume(save.settings.volume);
    setMusic(save.settings.music);
  }, [save.settings.volume, save.settings.music]);

  useEffect(() => () => stopMusic(), []);

  // build the mission list once
  useEffect(() => {
    let ids: string[];
    let foeHp: number;
    let playerHp = 100;
    if (mode === "campaign") {
      ids = chapter.missions.map((m) => m.id);
      foeHp = 100 * ids.length;
    } else if (mode === "arena") {
      const pool = ALL_MISSIONS.filter((m) => m.chapter <= unlockedChapters(save));
      ids = Array.from({ length: 12 }, (_, k) => shuffle(pool, Date.now() + k)).flat().map((m) => m.id);
      foeHp = 360;
    } else {
      const pool = ALL_MISSIONS.filter((m) => m.chapter <= versusChapter);
      ids = shuffle(pool).map((m) => m.id);
      foeHp = 200;
      playerHp = 200;
    }
    dispatch({ type: "load", missionIds: ids, player: { name: mode === "versus" ? "Player 1" : "Data Mage", hp: playerHp, maxHp: playerHp }, foe: { name: foeName, hp: foeHp, maxHp: foeHp } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chapterNo]);

  const st = () => stage.current?.stage() ?? null;

  const startRound = useCallback(
    (idx: number, side: "left" | "right" = activeSide) => {
      const m = ALL_MISSIONS.find((x) => x.id === s.missionIds[idx]);
      if (!m) return;
      const d = mode === "versus" && side === "right" ? p2Dialect : save.dialect;
      setSql(m.starter?.[d] ?? "");
      setFeedback(null);
      setHints(0);
      setExpected(undefined);
      setPlan({});
      setTab("result");
      const t = save.settings.zen && mode !== "versus" ? 9999 : missionTime(m, m.chapter);
      dispatch({ type: "begin-round", time: t });
      setBanner({
        title: mode === "versus" ? `${side === "left" ? "PLAYER 1" : "PLAYER 2"} — ${DIALECT_NAME[d].toUpperCase()}` : mode === "arena" ? `WAVE ${wave} · ROUND ${s.round + 1}` : `ROUND ${idx + 1}`,
        sub: m.title,
        color: mode === "versus" ? (side === "left" ? "#5eead4" : "#f9a8d4") : accent,
      });
      setTimeout(() => setBanner(null), 1500);
      setTimeout(() => editor.current?.focus(), 300);
    },
    [s.missionIds, s.round, mode, p2Dialect, save.dialect, save.settings.zen, wave, accent, activeSide],
  );

  const fight = () => {
    sfx.unlock();
    startMusic(mode === "versus" ? 98 : 82 + (bossChapter?.n ?? 1) * 6, 104 + (bossChapter?.n ?? 1) * 3);
    startRound(s.missionIndex, "left");
  };

  /* ------------------------------------------------------------ timer */
  useEffect(() => {
    if (s.phase !== "round" || paused || debrief) return;
    const id = setInterval(() => dispatch({ type: "tick", dt: 0.25 }), 250);
    return () => clearInterval(id);
  }, [s.phase, paused, debrief]);

  const timeoutFired = useRef(false);
  useEffect(() => {
    if (s.phase === "round" && s.timeLeft <= 0 && !timeoutFired.current && s.timeTotal < 9999) {
      timeoutFired.current = true;
      void onTimeout();
    }
    if (s.timeLeft > 0) timeoutFired.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.timeLeft, s.phase]);

  async function onTimeout() {
    if (busy.current) return;
    busy.current = true;
    sfx.error();
    if (mode === "versus") {
      setBanner({ title: "TIME UP", sub: "Turn passes", color: "#f87171" });
      setTimeout(() => setBanner(null), 1200);
      busy.current = false;
      nextTurn(s.missionIndex + 1);
      return;
    }
    const dmg = counterDamage(mission ? ALL_MISSIONS.find((x) => x.id === mission.id)!.chapter : 1, true);
    setBanner({ title: "TIME UP", sub: `${foeName} strikes!`, color: "#f87171" });
    setTimeout(() => setBanner(null), 1200);
    await st()?.counter("right", dmg, () => {
      sfx.hurt();
      dispatch({ type: "timeout", dmg });
    });
    await afterCounter(dmg);
    busy.current = false;
  }

  async function afterCounter(dmg: number) {
    const dead = s.player.hp - dmg <= 0;
    if (dead) {
      stopMusic();
      sfx.defeat();
      await st()?.ko("left");
      await st()?.victory("right");
      setEndReady(true);
    } else dispatch({ type: "resolve-miss" });
  }

  /* ------------------------------------------------------------ casting */
  async function cast() {
    if (!mission || s.phase !== "round" || busy.current || !sql.trim()) {
      if (!sql.trim()) sfx.error();
      return;
    }
    // On phones: close the keyboard and bring the arena into view for the fight.
    if (isTouch() || window.innerWidth < 1024) {
      (document.activeElement as HTMLElement | null)?.blur();
      const box = stageBox.current?.getBoundingClientRect();
      if (box && (box.top < 0 || box.bottom > window.innerHeight)) stageBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    busy.current = true;
    const side = activeSide;
    const other = side === "left" ? "right" : "left";
    dispatch({ type: "cast" });
    st()?.setCharging(side, true);
    sfx.charge();
    const [verdict] = await Promise.all([sqlClient().evaluate(mission.id, sql, dialect), new Promise((r) => setTimeout(r, 550))]);
    setFeedback({ run: verdict.run, correct: verdict.correct, reason: verdict.reason });
    if (verdict.plan) setPlan({ text: verdict.plan });

    if (verdict.correct) {
      const concepts = detectConcepts(sql);
      let dmg = computeDamage({ concepts, secondsLeft: s.timeLeft, totalSeconds: s.timeTotal, cost: verdict.cost, hintsUsed: s.hintsThisRound, attempts: s.attempts + 1 });
      if (mode === "versus") dmg = { ...dmg, damage: Math.round(dmg.damage * 0.45) };
      if (verdict.plan) setPlan({ text: verdict.plan, label: dmg.planLabel });
      const remaining = s.missionIds.length - s.missionIndex - 1;
      const finisher = mode === "campaign" && remaining === 0;
      const targetHp = side === "left" ? s.foe.hp : s.player.hp;
      const clamp = mode === "campaign";
      let shown = dmg.damage;
      if (clamp && !finisher && remaining > 0) shown = Math.min(shown, Math.max(1, s.foe.hp - remaining * 8));
      if (finisher) shown = Math.max(shown, s.foe.hp);
      const ko = finisher || (!clamp && targetHp - shown <= 0);

      const chips = [dmg.combo > 0 ? `${dmg.combo + 1}× COMBO` : "", dmg.planLabel, dmg.crit ? "CRITICAL" : "", finisher ? "FINISHER" : ""].filter(Boolean);
      setBanner({ title: dmg.attack.name.toUpperCase(), sub: `-${shown}`, color: "#" + dmg.attack.color.toString(16).padStart(6, "0"), chips });
      sfx.cast(dmg.attack.kind);
      await st()?.attack(side, dmg.attack.kind, dmg.attack.color, shown, dmg.crit, finisher || ko, () => {
        sfx.hit(dmg.crit || finisher);
        if (mode === "versus") dispatch({ type: "damage", target: side === "left" ? "foe" : "player", dmg: shown });
        else dispatch({ type: "hit", dmg, finisher, clamp });
      });
      setBanner(null);

      // rewards
      const newCodex = mission.codex.filter((c) => !save.codex.includes(c));
      updateSave((x) => ({ ...x, cleared: x.cleared.includes(mission.id) ? x.cleared : [...x.cleared, mission.id], codex: [...new Set([...x.codex, ...mission.codex])], xp: x.xp + Math.round(shown / 4) }));
      if (newCodex.length) sfx.unlockCodex();

      if (ko) {
        stopMusic();
        await st()?.ko(other);
        sfx.victory();
        st()?.victory(side);
      }
      setDebrief({ missionId: mission.id, dmg: { ...dmg, damage: shown }, sql, dialect, ko, newCodex, side });
    } else {
      sfx.miss();
      setTab("tutor");
      await st()?.fizzle(side);
      if (mode === "versus") {
        dispatch({ type: "resolve-miss" });
        busy.current = false;
        setTimeout(() => nextTurn(s.missionIndex + 1), 900);
        return;
      }
      const dmg = counterDamage(ALL_MISSIONS.find((x) => x.id === mission.id)!.chapter, false);
      await st()?.counter("right", dmg, () => {
        sfx.hurt();
        dispatch({ type: "miss", dmg });
      });
      await afterCounter(dmg);
    }
    busy.current = false;
  }

  function nextTurn(idx: number) {
    const nt = turn === "left" ? "right" : "left";
    setTurn(nt);
    dispatch({ type: "next" });
    setTimeout(() => startRound(idx, nt), 50);
  }

  function continueAfterDebrief() {
    const d = debrief;
    setDebrief(null);
    if (!d) return;
    if (mode === "versus") {
      if (d.ko) return finishVersus(d.side);
      nextTurn(s.missionIndex + 1);
      return;
    }
    if (mode === "arena" && d.ko) {
      const w = wave + 1;
      setWave(w);
      setStageReady(false);
      dispatch({ type: "wave", foe: { name: CHAPTERS.find((c) => c.boss === BOSS_ORDER[(w - 1) % 10])!.bossName, hp: 320 + w * 40, maxHp: 320 + w * 40 }, heal: 25 });
      updateSave((x) => ({ ...x, arenaBest: Math.max(x.arenaBest, w - 1) }));
      return;
    }
    if (d.ko) {
      dispatch({ type: "next" });
      setEndReady(true);
      return;
    }
    dispatch({ type: "next" });
    startRound(s.missionIndex + 1);
  }

  function finishVersus(winner: "left" | "right") {
    dispatch({ type: "end", won: winner === "left" });
    setEndReady(true);
  }

  // campaign victory bookkeeping
  const recorded = useRef(false);
  useEffect(() => {
    if (s.phase === "victory" && mode === "campaign" && !recorded.current) {
      recorded.current = true;
      const stars = starsFor(s.player.hp / s.player.maxHp, s.stats.hints);
      updateSave((x) => ({ ...x, stars: { ...x.stars, [chapterNo]: Math.max(x.stars[chapterNo] ?? 0, stars) }, xp: x.xp + stars * 60 }));
    }
    if (s.phase === "defeat" && mode === "arena") updateSave((x) => ({ ...x, arenaBest: Math.max(x.arenaBest, wave - 1) }));
  }, [s.phase, mode, chapterNo, s.player.hp, s.player.maxHp, s.stats.hints, wave]);

  /* ------------------------------------------------------------ actions */
  async function preview() {
    if (!sql.trim() || busy.current) return;
    const run = await sqlClient().run(sql, dialect);
    setFeedback({ run, preview: true });
    setTab(run.ok ? "result" : "tutor");
  }

  function buyHint() {
    if (!mission || hints >= mission.hints.length || s.focus < HINT_COST) return sfx.error();
    dispatch({ type: "hint", cost: HINT_COST });
    setHints((h) => h + 1);
  }

  async function scout() {
    if (!mission || s.scouted || s.focus < SCOUT_COST) return;
    dispatch({ type: "scout", cost: SCOUT_COST });
    setExpected(undefined);
    try {
      setExpected(await sqlClient().expected(mission.id, dialect));
    } catch {
      setExpected(null);
    }
  }

  function reveal() {
    if (!mission) return;
    for (let i = 0; i < 3; i++) dispatch({ type: "hint", cost: 0 });
    setHints(mission.hints.length);
    setSql(mission.solution[dialect]);
  }

  const phaseLocked = s.phase !== "round";
  const timePct = s.timeTotal >= 9999 ? 1 : s.timeLeft / Math.max(1, s.timeTotal);

  /* ------------------------------------------------------------ render */
  return (
    <div className="flex min-h-dvh flex-col pb-24 lg:h-dvh lg:pb-0">
      {/* top bar */}
      <header className="flex items-center gap-2 border-b sm:gap-3 border-white/5 bg-black/30 px-4 py-2 backdrop-blur">
        <Link href={mode === "campaign" ? "/campaign" : "/"} className="shrink-0 text-sm text-white/50 hover:text-white">
          ← {mode === "campaign" ? "Map" : "Menu"}
        </Link>
        <div className="hidden font-display text-sm font-bold tracking-[0.3em] text-white/80 sm:block">
          QUERY<span className="text-[var(--accent)]">CLASH</span>
        </div>
        <div className="hidden text-xs text-white/40 sm:block">
          {mode === "campaign" ? `Chapter ${chapter.n} · ${chapter.title}` : mode === "arena" ? `Endless Arena · best ${save.arenaBest} waves` : "Hot-seat versus"}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <DbBadge status={dbStatus} />
          <DialectToggle value={dialect} onChange={setDialect} disabled={s.phase === "casting"} />
          <button
            onClick={() => updateSave((x) => ({ ...x, settings: { ...x.settings, music: !x.settings.music } }))}
            className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-white/60 hover:text-white"
            title="Toggle music"
          >
            {save.settings.music ? "♫" : "♫̸"}
          </button>
        </div>
      </header>

      {/* HUD */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Portrait color="#5eead4" glyph="✦" active={activeSide === "left"} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Bar value={s.player.hp} max={s.player.maxHp} color="#34d399" label={s.player.name || "Data Mage"} />
            {mode !== "versus" && <Bar value={s.focus} max={MAX_FOCUS} color="#818cf8" height={6} />}
          </div>
        </div>
        <TimerRing pct={timePct} seconds={s.timeLeft} zen={s.timeTotal >= 9999} round={s.missionIndex + 1} total={mode === "campaign" ? s.missionIds.length : undefined} />
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <Bar value={s.foe.hp} max={s.foe.maxHp} color={accent} label={foeName} align="right" />
            {mode !== "versus" && bossChapter && <div className="mt-1 hidden truncate text-right text-[10px] uppercase tracking-[0.25em] text-white/35 sm:block">{bossChapter.bossTitle}</div>}
          </div>
          <Portrait color={accent} glyph={mode === "versus" ? "✦" : "☠"} active={activeSide === "right"} />
        </div>
      </div>

      {/* stage */}
      <div ref={stageBox} className="relative mx-3 h-[38vh] min-h-[230px] scroll-mt-2 overflow-hidden rounded-2xl border border-white/10 lg:h-auto lg:min-h-[260px] lg:flex-[0_0_40vh]">
        <StageView key={`${bossId ?? "versus"}-${wave}`} ref={stage} boss={bossId} versus={mode === "versus"} accent={accent} reducedMotion={save.settings.reducedMotion} font={orbitronFamily} onReady={() => setStageReady(true)} />
        <AnimatePresence>
          {banner && (
            <motion.div key={banner.title + banner.sub} className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center" initial={{ opacity: 0, scale: 1.4, filter: "blur(8px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, y: -20 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
              <div className="font-display text-2xl font-black tracking-[0.25em] sm:text-4xl" style={{ color: banner.color, textShadow: `0 0 24px ${banner.color}, 0 2px 0 #000` }}>
                {banner.title}
              </div>
              {banner.sub && <div className="mt-1 font-display text-sm tracking-[0.2em] text-white/80">{banner.sub}</div>}
              {banner.chips && banner.chips.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {banner.chips.map((c) => (
                    <motion.span key={c} initial={{ scale: 0 }} animate={{ scale: 1 }} className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold tracking-widest text-amber-200 ring-1 ring-amber-300/40">
                      {c}
                    </motion.span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {(s.phase === "loading" || !stageReady) && <div className="absolute inset-0 flex items-center justify-center bg-[#07050f]/60 font-display text-xs tracking-[0.4em] text-white/50">SUMMONING ARENA…</div>}
      </div>

      {/* workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(300px,400px)]">
        {/* mission */}
        <section className="panel flex min-h-0 flex-col gap-3 overflow-hidden p-4">
          {mission ? (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--accent)]">{mission.kind === "defense" ? "Defend!" : "Mission"}</span>
                  <Chip color={DIALECT_COLOR[dialect]}>{DIALECT_NAME[dialect]}</Chip>
                </div>
                <h2 className="mt-1 font-display text-lg font-bold tracking-wide" data-mission-id={mission.id}>
                  {mission.title}
                </h2>
                <p className="mt-1 text-xs italic text-white/45">&ldquo;{mission.taunt}&rdquo;</p>
                <p className="mt-2 text-sm leading-relaxed text-white/85" data-testid="mission-task">
                  <RichText text={mission.task} />
                </p>
              </div>
              <div className="space-y-1.5">
                {mission.hints.slice(0, hints).map((h, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-2.5 py-1.5 font-mono text-[11.5px] leading-snug text-amber-100/85">
                    <span className="mr-1 text-amber-300">◆</span>
                    {h}
                  </motion.div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {mode !== "versus" && (
                    <Button size="sm" onClick={buyHint} disabled={phaseLocked || hints >= mission.hints.length || s.focus < HINT_COST}>
                      💡 Hint · {HINT_COST}
                    </Button>
                  )}
                  {s.attempts >= 2 && hints >= mission.hints.length && mode !== "versus" && (
                    <Button size="sm" onClick={reveal} disabled={phaseLocked}>
                      Reveal answer
                    </Button>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 scroll-thin">
                {/* collapsible on phones, always open on desktop */}
                <button
                  type="button"
                  onClick={() => setSchemaOpen((o) => !o)}
                  className="mb-1.5 flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-[0.25em] text-white/35 lg:pointer-events-none"
                >
                  Schema
                  <span className="text-xs lg:hidden">{schemaOpen ? "▾ hide" : "▸ show tables"}</span>
                </button>
                <div className={schemaOpen ? "block" : "hidden lg:block"}>
                  <SchemaExplorer key={mission.id} dialect={dialect} highlight={mission.tables} onInsert={(t) => editor.current?.insert(t)} />
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-white/40">Preparing…</div>
          )}
        </section>

        {/* editor */}
        <section className="panel flex min-h-[340px] flex-col gap-3 p-4">
          <SpellDeck dialect={dialect} maxChapter={maxCardChapter} onCast={(tpl) => editor.current?.insert(tpl)} />
          <div className="relative min-h-[160px] flex-1">
            <SqlEditor ref={editor} value={sql} onChange={setSql} dialect={dialect} onRun={cast} onPreview={preview} readOnly={s.phase === "casting"} />
          </div>
          <SymbolBar onInsert={(k) => editor.current?.insert(k)} />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={preview} disabled={phaseLocked || dbStatus !== "ready"} title="Run without attacking (Ctrl/⌘+Shift+Enter)">
              ▷ Preview
            </Button>
            <Button size="sm" onClick={() => setSql("")} disabled={phaseLocked}>
              Clear
            </Button>
            <span className="hide-on-touch ml-auto hidden text-[11px] text-white/35 sm:inline">Ctrl/⌘ + Enter</span>
            <motion.div className="ml-auto hidden lg:block" animate={s.phase === "round" && sql.trim() ? { scale: [1, 1.04, 1] } : {}} transition={{ repeat: Infinity, duration: 1.6 }}>
              <Button variant="primary" size="lg" onClick={cast} disabled={phaseLocked || dbStatus !== "ready" || !sql.trim()} className="font-display tracking-[0.2em]">
                {s.phase === "casting" ? "CASTING…" : "⚡ CAST"}
              </Button>
            </motion.div>
          </div>
        </section>

        {/* results */}
        <section className="panel flex min-h-[300px] flex-col p-4">
          <ResultPanel
            tab={tab}
            setTab={setTab}
            feedback={feedback}
            expected={expected}
            scouted={s.scouted}
            onScout={scout}
            scoutCost={SCOUT_COST}
            canScout={!phaseLocked && s.focus >= SCOUT_COST}
            dialect={dialect}
            sql={sql}
            plan={plan.text}
            planLabel={plan.label}
            hideTarget={mode === "versus"}
          />
        </section>
      </div>

      {/* phones/tablets: CAST stays under the thumb while scrolling */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-white/10 bg-[#07050f]/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        <Button size="sm" onClick={preview} disabled={phaseLocked || dbStatus !== "ready" || !sql.trim()}>
          ▷ Preview
        </Button>
        <div className="font-mono text-xs text-white/40 tabular-nums">{s.timeTotal >= 9999 ? "∞" : `${Math.ceil(s.timeLeft)}s`}</div>
        <Button variant="primary" onClick={cast} disabled={phaseLocked || dbStatus !== "ready" || !sql.trim()} className="ml-auto flex-1 py-3 font-display tracking-[0.2em]">
          {s.phase === "casting" ? "CASTING…" : "⚡ CAST"}
        </Button>
      </div>

      {/* intro */}
      <Modal open={s.phase === "intro"}>
        <IntroCard mode={mode} chapter={bossChapter ?? chapter} wave={wave} ready={dbStatus === "ready" && stageReady} status={dbStatus} onFight={fight} p2Dialect={p2Dialect} setP2Dialect={setP2Dialect} />
      </Modal>

      {/* debrief */}
      <Modal open={!!debrief} wide>
        {debrief && <DebriefCard d={debrief} mode={mode} onContinue={continueAfterDebrief} />}
      </Modal>

      {/* end screens */}
      <Modal open={(s.phase === "victory" || s.phase === "defeat") && endReady}>
        <EndCard mode={mode} won={mode === "versus" ? s.player.hp > 0 : s.phase === "victory"} versusWinner={s.player.hp > 0 ? "Player 1" : "Player 2"} chapter={chapter} stats={s.stats} hp={s.player.hp / s.player.maxHp} wave={wave} />
      </Modal>

      {/* pause when tab hidden */}
      <VisibilityPause onChange={setPaused} />
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function VisibilityPause({ onChange }: { onChange: (p: boolean) => void }) {
  useEffect(() => {
    const f = () => onChange(document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [onChange]);
  return null;
}

function DbBadge({ status }: { status: DbStatus }) {
  const map = { booting: ["#fbbf24", "Booting Postgres"], ready: ["#34d399", "PG 18 · WASM"], error: ["#f87171", "Engine error"] } as const;
  const [c, label] = map[status];
  return (
    <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/50 md:inline-flex" title="The database runs in your browser (PGlite)">
      <span className={`h-1.5 w-1.5 rounded-full ${status === "booting" ? "animate-pulse" : ""}`} style={{ background: c }} />
      {label}
    </span>
  );
}

function Portrait({ color, glyph, active }: { color: string; glyph: string; active: boolean }) {
  return (
    <motion.div
      data-portrait
      animate={{ boxShadow: active ? `0 0 0 2px ${color}, 0 0 24px -2px ${color}` : "0 0 0 1px rgba(255,255,255,0.1)" }}
      className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl sm:flex"
      style={{ background: `radial-gradient(circle at 30% 30%, ${color}55, #0b0718)`, color }}
    >
      {glyph}
    </motion.div>
  );
}

function TimerRing({ pct, seconds, zen, round, total }: { pct: number; seconds: number; zen: boolean; round: number; total?: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const low = !zen && pct < 0.2;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-14 w-14">
        <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
          <circle cx="28" cy="28" r={r} fill="none" stroke={low ? "#f87171" : "var(--accent)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 0.25s linear" }} />
        </svg>
        <div className={`absolute inset-0 flex items-center justify-center font-mono text-sm font-bold tabular-nums ${low ? "animate-pulse text-rose-300" : "text-white/90"}`}>{zen ? "∞" : Math.ceil(seconds)}</div>
      </div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
        Round {round}
        {total ? `/${total}` : ""}
      </div>
    </div>
  );
}

function IntroCard({ mode, chapter, wave, ready, status, onFight, p2Dialect, setP2Dialect }: { mode: Mode; chapter: Chapter; wave: number; ready: boolean; status: DbStatus; onFight: () => void; p2Dialect: Dialect; setP2Dialect: (d: Dialect) => void }) {
  return (
    <div className="text-center">
      {mode === "versus" ? (
        <>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-pink-300">Hot-seat duel</div>
          <h2 className="mt-2 font-display text-3xl font-black tracking-wider">Mage vs Mage</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/65">Two players, one keyboard. Take turns solving the mission on screen: a correct query hits your rival, a wrong one hands them the turn. Each player picks their own dialect.</p>
          <div className="mt-4 flex flex-col items-center gap-2 text-xs text-white/50">
            Player 2 dialect
            <DialectToggle value={p2Dialect} onChange={setP2Dialect} />
          </div>
        </>
      ) : (
        <>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: chapter.color }}>
            {mode === "arena" ? `Endless Arena · Wave ${wave}` : `Chapter ${chapter.n} · ${chapter.title}`}
          </div>
          <h2 className="mt-2 font-display text-3xl font-black tracking-wider" style={{ color: chapter.color, textShadow: `0 0 30px ${chapter.color}` }}>
            {chapter.bossName}
          </h2>
          <div className="text-xs uppercase tracking-[0.3em] text-white/40">{chapter.bossTitle}</div>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/70">{mode === "arena" ? "Missions come from every chapter you have unlocked. Survive as many waves as you can. You heal between waves." : chapter.intro}</p>
          {mode === "campaign" && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {chapter.topics.map((t) => (
                <Chip key={t} color={chapter.color}>
                  {t}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}
      <div className="mt-6 flex justify-center">
        <Button variant="primary" size="lg" onClick={onFight} disabled={!ready} className="font-display tracking-[0.3em]">
          {ready ? "FIGHT" : status === "error" ? "ENGINE FAILED" : "LOADING ENGINE…"}
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-white/35">Tip: tap (or drag) spell cards and schema names into the editor. On a keyboard, Ctrl/⌘+Enter casts.</p>
    </div>
  );
}

function DebriefCard({ d, mode, onContinue }: { d: Debrief; mode: Mode; onContinue: () => void }) {
  const m = ALL_MISSIONS.find((x) => x.id === d.missionId)!;
  const entries = m.codex.map(codexById).filter(Boolean);
  const mult = d.dmg.mult;
  return (
    <div data-testid="debrief">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-display text-xl font-black tracking-widest" style={{ color: "#" + d.dmg.attack.color.toString(16).padStart(6, "0") }}>
          {d.dmg.attack.name}
        </div>
        <div className="font-display text-xl font-black text-white">−{d.dmg.damage}</div>
        {d.ko && <Chip color="#fde047">K.O.</Chip>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <Chip>combo ×{mult.combo.toFixed(2)}</Chip>
        <Chip>speed ×{mult.speed.toFixed(2)}</Chip>
        <Chip>plan ×{mult.plan.toFixed(2)}</Chip>
        {mult.hints < 1 && <Chip color="#fbbf24">hints ×{mult.hints.toFixed(2)}</Chip>}
        {d.dmg.crit && <Chip color="#fde047">crit ×1.5</Chip>}
      </div>

      <h3 className="mt-5 text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Canonical answers — learn both dialects</h3>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <CodeBlock code={m.solution.postgres} label="PostgreSQL" color="#60a5fa" />
        <CodeBlock code={m.solution.oracle} label="Oracle" color="#f87171" />
      </div>
      {m.solution.postgres === m.solution.oracle && <p className="mt-1.5 text-xs text-white/45">Identical in both. This is portable ANSI SQL.</p>}

      {entries.map((e) => (
        <div key={e!.id} className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--accent)]">Codex · {e!.category}</span>
            {d.newCodex.includes(e!.id) && <Chip color="#fde047">NEW</Chip>}
          </div>
          <div className="mt-1 font-display text-base font-bold">{e!.title}</div>
          <p className="mt-1 text-sm leading-relaxed text-white/75">{e!.definition}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            <span className="font-semibold text-emerald-300">In the enterprise: </span>
            {e!.enterprise}
          </p>
        </div>
      ))}

      <div className="mt-6 flex justify-end gap-2">
        <Link href="/codex" target="_blank" className="self-center text-xs text-white/40 hover:text-white">
          Open Codex ↗
        </Link>
        <Button variant="primary" onClick={onContinue}>
          {d.ko ? (mode === "arena" ? "Next wave →" : "Claim victory →") : mode === "versus" ? "Next turn →" : "Next round →"}
        </Button>
      </div>
    </div>
  );
}

function EndCard({ mode, won, versusWinner, chapter, stats, hp, wave }: { mode: Mode; won: boolean; versusWinner: string; chapter: Chapter; stats: ReturnType<typeof initialState>["stats"]; hp: number; wave: number }) {
  const stars = starsFor(hp, stats.hints);
  const next = chapterByNumber(chapter.n + 1);
  return (
    <div className="text-center" data-testid="end-card">
      <div className={`font-display text-4xl font-black tracking-[0.2em] ${won ? "text-amber-300" : "text-rose-400"}`} style={{ textShadow: won ? "0 0 30px #fbbf24" : "0 0 30px #f43f5e" }}>
        {mode === "versus" ? `${versusWinner.toUpperCase()} WINS` : mode === "arena" ? "RUN OVER" : won ? "VICTORY" : "DEFEATED"}
      </div>
      {mode === "campaign" && won && (
        <>
          <div className="mt-3 flex justify-center gap-2 text-4xl">
            {[1, 2, 3].map((i) => (
              <motion.span key={i} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.3 + i * 0.2, type: "spring" }} className={i <= stars ? "text-amber-300 drop-shadow-[0_0_12px_#fbbf24]" : "text-white/15"}>
                ★
              </motion.span>
            ))}
          </div>
          <p className="mx-auto mt-3 max-w-sm text-sm text-white/65">{chapter.defeat}</p>
        </>
      )}
      {mode === "arena" && <p className="mt-3 text-sm text-white/65">You cleared {wave - 1} wave{wave - 1 === 1 ? "" : "s"}.</p>}
      {mode === "campaign" && !won && <p className="mt-3 text-sm text-white/65">Study the Codex and the Tutor tab, then try again. Every attempt teaches the pattern.</p>}
      <div className="mx-auto mt-5 grid max-w-sm grid-cols-3 gap-2 text-center">
        {[
          ["Hits", stats.hits],
          ["Misses", stats.misses],
          ["Crits", stats.crits],
          ["Damage", stats.damageDealt],
          ["Best combo", stats.bestCombo + 1],
          ["Hints", stats.hints],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-white/10 bg-white/[0.03] py-2">
            <div className="font-display text-lg font-bold">{v}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">{k}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Rematch</Button>
        {mode === "campaign" && won && next && (
          <LinkButton href={`/battle/${next.n}`} variant="primary">
            Next: {next.bossName} →
          </LinkButton>
        )}
        <LinkButton href={mode === "campaign" ? "/campaign" : "/"}>{mode === "campaign" ? "Campaign map" : "Main menu"}</LinkButton>
      </div>
    </div>
  );
}
