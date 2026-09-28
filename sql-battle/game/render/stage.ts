/**
 * BattleStage — the PixiJS arena. Owns the renderer, the parallax background,
 * the two fighters, the effects layers and the camera, and exposes a small
 * promise-based API the React battle screen drives:
 *
 *   await stage.attack("left", "blade", color, 142, true, false)
 *   await stage.counter(12)
 */
import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import type { BossId } from "@/content/types";
import type { AttackKind } from "@/lib/dialect/concepts";
import { bossAttack, performAttack } from "./attacks";
import { Boss, createBoss } from "./characters/bosses";
import { MAGE_BLUE, MAGE_ROSE, Mage } from "./characters/mage";
import type { Character, RigContext } from "./characters/rig";
import { Camera, FxContext, popText, ring } from "./fx";
import { Particles } from "./particles";
import { skyTex, vignetteTex } from "./textures";
import { Tweener, ease } from "./tween";

export const W = 1280;
export const H = 720;
const GROUND = 600;
const HORIZON = 440;

export type Side = "left" | "right";

export interface StageOptions {
  boss?: BossId;
  versus?: boolean;
  accent: number;
  reducedMotion: boolean;
  font: string;
}

const KEYWORDS = ["SELECT", "JOIN", "WHERE", "GROUP BY", "OVER()", "WITH", "MERGE", "COMMIT", "INDEX", "NULL", "EXISTS", "UNION", "{ }", "ROWNUM", "LATERAL", "PIVOT"];

