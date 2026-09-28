import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { Particles } from "./particles";
import { softDot } from "./textures";
import { Tweener, ease } from "./tween";

export interface Pt {
  x: number;
  y: number;
}

export interface FxContext {
  tw: Tweener;
  fx: Particles;
  layer: Container; // additive effects layer
  top: Container; // normal-blend overlay (text, solid shapes)
  camera: Camera;
  reduced: boolean;
  /** Display font family (resolved next/font name). */
  font: string;
}

/** Screen shake, zoom punch, hit-stop and flash. */
export class Camera {
  shakeAmt = 0;
  private shakeDecay = 8;
  timeScale = 1;
  private stopUntil = 0;
  now = 0;
  zoom = 1;
  focus: Pt = { x: 640, y: 360 };

  constructor(
    private view: Container,
    private flashRect: Graphics,
    private reduced: () => boolean,
  ) {}

  shake(amount: number, decay = 8) {
    if (this.reduced()) amount *= 0.2;
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeDecay = decay;
  }

  hitStop(sec: number) {
    if (this.reduced()) return;
    this.stopUntil = Math.max(this.stopUntil, this.now + sec);
  }

  flash(alpha = 0.6, color = 0xffffff) {
    if (this.reduced()) alpha *= 0.25;
    this.flashRect.tint = color;
    this.flashRect.alpha = Math.max(this.flashRect.alpha, alpha);
  }

  punch(at: Pt, amount = 0.06) {
    if (this.reduced()) return;
    this.focus = at;
    this.zoom = 1 + amount;
  }

  /** Returns the scaled dt for gameplay animation. */
  update(realDt: number): number {
    this.now += realDt;
    const frozen = this.now < this.stopUntil;
    this.shakeAmt *= Math.exp(-this.shakeDecay * realDt);
    const sx = (Math.random() - 0.5) * 2 * this.shakeAmt;
    const sy = (Math.random() - 0.5) * 2 * this.shakeAmt;
    this.zoom += (1 - this.zoom) * Math.min(1, realDt * 7);
    const z = this.zoom;
    this.view.pivot.set(this.focus.x, this.focus.y);
    this.view.position.set(this.focus.x + sx, this.focus.y + sy);
    this.view.scale.set(z);
    this.flashRect.alpha *= Math.exp(-9 * realDt);
    return frozen ? 0 : realDt * this.timeScale;
  }
}

export function glowSprite(color: number, size: number, alpha = 1): Sprite {
  const s = new Sprite(softDot());
  s.anchor.set(0.5);
  s.tint = color;
  s.alpha = alpha;
  s.scale.set(size / 32);
  s.blendMode = "add";
  return s;
}

/** A glowing orb that flies along an arc, leaving a trail. Resolves on impact. */
export async function projectile(c: FxContext, from: Pt, to: Pt, o: { color: number; size?: number; dur?: number; arc?: number; trail?: boolean; spark?: boolean } ): Promise<void> {
  const orb = new Container();
  const g = glowSprite(o.color, (o.size ?? 26) * 3, 0.9);
  const core = glowSprite(0xffffff, o.size ?? 26, 1);
  orb.addChild(g, core);
  orb.position.set(from.x, from.y);
  c.layer.addChild(orb);
  const arc = o.arc ?? -80;
  await c.tw.run(
    o.dur ?? 0.38,
    (k) => {
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * arc;
      orb.position.set(x, y);
      if (o.trail !== false && Math.random() < 0.9 * c.fx.scale) {
        c.fx.emit({ x, y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, size: (o.size ?? 26) * 0.8, life: 0.35, color: o.color, spark: o.spark });
      }
    },
    ease.inQuad,
  );
  orb.destroy({ children: true });
}

export async function beam(c: FxContext, from: Pt, to: Pt, o: { color: number; width?: number; dur?: number; jitter?: number }) {
  const g = new Graphics();
  c.layer.addChild(g);
  const w = o.width ?? 18;
  await c.tw.run(o.dur ?? 0.45, (k) => {
    g.clear();
    const life = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
    const width = w * life;
    const segs = 14;
    const pts: Pt[] = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const j = (o.jitter ?? 6) * (i === 0 || i === segs ? 0 : Math.random() - 0.5);
      pts.push({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u + j });
    }
    const line = (wd: number, col: number, a: number) => {
      g.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => g.lineTo(p.x, p.y));
      g.stroke({ width: wd, color: col, alpha: a, cap: "round" });
    };
    line(width * 2.4, o.color, 0.25 * life);
    line(width, o.color, 0.8 * life);
    line(width * 0.35, 0xffffff, life);
    if (Math.random() < 0.6 * c.fx.scale) c.fx.emit({ x: to.x, y: to.y, vx: (Math.random() - 0.5) * 400, vy: (Math.random() - 0.5) * 400, life: 0.3, size: 10, color: o.color, spark: true });
  });
  g.destroy();
}

