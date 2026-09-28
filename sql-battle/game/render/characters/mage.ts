import { Container, Graphics, Point, Sprite } from "pixi.js";
import { ease } from "../tween";
import { Character, RigContext } from "./rig";

export interface MagePalette {
  robe: number;
  robeDark: number;
  trim: number;
  eyes: number;
}

export const MAGE_BLUE: MagePalette = { robe: 0x3b2a7a, robeDark: 0x22184d, trim: 0x5eead4, eyes: 0x7ffff0 };
export const MAGE_ROSE: MagePalette = { robe: 0x7a2a5c, robeDark: 0x4a1636, trim: 0xf9a8d4, eyes: 0xffc4ec };

/**
 * The Data Mage: hooded robe, flowing cape, and a staff topped with a query
 * orb. Built from layered vector parts with shoulder pivots so the arms can
 * swing the staff.
 */
export class Mage extends Character {
  readonly color: number;
  private cape = new Graphics();
  private head = new Container();
  private eyes = new Graphics();
  private eyeGlow!: Sprite;
  private frontArm = new Container();
  private backArm = new Container();
  private orb = new Container();
  private orbGlow!: Sprite;
  private orbCore = new Graphics();
  private rune = new Graphics();
  private blinkAt = 2 + Math.random() * 3;
  private charge = 0;

  constructor(ctx: RigContext, private pal: MagePalette = MAGE_BLUE) {
    super(ctx);
    this.color = pal.trim;
    this.centerY = -110;
    this.build();
  }

  private build() {
    const p = this.pal;

    // rune circle on the ground (shown while casting)
    this.rune.alpha = 0;
    this.drawRune();
    this.root.addChildAt(this.rune, 1);

    // cape (behind everything)
    this.cape.poly([-22, -150, 20, -150, 34, -60, 22, -2, -70, 2, -58, -70]).fill({ color: p.robeDark });
    this.cape.pivot.set(0, -150);
    this.cape.position.set(-4, -150);

    // back arm
    const ba = new Graphics();
    ba.poly([-8, 0, 10, 0, 12, 50, -4, 56]).fill({ color: p.robeDark });
    ba.circle(4, 60, 8).fill({ color: 0xe8d5c4 });
    this.backArm.addChild(ba);
    this.backArm.position.set(-16, -138);
    this.backArm.rotation = 0.25;

    // robe
    const robe = new Graphics();
    robe.poly([-26, -152, 26, -152, 50, -4, -50, -4]).fill({ color: p.robe });
    robe.poly([-6, -150, 6, -150, 14, -4, -14, -4]).fill({ color: p.robeDark, alpha: 0.7 });
    robe.moveTo(-8, -146).lineTo(-15, -6).stroke({ width: 2.5, color: p.trim, alpha: 0.9 });
    robe.moveTo(8, -146).lineTo(15, -6).stroke({ width: 2.5, color: p.trim, alpha: 0.9 });
    robe.moveTo(-49, -8).lineTo(49, -8).stroke({ width: 4, color: p.trim, alpha: 0.85 });
    // collar
    robe.poly([-28, -154, 28, -154, 18, -138, -18, -138]).fill({ color: p.robeDark });
    // belt + gem
    robe.roundRect(-33, -96, 66, 9, 3).fill({ color: 0x160f33 });
    robe.circle(0, -91.5, 5.5).fill({ color: p.trim });
    this.glow(robe, 0, -91.5, p.trim, 26, 0.7);
    // glyphs on robe
    for (let i = 0; i < 3; i++) robe.rect(-3 + (i - 1) * 22, -60 + i * 14, 6, 2).fill({ color: p.trim, alpha: 0.5 });

    // head / hood
    const hood = new Graphics();
    hood.poly([-26, 8, -34, -22, -20, -52, -44, -70, -2, -54, 24, -36, 30, 4]).fill({ color: p.robe });
    hood.ellipse(4, -8, 21, 24).fill({ color: 0x0a0618 });
    hood.moveTo(-28, 6).quadraticCurveTo(-36, -24, -20, -50).stroke({ width: 2, color: p.trim, alpha: 0.5 });
    this.head.addChild(hood);
    this.eyeGlow = this.glow(this.head, 5, -10, p.eyes, 46, 0.55);
    this.eyes.ellipse(-2, -10, 3.6, 2.6).fill({ color: p.eyes });
    this.eyes.ellipse(12, -10, 3.6, 2.6).fill({ color: p.eyes });
    this.eyes.pivot.set(5, -10);
    this.eyes.position.set(5, -10);
    this.head.addChild(this.eyes);
    this.head.position.set(0, -160);

    // front arm with staff
    const fa = new Graphics();
    fa.poly([-8, 0, 12, 0, 16, 48, 0, 54]).fill({ color: p.robe });
    fa.moveTo(-2, 44).lineTo(16, 44).stroke({ width: 3, color: p.trim, alpha: 0.8 });
    const staff = new Graphics();
    staff.moveTo(8, 150).lineTo(8, -70).stroke({ width: 6, color: 0x5b3a1e, cap: "round" });
    staff.moveTo(8, -70).lineTo(8, -40).stroke({ width: 7, color: 0x8a5a2b, cap: "round" });
    // claw holding the orb
    staff.moveTo(8, -70).quadraticCurveTo(-8, -82, -4, -96).stroke({ width: 3, color: 0x8a5a2b });
    staff.moveTo(8, -70).quadraticCurveTo(24, -82, 20, -96).stroke({ width: 3, color: 0x8a5a2b });
    staff.position.set(0, 56);
    fa.addChild(staff);
    fa.circle(8, 56, 8).fill({ color: 0xe8d5c4 });

    this.orbGlow = this.glow(this.orb, 0, 0, p.trim, 90, 0.8);
    this.orbCore.circle(0, 0, 11).fill({ color: 0xffffff });
    this.orbCore.circle(0, 0, 15).stroke({ width: 2, color: p.trim, alpha: 0.9 });
    this.orb.addChild(this.orbCore);
    this.orb.position.set(8, 56 - 86);
    fa.addChild(this.orb);

    this.frontArm.addChild(fa);
    this.frontArm.position.set(16, -140);
    this.frontArm.rotation = -0.15;

    this.body.addChild(this.cape, this.backArm, robe, this.head, this.frontArm);
  }

