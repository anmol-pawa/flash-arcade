import { Container, Sprite, Texture } from "pixi.js";
import { softDot, sparkTex } from "./textures";

export interface ParticleConf {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  sizeEnd?: number;
  color?: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
  spark?: boolean;
  /** attract toward a point (for charge-up effects) */
  toX?: number;
  toY?: number;
  pull?: number;
}

interface P extends Required<Omit<ParticleConf, "toX" | "toY" | "pull" | "spark">> {
  sprite: Sprite;
  age: number;
  spark: boolean;
  toX?: number;
  toY?: number;
  pull: number;
}

/** Pooled additive particle system. */
export class Particles {
  container = new Container();
  private pool: Sprite[] = [];
  private live: P[] = [];
  scale = 1; // reduced motion lowers this
  private readonly max = 900;

  constructor() {
    this.container.blendMode = "add";
  }

  emit(c: ParticleConf) {
    if (this.live.length >= this.max) return;
    const tex: Texture = c.spark ? sparkTex() : softDot();
    const s = this.pool.pop() ?? new Sprite();
    s.texture = tex;
    s.anchor.set(0.5);
    s.tint = c.color ?? 0xffffff;
    s.visible = true;
    this.container.addChild(s);
    this.live.push({
      sprite: s,
      x: c.x,
      y: c.y,
      vx: c.vx ?? 0,
      vy: c.vy ?? 0,
      life: c.life ?? 0.8,
      size: c.size ?? 12,
      sizeEnd: c.sizeEnd ?? 0,
      color: c.color ?? 0xffffff,
      alpha: c.alpha ?? 1,
      gravity: c.gravity ?? 0,
      drag: c.drag ?? 0.9,
      age: 0,
      spark: !!c.spark,
      toX: c.toX,
      toY: c.toY,
      pull: c.pull ?? 0,
    });
  }

  burst(x: number, y: number, o: { count?: number; speed?: number; color?: number; size?: number; life?: number; gravity?: number; spark?: boolean; spread?: number; angle?: number } = {}) {
    const n = Math.round((o.count ?? 30) * this.scale);
    for (let i = 0; i < n; i++) {
      const a = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 400) * (0.3 + Math.random() * 0.9);
      this.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: (o.life ?? 0.7) * (0.6 + Math.random() * 0.6),
        size: (o.size ?? 14) * (0.6 + Math.random() * 0.8),
        color: o.color,
        gravity: o.gravity ?? 0,
        drag: 0.9,
        spark: o.spark,
      });
    }
  }

  update(dt: number) {
    const keep: P[] = [];
    for (const p of this.live) {
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        this.container.removeChild(p.sprite);
        this.pool.push(p.sprite);
        continue;
      }
      if (p.toX !== undefined && p.toY !== undefined) {
        p.vx += (p.toX - p.x) * p.pull * dt;
        p.vy += (p.toY - p.y) * p.pull * dt;
      }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy = p.vy * d + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.age / p.life;
      const size = p.size + (p.sizeEnd - p.size) * k;
      const s = p.sprite;
      s.position.set(p.x, p.y);
      if (p.spark) {
        s.rotation = Math.atan2(p.vy, p.vx);
        s.scale.set((size / 16) * (1 + Math.hypot(p.vx, p.vy) / 500), size / 32);
      } else s.scale.set(size / 32);
      s.alpha = p.alpha * (1 - k * k);
      keep.push(p);
    }
    this.live = keep;
  }

  clear() {
    this.live.forEach((p) => {
      p.sprite.visible = false;
      this.container.removeChild(p.sprite);
      this.pool.push(p.sprite);
    });
    this.live = [];
  }
}
