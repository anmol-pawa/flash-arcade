/**
 * A tiny promise-based tween engine driven by the stage ticker. Driving it
 * from the ticker (rather than setTimeout) means hit-stop and slow-motion just
 * scale `dt`, and everything freezes together.
 */
export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t: number) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  outElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

type Target = Record<string, unknown>;

interface Tween {
  target: Target;
  keys: string[];
  from: number[];
  to: number[];
  dur: number;
  t: number;
  ease: Ease;
  resolve: () => void;
  onUpdate?: (k: number) => void;
}

function get(obj: Target, path: string): number {
  const parts = path.split(".");
  let o: unknown = obj;
  for (const p of parts) o = (o as Target)[p];
  return o as number;
}

function set(obj: Target, path: string, v: number) {
  const parts = path.split(".");
  let o: Target = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] as Target;
  o[parts[parts.length - 1]] = v;
}

export class Tweener {
  private list: Tween[] = [];
  /** Set when the stage is destroyed: later tweens resolve immediately
   *  without touching their (possibly destroyed) targets. */
  private disposed = false;

  /** Animate numeric properties (dot paths allowed, e.g. "scale.x") to target values. */
  to(target: object, props: Record<string, number>, dur: number, e: Ease = ease.outCubic, onUpdate?: (k: number) => void): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const keys = Object.keys(props);
    const tgt = target as Target;
    // cancel conflicting tweens on the same keys
    for (const tw of this.list) {
      if (tw.target !== tgt) continue;
      for (let i = tw.keys.length - 1; i >= 0; i--) {
        if (!keys.includes(tw.keys[i])) continue;
        tw.keys.splice(i, 1);
        tw.from.splice(i, 1);
        tw.to.splice(i, 1);
      }
    }
    return new Promise((resolve) => {
      if (dur <= 0) {
        keys.forEach((k) => set(tgt, k, props[k]));
        resolve();
        return;
      }
      this.list.push({ target: tgt, keys, from: keys.map((k) => get(tgt, k)), to: keys.map((k) => props[k]), dur, t: 0, ease: e, resolve, onUpdate });
    });
  }

  /** A timer that respects hit-stop / time scale. */
  wait(sec: number): Promise<void> {
    return this.to({ v: 0 }, { v: 1 }, sec, ease.linear);
  }

  /** Drive a callback k∈[0,1] over `dur` seconds. */
  run(dur: number, fn: (k: number) => void, e: Ease = ease.linear): Promise<void> {
    return this.to({ v: 0 }, { v: 1 }, dur, e, (k) => fn(k));
  }

  update(dt: number) {
    if (!this.list.length) return;
    const done: Tween[] = [];
    for (const tw of this.list) {
      tw.t = Math.min(tw.dur, tw.t + dt);
      const k = tw.ease(tw.t / tw.dur);
      for (let i = 0; i < tw.keys.length; i++) {
        const target = tw.target as { destroyed?: boolean };
        if (target.destroyed) continue;
        set(tw.target, tw.keys[i], tw.from[i] + (tw.to[i] - tw.from[i]) * k);
      }
      tw.onUpdate?.(k);
      if (tw.t >= tw.dur) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter((t) => !done.includes(t));
      done.forEach((t) => t.resolve());
    }
  }

  /** Stop everything for good (stage teardown). */
  dispose() {
    this.disposed = true;
    const pending = this.list;
    this.list = [];
    pending.forEach((t) => t.resolve());
  }
}
