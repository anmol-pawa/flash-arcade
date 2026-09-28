import { Container, Graphics, Sprite } from "pixi.js";
import type { BossId } from "@/content/types";
import { Character, RigContext } from "./rig";

export type BossAttackStyle = "orbs" | "chain" | "blocks" | "shards" | "scythe" | "gear" | "quake" | "wind" | "breath" | "laser";

/**
 * Bosses are drawn facing right and flipped to face the player. Each one is a
 * procedural vector rig with its own idle loop and attack style.
 */
export abstract class Boss extends Character {
  abstract readonly style: BossAttackStyle;
  protected live = new Graphics(); // redrawn every frame for organic shapes

  constructor(ctx: RigContext) {
    super(ctx);
    this.centerY = -150;
    this.castY = -170;
    this.castX = 60;
    this.shadow.scale.set(1.5, 1.3);
  }
}

/* ------------------------------------------------------------ Nulloth */
class Nulloth extends Boss {
  readonly color = 0x5eead4;
  readonly style = "orbs";
  private core = new Graphics();
  private eyeL!: Sprite;
  private eyeR!: Sprite;
  private arms = new Graphics();
  constructor(ctx: RigContext) {
    super(ctx);
    this.body.addChild(this.live, this.arms, this.core);
    this.core.circle(0, 0, 20).stroke({ width: 5, color: 0x0f766e });
    this.core.moveTo(-26, 26).lineTo(26, -26).stroke({ width: 5, color: 0x0f766e });
    this.core.position.set(6, -130);
    this.glow(this.body, 6, -130, 0x5eead4, 90, 0.35);
    const face = new Graphics();
    face.ellipse(-6, -206, 12, 17).fill({ color: 0x031514 });
    face.ellipse(28, -206, 12, 17).fill({ color: 0x031514 });
    face.ellipse(12, -176, 14, 7).fill({ color: 0x031514, alpha: 0.8 });
    this.body.addChild(face);
    this.eyeL = this.glow(this.body, -6, -204, 0x99f6e4, 26, 1);
    this.eyeR = this.glow(this.body, 28, -204, 0x99f6e4, 26, 1);
  }
  protected idle(t: number) {
    const g = this.live;
    g.clear();
    const pts: number[] = [];
    pts.push(-72, -60);
    for (let a = Math.PI; a <= Math.PI * 2 + 0.001; a += Math.PI / 16) pts.push(Math.cos(a) * 80 + 6, Math.sin(a) * 95 - 160);
    for (let i = 0; i <= 10; i++) {
      const x = 86 - i * 16.4;
      pts.push(x, -40 + Math.sin(t * 4 + i * 1.3) * 14 + (i % 2) * 18);
    }
    g.poly(pts).fill({ color: 0x5eead4, alpha: 0.2 }).stroke({ width: 3, color: 0x5eead4, alpha: 0.85 });
    const arms = this.arms;
    arms.clear();
    arms.moveTo(70, -140).bezierCurveTo(110, -150 + Math.sin(t * 2) * 20, 130, -100, 150 + Math.sin(t * 3) * 10, -90).stroke({ width: 8, color: 0x5eead4, alpha: 0.5, cap: "round" });
    arms.moveTo(-60, -140).bezierCurveTo(-100, -120, -110, -80 + Math.sin(t * 2.4) * 20, -120, -70).stroke({ width: 8, color: 0x5eead4, alpha: 0.4, cap: "round" });
    this.body.y = -20 + Math.sin(t * 1.5) * 12;
    this.shadow.scale.set(1.5 - Math.sin(t * 1.5) * 0.1);
    this.core.rotation = t * 0.8;
    const blink = Math.sin(t * 0.9) > 0.97 ? 0.1 : 1;
    this.eyeL.scale.y = this.eyeR.scale.y = (26 / 32) * blink;
    if (Math.random() < 0.2 * this.ctx.fx.scale) {
      const p = this.hitPoint();
      this.ctx.fx.emit({ x: p.x + (Math.random() - 0.5) * 140, y: p.y + 60, vy: -40, life: 1.4, size: 8, color: 0x5eead4, alpha: 0.5 });
    }
  }
}