  private drawRune() {
    const g = this.rune;
    const c = this.pal.trim;
    g.clear();
    g.ellipse(0, 0, 95, 24).stroke({ width: 3, color: c, alpha: 0.9 });
    g.ellipse(0, 0, 75, 18).stroke({ width: 1.5, color: c, alpha: 0.6 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.moveTo(Math.cos(a) * 78, Math.sin(a) * 19).lineTo(Math.cos(a) * 92, Math.sin(a) * 23).stroke({ width: 2, color: c, alpha: 0.8 });
    }
  }

  override castPoint(): Point {
    return this.ctx.space.toLocal(this.orb.toGlobal(new Point(0, 0)));
  }

  protected idle(t: number, dt: number) {
    this.body.y = Math.sin(t * 2) * 3 - this.charge * 10;
    this.body.scale.y = 1 + Math.sin(t * 2) * 0.012;
    this.cape.skew.x = Math.sin(t * 1.7) * 0.07 - this.charge * 0.2;
    this.head.rotation = Math.sin(t * 1.3) * 0.03;
    if (!this.busy) this.frontArm.rotation = -0.15 + Math.sin(t * 2) * 0.04 - this.charge * 0.5;
    this.backArm.rotation = 0.25 + Math.sin(t * 2 + 1) * 0.05;
    const pulse = 1 + Math.sin(t * 5) * 0.08 + this.charge * 0.8;
    this.orbGlow.scale.set((90 / 32) * pulse);
    this.eyeGlow.alpha = 0.45 + Math.sin(t * 3) * 0.1 + this.charge * 0.4;

    // blinking
    if (t > this.blinkAt) {
      this.eyes.scale.y = 0.1;
      if (t > this.blinkAt + 0.12) {
        this.eyes.scale.y = 1;
        this.blinkAt = t + 2.5 + Math.random() * 3;
      }
    }

    // charging while a query runs
    const target = this.charging ? 1 : 0;
    this.charge += (target - this.charge) * Math.min(1, dt * 6);
    this.rune.alpha = Math.max(this.rune.alpha * 0.92, this.charge);
    this.rune.rotation = 0;
    this.rune.scale.set(1 + Math.sin(t * 6) * 0.02);
    if (this.charge > 0.2 && Math.random() < this.charge * 0.8 * this.ctx.fx.scale) {
      const o = this.castPoint();
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 60;
      this.ctx.fx.emit({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r, toX: o.x, toY: o.y, pull: 40, drag: 0.85, life: 0.5, size: 10, color: this.pal.trim });
    }
    // ambient motes from the orb
    if (Math.random() < 0.15 * this.ctx.fx.scale) {
      const o = this.castPoint();
      this.ctx.fx.emit({ x: o.x + (Math.random() - 0.5) * 20, y: o.y, vy: -30 - Math.random() * 30, vx: (Math.random() - 0.5) * 20, life: 1, size: 6, color: this.pal.trim, alpha: 0.7 });
    }
  }

  /** Raise the staff, flare the rune circle, then thrust. Resolves at release. */
  async castSpell(): Promise<void> {
    const { tw, fx } = this.ctx;
    this.busy = true;
    this.rune.alpha = 1;
    tw.to(this.rune.scale, { x: 1.25, y: 1.25 }, 0.4, ease.outBack);
    await tw.to(this.frontArm, { rotation: -1.35 }, 0.25, ease.outBack);
    const o = this.castPoint();
    fx.burst(o.x, o.y, { count: 24, color: this.pal.trim, speed: 260, size: 12, life: 0.4 });
    this.flash(1.8, 0.2);
    await tw.wait(0.12);
    tw.to(this.body, { x: 18 * this.facing }, 0.1, ease.outCubic);
    await tw.to(this.frontArm, { rotation: -0.55 }, 0.1, ease.outCubic);
    this.settle();
  }

  private async settle() {
    const { tw } = this.ctx;
    await tw.wait(0.25);
    tw.to(this.body, { x: 0 }, 0.4, ease.outCubic);
    await tw.to(this.frontArm, { rotation: -0.15 }, 0.4, ease.outCubic);
    tw.to(this.rune.scale, { x: 1, y: 1 }, 0.3);
    this.busy = false;
  }

  /** Spell fizzles: sputter of smoke from the orb. */
  async fizzle() {
    const { tw, fx } = this.ctx;
    this.busy = true;
    await tw.to(this.frontArm, { rotation: -0.9 }, 0.2, ease.outBack);
    const o = this.castPoint();
    for (let i = 0; i < 18; i++) fx.emit({ x: o.x, y: o.y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 80, size: 18, sizeEnd: 40, life: 0.9, color: 0x6b7280, alpha: 0.5 });
    await tw.to(this.frontArm, { rotation: -0.15 }, 0.35, ease.outCubic);
    this.busy = false;
  }

  override async victory() {
    const { tw, fx } = this.ctx;
    this.busy = true;
    tw.to(this.frontArm, { rotation: -2.2 }, 0.3, ease.outBack);
    await super.victory();
    const o = this.castPoint();
    fx.burst(o.x, o.y, { count: 60, color: this.pal.trim, speed: 500, life: 1.2 });
  }
}