export async function ring(c: FxContext, at: Pt, o: { color: number; radius?: number; dur?: number; width?: number; squash?: number }) {
  const g = new Graphics();
  g.position.set(at.x, at.y);
  g.scale.y = o.squash ?? 1;
  c.layer.addChild(g);
  const R = o.radius ?? 140;
  await c.tw.run(
    o.dur ?? 0.5,
    (k) => {
      g.clear();
      g.circle(0, 0, 10 + R * k).stroke({ width: (o.width ?? 10) * (1 - k) + 1, color: o.color, alpha: 1 - k });
    },
    ease.outCubic,
  );
  g.destroy();
}

export function lightning(c: FxContext, from: Pt, to: Pt, color: number, width = 5) {
  const g = new Graphics();
  c.layer.addChild(g);
  const draw = () => {
    g.clear();
    const segs = 10;
    g.moveTo(from.x, from.y);
    for (let i = 1; i <= segs; i++) {
      const u = i / segs;
      g.lineTo(from.x + (to.x - from.x) * u + (i < segs ? (Math.random() - 0.5) * 60 : 0), from.y + (to.y - from.y) * u);
    }
    g.stroke({ width: width * 2.5, color, alpha: 0.35 });
    g.moveTo(from.x, from.y);
    for (let i = 1; i <= segs; i++) {
      const u = i / segs;
      g.lineTo(from.x + (to.x - from.x) * u + (i < segs ? (Math.random() - 0.5) * 30 : 0), from.y + (to.y - from.y) * u);
    }
    g.stroke({ width, color: 0xffffff, alpha: 0.95 });
  };
  draw();
  return c.tw.run(0.28, (k) => {
    if (Math.random() < 0.5) draw();
    g.alpha = 1 - k;
  }).then(() => g.destroy());
}

export async function slash(c: FxContext, at: Pt, o: { color: number; angle?: number; size?: number; dur?: number }) {
  const g = new Graphics();
  g.position.set(at.x, at.y);
  g.rotation = o.angle ?? -0.6;
  c.layer.addChild(g);
  const R = o.size ?? 130;
  await c.tw.run(
    o.dur ?? 0.28,
    (k) => {
      g.clear();
      const a0 = -Math.PI * 0.8;
      const sweep = Math.PI * 1.1 * Math.min(1, k * 1.6);
      const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      g.arc(0, 0, R, a0, a0 + sweep).stroke({ width: 22 * fade, color: o.color, alpha: 0.35 * fade });
      g.arc(0, 0, R, a0, a0 + sweep).stroke({ width: 7 * fade, color: 0xffffff, alpha: fade });
    },
    ease.outCubic,
  );
  g.destroy();
}

/** Floating damage / status text. */
export function popText(c: FxContext, at: Pt, text: string, o: { color: number; size?: number; crit?: boolean; rise?: number }) {
  const t = new Text({
    text,
    style: {
      fontFamily: `${c.font}, system-ui, sans-serif`,
      fontSize: o.size ?? 54,
      fontWeight: "900",
      fill: o.color,
      stroke: { color: 0x0b0718, width: 8 },
      dropShadow: { color: o.color, blur: 16, distance: 0, alpha: 0.9 },
      letterSpacing: 2,
    },
  });
  t.anchor.set(0.5);
  t.position.set(at.x, at.y);
  t.scale.set(0.2);
  c.top.addChild(t);
  const rise = o.rise ?? 90;
  (async () => {
    await c.tw.to(t.scale, { x: o.crit ? 1.5 : 1.2, y: o.crit ? 1.5 : 1.2 }, 0.16, ease.outBack);
    await c.tw.to(t.scale, { x: 1, y: 1 }, 0.12);
    await c.tw.to(t, { y: at.y - rise, alpha: 0 }, 0.9, ease.inCubic);
    t.destroy();
  })();
}

export function banner(c: FxContext, at: Pt, text: string, color: number) {
  return popText(c, at, text, { color, size: 30, rise: 40 });
}