/* ------------------------------------------------------------ Joinmaster */
class Joinmaster extends Boss {
  readonly color = 0xfbbf24;
  readonly style = "chain";
  private chains = new Graphics();
  private visor!: Sprite;
  constructor(ctx: RigContext) {
    super(ctx);
    const g = new Graphics();
    // legs
    g.roundRect(-44, -90, 34, 90, 8).fill({ color: 0x2b2416 });
    g.roundRect(12, -90, 34, 90, 8).fill({ color: 0x2b2416 });
    g.roundRect(-48, -14, 42, 16, 6).fill({ color: 0x4a3b1c });
    g.roundRect(8, -14, 42, 16, 6).fill({ color: 0x4a3b1c });
    // torso armour
    g.poly([-70, -250, 72, -250, 56, -92, -54, -92]).fill({ color: 0x3a2f1a });
    g.poly([-50, -236, 52, -236, 40, -120, -38, -120]).fill({ color: 0x5a4521 });
    g.moveTo(0, -236).lineTo(0, -122).stroke({ width: 4, color: 0xfbbf24, alpha: 0.9 });
    g.circle(0, -180, 18).stroke({ width: 5, color: 0xfbbf24 });
    g.moveTo(-10, -180).lineTo(10, -180).stroke({ width: 5, color: 0xfbbf24 });
    // pauldrons
    g.circle(-78, -238, 30).fill({ color: 0x5a4521 }).stroke({ width: 4, color: 0xfbbf24 });
    g.circle(80, -238, 30).fill({ color: 0x5a4521 }).stroke({ width: 4, color: 0xfbbf24 });
    // arms
    g.roundRect(-104, -226, 28, 100, 12).fill({ color: 0x3a2f1a });
    g.roundRect(78, -226, 28, 100, 12).fill({ color: 0x3a2f1a });
    g.circle(-90, -122, 17).fill({ color: 0xfbbf24 });
    g.circle(92, -122, 17).fill({ color: 0xfbbf24 });
    // helmet
    g.roundRect(-34, -312, 70, 66, 18).fill({ color: 0x4a3b1c }).stroke({ width: 4, color: 0xfbbf24 });
    g.rect(-24, -288, 52, 10).fill({ color: 0x120d05 });
    g.poly([-8, -312, 4, -340, 16, -312]).fill({ color: 0xfbbf24 });
    this.body.addChild(this.chains, g);
    this.visor = this.glow(this.body, 2, -283, 0xfff1a8, 60, 0.9);
    this.visor.scale.y = 0.5;
  }
  protected idle(t: number) {
    const c = this.chains;
    c.clear();
    for (let ring = 0; ring < 2; ring++) {
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * (ring ? -0.9 : 0.7);
        const x = Math.cos(a) * (130 + ring * 20);
        const y = -170 + ring * 60 + Math.sin(a) * 30;
        const front = Math.sin(a) > 0;
        c.ellipse(x, y, 11, 7).stroke({ width: 4, color: 0xfbbf24, alpha: front ? 0.95 : 0.35 });
      }
    }
    this.body.scale.y = 1 + Math.sin(t * 1.8) * 0.01;
    this.visor.alpha = 0.7 + Math.sin(t * 6) * 0.25;
  }
}

