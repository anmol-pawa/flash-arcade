"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { BossId } from "@/content/types";
import { BattleStage } from "@/game/render/stage";

export interface StageHandle {
  stage: () => BattleStage | null;
}

/** Hosts the PixiJS canvas. Handles React StrictMode double-mounting safely. */
export const StageView = forwardRef<StageHandle, { boss?: BossId; versus?: boolean; accent: string; reducedMotion: boolean; font: string; onReady?: () => void }>(function StageView(
  { boss, versus, accent, reducedMotion, font, onReady },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const stageRef = useRef<BattleStage | null>(null);
  const [failed, setFailed] = useState(false);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;

  useImperativeHandle(ref, () => ({ stage: () => stageRef.current }));

  useEffect(() => {
    let cancelled = false;
    let created: BattleStage | null = null;
    BattleStage.create(host.current!, { boss, versus, accent: parseInt(accent.slice(1), 16), reducedMotion, font })
      .then((s) => {
        if (cancelled) {
          s.destroy();
          return;
        }
        created = s;
        stageRef.current = s;
        readyCb.current?.();
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      created?.destroy();
      stageRef.current = null;
    };
    // the stage is rebuilt when the opponent changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boss, versus, accent]);

  useEffect(() => {
    stageRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  return (
    <div ref={host} className="absolute inset-0" data-testid="stage">
      {failed && <div className="flex h-full items-center justify-center text-sm text-white/50">WebGL is unavailable — the battle continues without animations.</div>}
    </div>
  );
});