function mix(a: number, b: number, k: number) {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  const r = Math.round(ar + (br - ar) * k),
    g = Math.round(ag + (bg - ag) * k),
    bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

export class BattleStage {
  private app = new Application();
  private fit = new Container();
  private camera = new Container();
  private bg = new Container();
  private floor = new Graphics();
  private stars: Graphics[] = [new Graphics(), new Graphics(), new Graphics()];
  private floorLines = new Graphics();
  private glyphs: Text[] = [];
  private fighters = new Container();
  private fxLayer = new Container();
  private top = new Container();
  private flashRect = new Graphics();
  private vignette!: Sprite;
  private tw = new Tweener();
  private fx = new Particles();
  private cam!: Camera;
  private fxc!: FxContext;
  private rig!: RigContext;
  left!: Mage;
  right!: Character;
  private t = 0;
  private destroyed = false;
  private opts: StageOptions;
  private starSeed: { x: number; y: number; r: number; p: number }[] = [];

  private constructor(opts: StageOptions) {
    this.opts = opts;
  }

  static async create(host: HTMLElement, opts: StageOptions): Promise<BattleStage> {
    const s = new BattleStage(opts);
    await s.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      preference: "webgl",
    });
    host.appendChild(s.app.canvas);
    s.app.canvas.style.width = "100%";
    s.app.canvas.style.height = "100%";
    s.app.canvas.style.display = "block";
    s.build();
    s.app.renderer.on("resize", () => s.layout());
    s.layout();
    s.app.ticker.add((tk) => s.frame(Math.min(0.05, tk.deltaMS / 1000)));
    return s;
  }

  private build() {
    const { accent, reducedMotion } = this.opts;
    this.fx.scale = reducedMotion ? 0.35 : 1;

    // background
    const sky = new Sprite(skyTex(hex(mix(0x05030d, accent, 0.05)), hex(mix(0x0b0718, accent, 0.28)), hex(mix(0x0b0718, accent, 0.12))));
    sky.width = W + 2600;
    sky.height = H + 1200;
    sky.position.set(-1300, -600);
    this.bg.addChild(sky);

    for (let i = 0; i < 160; i++) this.starSeed.push({ x: -600 + Math.random() * (W + 1200), y: -200 + Math.random() * (HORIZON * 0.9 + 200), r: Math.random() * 1.6 + 0.3, p: Math.random() * 10 });
    this.starSeed.forEach((st, i) => this.stars[i % 3].circle(st.x, st.y, st.r).fill({ color: 0xffffff }));
    this.bg.addChild(...this.stars);

    // moon / data core
    const moon = new Graphics();
    moon.circle(W * 0.5, 200, 120).fill({ color: mix(0x0b0718, accent, 0.5), alpha: 0.5 });
    for (let i = 0; i < 7; i++) moon.rect(W * 0.5 - 120, 110 + i * 26, 240, 8).fill({ color: mix(0x05030d, accent, 0.15), alpha: 0.9 });
    this.bg.addChild(moon);

    // skyline silhouettes (two parallax bands)
    for (let band = 0; band < 2; band++) {
      const city = new Graphics();
      let x = -700;
      while (x < W + 700) {
        const w = 40 + Math.random() * 70;
        const h = (band ? 60 : 110) + Math.random() * (band ? 70 : 130);
        city.rect(x, HORIZON - h, w, h).fill({ color: band ? 0x0a0716 : mix(0x0a0716, accent, 0.08) });
        for (let wy = HORIZON - h + 10; wy < HORIZON - 10; wy += 14)
          for (let wx = x + 6; wx < x + w - 8; wx += 12) if (Math.random() < 0.18) city.rect(wx, wy, 5, 6).fill({ color: accent, alpha: 0.25 + Math.random() * 0.4 });
        x += w + 4;
      }
      city.alpha = band ? 1 : 0.8;
      this.bg.addChild(city);
    }

    for (let i = 0; i < 14; i++) {
      const t = new Text({ text: KEYWORDS[i % KEYWORDS.length], style: { fontFamily: "monospace", fontSize: 14 + Math.random() * 14, fill: accent, fontWeight: "700" } });
      t.alpha = 0.08 + Math.random() * 0.1;
      t.position.set(Math.random() * W, Math.random() * HORIZON);
      this.glyphs.push(t);
      this.bg.addChild(t);
    }
    // static floor: base + converging lines (scrolling lines are redrawn per frame)
    this.floor.rect(-1300, HORIZON, W + 2600, H - HORIZON + 600).fill({ color: mix(0x05030d, accent, 0.06) });
    for (let i = -30; i <= 30; i++) this.floor.moveTo(W / 2 + i * 12, HORIZON).lineTo(W / 2 + i * 150, H + 60);
    this.floor.stroke({ width: 1.5, color: accent, alpha: 0.28 });
    this.floor.moveTo(-1300, HORIZON).lineTo(W + 1300, HORIZON).stroke({ width: 3, color: accent, alpha: 0.7 });
    this.bg.addChild(this.floor, this.floorLines);

    this.rig = { tw: this.tw, fx: this.fx, reduced: reducedMotion, space: this.camera };

    this.left = new Mage(this.rig, MAGE_BLUE);
    this.left.root.position.set(300, GROUND);
    this.left.homeX = 300;
    if (this.opts.versus || !this.opts.boss) {
      const m = new Mage(this.rig, MAGE_ROSE);
      m.flip();
      this.right = m;
    } else {
      const b = createBoss(this.opts.boss, this.rig);
      b.flip();
      this.right = b;
    }
    this.right.root.position.set(975, GROUND);
    this.right.homeX = 975;
    this.fighters.addChild(this.left.root, this.right.root);

    this.fxLayer.blendMode = "add";
    this.camera.addChild(this.bg, this.fighters, this.fx.container, this.fxLayer, this.top);

    this.flashRect.rect(0, 0, 16, 16).fill({ color: 0xffffff });
    this.flashRect.alpha = 0;
    this.vignette = new Sprite(vignetteTex());
    this.fit.addChild(this.camera);
    this.app.stage.addChild(this.fit, this.vignette, this.flashRect);

    this.cam = new Camera(this.camera, this.flashRect, () => this.opts.reducedMotion);
    this.fxc = { tw: this.tw, fx: this.fx, layer: this.fxLayer, top: this.top, camera: this.cam, reduced: reducedMotion, font: this.opts.font };

    // entrance
    this.left.body.alpha = 0;
    this.right.body.alpha = 0;
    this.left.body.x = -160;
    this.right.body.x = 160;
    this.tw.to(this.left.body, { alpha: 1, x: 0 }, 0.8, ease.outCubic);
    this.tw.to(this.right.body, { alpha: 1, x: 0 }, 0.9, ease.outCubic);
  }

  /**
   * Keep the fighting band (x 110–1170, y 140–690) fully visible at any aspect
   * ratio; the background is drawn much wider than 1280×720 so there is never
   * a letterbox.
   */
  private layout() {
    const { width, height } = this.app.screen;
    const s = Math.min(height / 550, width / 1060);
    this.fit.scale.set(s);
    this.fit.position.set(width / 2 - 640 * s, height / 2 - 415 * s);
    this.vignette.width = width;
    this.vignette.height = height;
    this.flashRect.width = width;
    this.flashRect.height = height;
  }

  private frame(realDt: number) {
    if (this.destroyed) return;
    const dt = this.cam.update(realDt);
    this.t += realDt;
    this.tw.update(dt);
    this.fx.update(dt);
    this.left.update(dt);
    this.right.update(dt);
    this.drawBackground(realDt);
  }

  private drawBackground(dt: number) {
    const { accent } = this.opts;
    this.stars.forEach((g, i) => (g.alpha = 0.35 + 0.3 * Math.sin(this.t * (0.7 + i * 0.35) + i * 2)));

    for (const g of this.glyphs) {
      g.y -= dt * 8;
      if (g.y < -30) {
        g.y = HORIZON;
        g.x = Math.random() * W;
      }
    }

    const f = this.floorLines;
    f.clear();
    const scroll = (this.t * 0.35) % 1;
    for (let i = 0; i < 12; i++) {
      const k = (i + scroll) / 12;
      const y = HORIZON + Math.pow(k, 2.2) * (H - HORIZON + 60);
      f.moveTo(-1300, y).lineTo(W + 1300, y);
    }
    f.stroke({ width: 1.5, color: accent, alpha: 0.22 });
  }

  /* --------------------------------------------------------------- API */

  private pair(side: Side): [Character, Character] {
    return side === "left" ? [this.left, this.right] : [this.right, this.left];
  }

  setCharging(side: Side, on: boolean) {
    this.pair(side)[0].charging = on;
  }

  /** A successful spell. Resolves when the animation has finished. */
  async attack(side: Side, kind: AttackKind, color: number, damage: number, crit: boolean, finisher: boolean, onHit?: () => void) {
    const [caster, target] = this.pair(side);
    caster.charging = false;
    if (finisher) {
      this.cam.flash(0.35, color);
      this.tw.to(this.cam, { timeScale: 0.55 }, 0.2);
    }
    await performAttack(this.fxc, kind, caster, target, color, (i, n) => {
      this.impact(target, color, damage, crit, i, n, finisher);
      if (i === n - 1) onHit?.();
    });
    this.tw.to(this.cam, { timeScale: 1 }, 0.3);
    await this.tw.wait(0.35);
  }

  private impact(target: Character, color: number, damage: number, crit: boolean, i: number, n: number, finisher: boolean) {
    const last = i === n - 1;
    const p = target.hitPoint();
    target.hit(last ? (crit || finisher ? 1.6 : 1.1) : 0.5);
    this.cam.shake(last ? (crit || finisher ? 22 : 12) : 5);
    this.cam.hitStop(last ? (crit || finisher ? 0.14 : 0.07) : 0.03);
    if (last) {
      this.cam.flash(crit ? 0.45 : 0.22, crit ? 0xffffff : color);
      this.cam.punch(p, crit || finisher ? 0.08 : 0.04);
      popText(this.fxc, { x: p.x, y: p.y - 110 }, `-${damage}`, { color: crit ? 0xfde047 : 0xffffff, size: crit ? 72 : 58, crit });
      if (crit) popText(this.fxc, { x: p.x, y: p.y - 190 }, "CRITICAL", { color: 0xfde047, size: 30, rise: 50 });
    }
  }

  /** The opponent strikes back (wrong answer / timeout). */
  async counter(side: Side, damage: number, onHit?: () => void) {
    const [attacker, target] = this.pair(side);
    const onImpact = (i: number, n: number) => {
      const last = i === n - 1;
      const p = target.hitPoint();
      target.hit(last ? 1.2 : 0.5);
      this.cam.shake(last ? 14 : 5);
      this.cam.hitStop(last ? 0.08 : 0.02);
      if (last) {
        onHit?.();
        this.cam.flash(0.25, 0xef4444);
        popText(this.fxc, { x: p.x, y: p.y - 120 }, `-${damage}`, { color: 0xf87171, size: 56 });
      }
    };
    if (attacker instanceof Boss) await bossAttack(this.fxc, attacker, target, onImpact);
    else await performAttack(this.fxc, "bolt", attacker, target, (attacker as Mage).color, onImpact);
    await this.tw.wait(0.3);
  }

  async fizzle(side: Side) {
    const caster = this.pair(side)[0];
    caster.charging = false;
    if (caster instanceof Mage) await caster.fizzle();
    const p = caster.castPoint();
    popText(this.fxc, { x: p.x, y: p.y - 40 }, "MISS", { color: 0x94a3b8, size: 34, rise: 50 });
  }

  /** Small "blocked" feedback when a query is invalid before execution. */
  shieldPing(side: Side, color: number) {
    const p = this.pair(side)[0].hitPoint();
    ring(this.fxc, p, { color, radius: 120 });
  }

  async ko(side: Side) {
    const c = side === "left" ? this.left : this.right;
    this.cam.flash(0.6, 0xffffff);
    this.cam.shake(18, 3);
    this.tw.to(this.cam, { timeScale: 0.4 }, 0.1);
    await c.ko();
    this.tw.to(this.cam, { timeScale: 1 }, 0.4);
  }

  async victory(side: Side) {
    const c = side === "left" ? this.left : this.right;
    await c.victory();
  }

  setReducedMotion(on: boolean) {
    this.opts.reducedMotion = on;
    this.fx.scale = on ? 0.35 : 1;
  }

  destroy() {
    this.destroyed = true;
    this.tw.dispose();
    this.fx.clear();
    this.app.destroy({ removeView: true }, { children: true });
  }
}