/* ------------------------------------------------------------ Aggregon */
class Aggregon extends Boss {
  readonly color = 0xf97316;
  readonly style = "blocks";
  private blocks: Graphics[] = [];
  private eyes!: Sprite;
  constructor(ctx: RigContext) {
    super(ctx);
    const add = (x: number, y: number, w: number, h: number, c: number) => {
      const b = new Graphics();
      b.roundRect(-w / 2, -h / 2, w, h, 6).fill({ color: c }).stroke({ width: 3, color: 0x7c2d12 });
      for (let i = 1; i < 3; i++) b.moveTo(-w / 2 + 6, -h / 2 + (h / 3) * i).lineTo(w / 2 - 6, -h / 2 + (h / 3) * i).stroke({ width: 2, color: 0xfed7aa, alpha: 0.4 });
      b.position.set(x, y);
      (b as Graphics & { home: [number, number] }).home = [x, y];
      this.body.addChild(b);
      this.blocks.push(b);
    };
    add(-30, -30, 50, 56, 0x9a3412);
    add(34, -30, 50, 56, 0x9a3412);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) add(-56 + c * 56, -100 - r * 50, 54, 46, r === 1 && c === 1 ? 0xc2410c : 0xea580c);
    add(-116, -190, 50, 42, 0xc2410c);
    add(-120, -146, 46, 40, 0xc2410c);
    add(-124, -100, 56, 50, 0x9a3412);
    add(118, -190, 50, 42, 0xc2410c);
    add(122, -146, 46, 40, 0xc2410c);
    add(126, -100, 56, 50, 0x9a3412);
    add(4, -276, 70, 58, 0xea580c);
    const face = new Graphics();
    face.rect(-18, -284, 16, 8).fill({ color: 0x1c0a02 });
    face.rect(14, -284, 16, 8).fill({ color: 0x1c0a02 });
    this.body.addChild(face);
    this.eyes = this.glow(this.body, 6, -280, 0xffedd5, 80, 0.9);
    this.eyes.scale.y = 0.4;
    this.glow(this.body, 0, -150, 0xf97316, 120, 0.35);
  }
  protected idle(t: number) {
    this.blocks.forEach((b, i) => {
      const [hx, hy] = (b as Graphics & { home: [number, number] }).home;
      b.position.set(hx + Math.sin(t * 2.2 + i) * 2, hy + Math.sin(t * 3 + i * 0.7) * 3);
    });
    this.eyes.alpha = Math.random() < 0.03 ? 0.2 : 0.9;
  }
}

/* ------------------------------------------------------------ Sub-Zero */
class SubZero extends Boss {
  readonly color = 0xa78bfa;
  readonly style = "shards";
  private diamonds: Graphics[] = [];
  private shards = new Graphics();
  private robe = new Graphics();
  constructor(ctx: RigContext) {
    super(ctx);
    this.body.addChild(this.robe, this.shards);
    const colors = [0x4c1d95, 0x6d28d9, 0x8b5cf6, 0xc4b5fd];
    colors.forEach((c, i) => {
      const d = new Graphics();
      const r = 90 - i * 20;
      d.poly([0, -r, r * 0.8, 0, 0, r, -r * 0.8, 0]).fill({ color: c, alpha: 0.85 }).stroke({ width: 2, color: 0xe0f2fe, alpha: 0.8 });
      d.position.set(0, -190);
      this.body.addChild(d);
      this.diamonds.push(d);
    });
    const eyes = new Graphics();
    eyes.poly([-22, -198, -6, -192, -22, -186]).fill({ color: 0xe0f2fe });
    eyes.poly([22, -198, 6, -192, 22, -186]).fill({ color: 0xe0f2fe });
    this.body.addChild(eyes);
    this.glow(this.body, 0, -192, 0xc4f1ff, 110, 0.6);
  }
  protected idle(t: number) {
    this.diamonds.forEach((d, i) => (d.rotation = Math.sin(t * (0.6 + i * 0.3)) * 0.4 * (i % 2 ? -1 : 1)));
    const r = this.robe;
    r.clear();
    const pts = [-60, -140, 60, -140];
    for (let i = 0; i <= 8; i++) pts.push(70 - i * 17.5, -10 + Math.sin(t * 3 + i) * 10 + (i % 2) * 22);
    r.poly(pts).fill({ color: 0xc4b5fd, alpha: 0.25 }).stroke({ width: 2, color: 0xe0f2fe, alpha: 0.5 });
    const s = this.shards;
    s.clear();
    for (let i = 0; i < 7; i++) {
      const a = t * 0.8 + (i / 7) * Math.PI * 2;
      const x = Math.cos(a) * 140;
      const y = -180 + Math.sin(a) * 50;
      const front = Math.sin(a) > 0;
      s.poly([x, y - 16, x + 7, y, x, y + 16, x - 7, y]).fill({ color: 0xe0f2fe, alpha: front ? 0.95 : 0.35 });
    }
    this.body.y = -16 + Math.sin(t * 1.4) * 8;
  }
}

/* ------------------------------------------------------------ Reaper */
class Reaper extends Boss {
  readonly color = 0x60a5fa;
  readonly style = "scythe";
  private cloak = new Graphics();
  private arm = new Container();
  private eyes!: Sprite[];
  constructor(ctx: RigContext) {
    super(ctx);
    this.body.addChild(this.cloak);
    const hood = new Graphics();
    hood.poly([-50, -230, -20, -320, 30, -330, 58, -250, 40, -196, -40, -196]).fill({ color: 0x0b1020 }).stroke({ width: 3, color: 0x1e3a8a });
    hood.ellipse(8, -252, 28, 34).fill({ color: 0x000000 });
    this.body.addChild(hood);
    this.eyes = [this.glow(this.body, -4, -258, 0x60a5fa, 30, 1), this.glow(this.body, 22, -258, 0x60a5fa, 30, 1)];
    const scythe = new Graphics();
    scythe.moveTo(0, 150).lineTo(0, -210).stroke({ width: 7, color: 0x3f3f46, cap: "round" });
    scythe.moveTo(0, -200).bezierCurveTo(-60, -250, -150, -230, -190, -170).bezierCurveTo(-130, -200, -60, -200, 0, -172).fill({ color: 0xcbd5e1 });
    scythe.moveTo(0, -200).bezierCurveTo(-60, -250, -150, -230, -190, -170).stroke({ width: 3, color: 0x93c5fd });
    const hand = new Graphics();
    hand.roundRect(-10, -8, 26, 16, 6).fill({ color: 0xd4d4d8 });
    this.arm.addChild(scythe, hand);
    this.arm.position.set(70, -140);
    this.body.addChild(this.arm);
    this.glow(this.body, -60, -310, 0x60a5fa, 40, 0.5);
  }
  protected idle(t: number) {
    const c = this.cloak;
    c.clear();
    const pts = [-56, -226, 60, -226, 90, -30];
    for (let i = 0; i <= 9; i++) pts.push(90 - i * 20, -10 + Math.sin(t * 5 + i * 1.7) * 8 + (i % 2) * 24);
    pts.push(-90, -30);
    c.poly(pts).fill({ color: 0x0b1020 }).stroke({ width: 3, color: 0x1e3a8a });
    this.arm.rotation = Math.sin(t * 1.2) * 0.08;
    this.body.y = -12 + Math.sin(t * 1.6) * 6;
    this.eyes.forEach((e) => (e.alpha = 0.7 + Math.sin(t * 8) * 0.3));
  }
  override async windup() {
    const { tw } = this.ctx;
    await tw.to(this.arm, { rotation: -0.9 }, 0.25);
    await tw.to(this.arm, { rotation: 0.6 }, 0.1);
    await tw.to(this.arm, { rotation: 0 }, 0.3);
  }
}

/* ------------------------------------------------------------ Transactor */
class Transactor extends Boss {
  readonly color = 0x34d399;
  readonly style = "gear";
  private gear = new Graphics();
  private visor!: Sprite;
  constructor(ctx: RigContext) {
    super(ctx);
    const g = new Graphics();
    g.roundRect(-40, -96, 30, 96, 8).fill({ color: 0x1f2937 });
    g.roundRect(14, -96, 30, 96, 8).fill({ color: 0x1f2937 });
    g.circle(0, -170, 84).fill({ color: 0x374151 }).stroke({ width: 6, color: 0x34d399 });
    g.roundRect(-30, -300, 64, 60, 20).fill({ color: 0x4b5563 }).stroke({ width: 4, color: 0x34d399 });
    g.rect(-20, -276, 44, 8).fill({ color: 0x052e1f });
    g.moveTo(0, -300).quadraticCurveTo(-40, -350, -70, -320).stroke({ width: 10, color: 0x10b981, cap: "round" });
    // shield with a check mark
    g.roundRect(70, -230, 70, 110, 22).fill({ color: 0x065f46 }).stroke({ width: 5, color: 0x6ee7b7 });
    g.moveTo(88, -176).lineTo(102, -158).lineTo(126, -196).stroke({ width: 8, color: 0xd1fae5, cap: "round", join: "round" });
    this.gear.position.set(0, -170);
    this.drawGear();
    this.body.addChild(g, this.gear);
    this.visor = this.glow(this.body, 2, -272, 0x6ee7b7, 60, 1);
    this.visor.scale.y = 0.4;
  }
  private drawGear() {
    const g = this.gear;
    const teeth = 12;
    const pts: number[] = [];
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 ? 44 : 56;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.poly(pts).fill({ color: 0x10b981 }).stroke({ width: 3, color: 0xd1fae5 });
    g.circle(0, 0, 18).fill({ color: 0x064e3b });
    g.circle(0, 0, 8).fill({ color: 0x6ee7b7 });
  }
  protected idle(t: number) {
    this.gear.rotation = t * 1.2;
    this.body.scale.y = 1 + Math.sin(t * 2) * 0.012;
    this.visor.alpha = 0.7 + Math.sin(t * 4) * 0.3;
  }
}

/* ------------------------------------------------------------ Schemaforge */
class Schemaforge extends Boss {
  readonly color = 0xf59e0b;
  readonly style = "quake";
  private hammer = new Container();
  private core!: Sprite;
  constructor(ctx: RigContext) {
    super(ctx);
    const g = new Graphics();
    g.roundRect(-60, -110, 48, 110, 12).fill({ color: 0x292524 });
    g.roundRect(14, -110, 48, 110, 12).fill({ color: 0x292524 });
    g.poly([-110, -300, 110, -300, 80, -100, -80, -100]).fill({ color: 0x57534e }).stroke({ width: 5, color: 0x78716c });
    g.roundRect(-70, -180, 140, 24, 6).fill({ color: 0x3f3f46 });
    g.circle(0, -230, 36).fill({ color: 0x1c1917 }).stroke({ width: 5, color: 0xf59e0b });
    // head with horned helm
    g.roundRect(-30, -356, 60, 58, 14).fill({ color: 0x44403c });
    g.poly([-30, -346, -64, -380, -40, -330]).fill({ color: 0xe7e5e4 });
    g.poly([30, -346, 64, -380, 40, -330]).fill({ color: 0xe7e5e4 });
    g.rect(-18, -332, 36, 7).fill({ color: 0xfbbf24 });
    // left arm
    g.roundRect(-150, -290, 44, 140, 18).fill({ color: 0x57534e });
    g.circle(-128, -140, 26).fill({ color: 0x78716c });
    this.core = this.glow(this.body, 0, -230, 0xf59e0b, 140, 0.9);
    const h = new Graphics();
    h.roundRect(-8, -10, 16, 200, 6).fill({ color: 0x78350f });
    h.roundRect(-60, -60, 120, 70, 10).fill({ color: 0x3f3f46 }).stroke({ width: 5, color: 0xf59e0b });
    h.rect(-60, -34, 120, 10).fill({ color: 0xf59e0b, alpha: 0.6 });
    this.hammer.addChild(h);
    this.hammer.position.set(130, -250);
    this.hammer.rotation = -0.5;
    const arm = new Graphics();
    arm.roundRect(90, -290, 44, 120, 18).fill({ color: 0x57534e });
    this.body.addChild(g, arm, this.hammer);
  }
  protected idle(t: number) {
    this.core.scale.set((140 / 32) * (1 + Math.sin(t * 4) * 0.12));
    this.hammer.rotation = -0.5 + Math.sin(t * 1.4) * 0.06;
    if (Math.random() < 0.25 * this.ctx.fx.scale) {
      const p = this.hitPoint();
      this.ctx.fx.emit({ x: p.x + (Math.random() - 0.5) * 60 * this.facing, y: p.y - 80, vx: (Math.random() - 0.5) * 140, vy: -120 - Math.random() * 100, gravity: 400, life: 0.8, size: 5, color: 0xfbbf24, spark: true });
    }
  }
  override async windup() {
    const { tw } = this.ctx;
    await tw.to(this.hammer, { rotation: -1.8 }, 0.28);
    await tw.to(this.hammer, { rotation: 0.6 }, 0.1);
    await tw.to(this.hammer, { rotation: -0.5 }, 0.4);
  }
}

/* ------------------------------------------------------------ Windwraith */
class Windwraith extends Boss {
  readonly color = 0x38bdf8;
  readonly style = "wind";
  private swirl = new Graphics();
  private frames = new Graphics();
  constructor(ctx: RigContext) {
    super(ctx);
    const mask = new Graphics();
    mask.ellipse(0, -210, 36, 46).fill({ color: 0xe0f2fe }).stroke({ width: 3, color: 0x0284c7 });
    mask.poly([-24, -222, -6, -214, -24, -206]).fill({ color: 0x082f49 });
    mask.poly([24, -222, 6, -214, 24, -206]).fill({ color: 0x082f49 });
    mask.moveTo(-12, -184).quadraticCurveTo(0, -176, 12, -184).stroke({ width: 3, color: 0x082f49 });
    this.body.addChild(this.swirl, this.frames, mask);
    this.glow(this.body, 0, -200, 0x38bdf8, 160, 0.4);
  }
  protected idle(t: number) {
    const s = this.swirl;
    s.clear();
    for (let i = 0; i < 5; i++) {
      const r = 60 + i * 22;
      const a0 = t * (1.4 - i * 0.15) + i;
      s.arc(0, -170 + i * 16, r, a0, a0 + Math.PI * 1.2).stroke({ width: 6 - i, color: 0x7dd3fc, alpha: 0.8 - i * 0.12 });
    }
    const f = this.frames;
    f.clear();
    for (let i = 0; i < 4; i++) {
      const a = -t * 0.9 + (i / 4) * Math.PI * 2;
      const x = Math.cos(a) * 150;
      const y = -180 + Math.sin(a) * 60;
      const alpha = Math.sin(a) > 0 ? 0.9 : 0.35;
      f.rect(x - 20, y - 26, 40, 52).stroke({ width: 3, color: 0xbae6fd, alpha });
      f.moveTo(x, y - 26).lineTo(x, y + 26).moveTo(x - 20, y).lineTo(x + 20, y).stroke({ width: 2, color: 0xbae6fd, alpha });
    }
    this.body.y = -30 + Math.sin(t * 1.8) * 14;
    if (Math.random() < 0.3 * this.ctx.fx.scale) {
      const p = this.hitPoint();
      this.ctx.fx.emit({ x: p.x + (Math.random() - 0.5) * 200, y: p.y + (Math.random() - 0.5) * 200, vx: 120 * -this.facing, life: 0.6, size: 4, color: 0xbae6fd, spark: true });
    }
  }
}

/* ------------------------------------------------------------ Hydra */
class Hydra extends Boss {
  readonly color = 0x4ade80;
  readonly style = "breath";
  private necks = new Graphics();
  private heads: Container[] = [];
  constructor(ctx: RigContext) {
    super(ctx);
    const g = new Graphics();
    g.ellipse(0, -80, 130, 80).fill({ color: 0x14532d }).stroke({ width: 5, color: 0x22c55e });
    for (let i = 0; i < 6; i++) g.ellipse(-80 + i * 32, -110 + (i % 2) * 14, 16, 10).fill({ color: 0x166534 });
    g.moveTo(-120, -70).bezierCurveTo(-190, -60, -210, -10, -240, -30).stroke({ width: 22, color: 0x14532d, cap: "round" });
    this.body.addChild(this.necks, g);
    for (let i = 0; i < 3; i++) {
      const h = new Container();
      const hg = new Graphics();
      hg.ellipse(0, 0, 34, 24).fill({ color: 0x166534 }).stroke({ width: 3, color: 0x4ade80 });
      hg.poly([10, 8, 50, 14, 10, 22]).fill({ color: 0x14532d });
      hg.poly([-20, -18, -36, -44, -8, -22]).fill({ color: 0x4ade80 });
      h.addChild(hg);
      this.glow(h, 12, -6, 0xbbf7d0, 20, 1);
      this.heads.push(h);
      this.body.addChild(h);
    }
  }
  private headPos(i: number, t: number): [number, number] {
    const base: [number, number][] = [
      [30, -300],
      [110, -250],
      [-40, -250],
    ];
    const [x, y] = base[i];
    return [x + Math.sin(t * 1.5 + i * 2) * 16, y + Math.cos(t * 1.9 + i) * 14];
  }
  protected idle(t: number) {
    const n = this.necks;
    n.clear();
    const roots: [number, number][] = [
      [10, -130],
      [60, -120],
      [-30, -120],
    ];
    this.heads.forEach((h, i) => {
      const [x, y] = this.headPos(i, t);
      const [rx, ry] = roots[i];
      n.moveTo(rx, ry).bezierCurveTo(rx, ry - 80, x - 40, y + 60, x - 10, y + 8).stroke({ width: 24, color: 0x166534, cap: "round" });
      n.moveTo(rx, ry).bezierCurveTo(rx, ry - 80, x - 40, y + 60, x - 10, y + 8).stroke({ width: 4, color: 0x4ade80, alpha: 0.5 });
      h.position.set(x, y);
      h.rotation = Math.sin(t * 2 + i) * 0.15;
    });
  }
  mouths() {
    return this.heads.map((h) => this.ctx.space.toLocal(h.toGlobal({ x: 40, y: 12 })));
  }
}

/* ------------------------------------------------------------ Optimizer */
class Optimizer extends Boss {
  readonly color = 0xe879f9;
  readonly style = "laser";
  private rings = new Graphics();
  private eye = new Container();
  private iris = new Container();
  constructor(ctx: RigContext) {
    super(ctx);
    const tendrils = new Graphics();
    for (let i = 0; i < 5; i++) tendrils.moveTo(-40 + i * 20, -112).lineTo(-50 + i * 25, -20).stroke({ width: 2, color: 0xe879f9, alpha: 0.5 });
    const sclera = new Graphics();
    sclera.circle(0, 0, 90).fill({ color: 0xfdf4ff }).stroke({ width: 6, color: 0xc026d3 });
    const ir = new Graphics();
    ir.circle(0, 0, 40).fill({ color: 0xa21caf });
    ir.circle(0, 0, 30).stroke({ width: 3, color: 0xf5d0fe, alpha: 0.6 });
    ir.circle(0, 0, 17).fill({ color: 0x0b0010 });
    ir.circle(-8, -8, 6).fill({ color: 0xffffff });
    this.iris.addChild(ir);
    this.eye.addChild(sclera, this.iris);
    this.eye.position.set(0, -200);
    this.body.addChild(tendrils, this.rings, this.eye);
    this.glow(this.body, 0, -200, 0xe879f9, 220, 0.35);
  }
  protected idle(t: number) {
    const r = this.rings;
    r.clear();
    for (let i = 0; i < 3; i++) {
      const tilt = Math.sin(t * 0.7 + i * 2) * 0.5 + 0.6;
      r.ellipse(0, -200, 150 + i * 16, 40 + tilt * 40).stroke({ width: 3, color: 0xf0abfc, alpha: 0.6 - i * 0.12 });
      const a = t * (1.2 + i * 0.4) + i;
      r.circle(Math.cos(a) * (150 + i * 16), -200 + Math.sin(a) * (40 + tilt * 40), 7).fill({ color: 0xfae8ff });
    }
    this.rings.rotation = Math.sin(t * 0.4) * 0.1;
    this.iris.position.set(-26 + Math.sin(t * 0.9) * 10, Math.sin(t * 1.3) * 8);
    // blink: squash the eye shut for a moment every few seconds
    const blink = Math.max(0, Math.sin(t * 0.7) - 0.985) / 0.015;
    this.eye.scale.y = 1 - 0.92 * Math.min(1, blink);
    this.body.y = -30 + Math.sin(t * 1.2) * 10;
  }
  override castPoint() {
    return this.ctx.space.toLocal(this.iris.toGlobal({ x: 0, y: 0 }));
  }
}

const REGISTRY: Record<BossId, new (ctx: RigContext) => Boss> = {
  nulloth: Nulloth,
  joinmaster: Joinmaster,
  aggregon: Aggregon,
  subzero: SubZero,
  reaper: Reaper,
  transactor: Transactor,
  schemaforge: Schemaforge,
  windwraith: Windwraith,
  hydra: Hydra,
  optimizer: Optimizer,
};

export function createBoss(id: BossId, ctx: RigContext): Boss {
  return new REGISTRY[id](ctx);
}

export function isHydra(b: Boss): b is Hydra {
  return b instanceof Hydra;
}
