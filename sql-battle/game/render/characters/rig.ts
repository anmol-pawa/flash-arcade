import { ColorMatrixFilter, Container, Graphics, Point, Sprite } from "pixi.js";
import type { Particles } from "../particles";
import { softDot } from "../textures";
import { Tweener, ease } from "../tween";

export interface RigContext {
  tw: Tweener;
  fx: Particles;
  reduced: boolean;
  /** The container effects are drawn in; points are reported in its space. */
  space: Container;
}

/**
 * Base class for every fighter. `root` sits on the ground at the fighter's
 * feet; `body` holds all the parts and is what animations move, so a lunge or
 * knockback never shifts the shadow.
 */
export abstract class Character {
  root = new Container();
  body = new Container();
  shadow = new Graphics();
  protected t = Math.random() * 10;
  protected flashFilter = new ColorMatrixFilter();
  alive = true;
  busy = false;
  /** Base horizontal position, for returning after lunges. */
  homeX = 0;
  abstract readonly color: number;
  /** Height of the character's hit box centre above the feet. */
  protected centerY = -130;
  protected castY = -200;
  protected castX = 40;

  constructor(protected ctx: RigContext) {
    this.shadow.ellipse(0, 0, 70, 13).fill({ color: 0x000000, alpha: 0.4 });
    this.root.addChild(this.shadow, this.body);
  }

  /** Face left instead of right. */
  flip() {
    this.body.scale.x = -1;
  }

  get facing(): 1 | -1 {
    return this.body.scale.x < 0 ? -1 : 1;
  }

  update(dt: number) {
    this.t += dt;
    if (this.alive) this.idle(this.t, dt);
  }

  protected abstract idle(t: number, dt: number): void;

  /** Global point where spells leave this character. */
  castPoint(): Point {
    return this.ctx.space.toLocal(this.body.toGlobal(new Point(this.castX, this.castY)));
  }

  /** Global point where incoming attacks land. */
  hitPoint(): Point {
    return this.ctx.space.toLocal(this.body.toGlobal(new Point(0, this.centerY)));
  }

  protected glow(parent: Container, x: number, y: number, color: number, size: number, alpha = 0.8): Sprite {
    const s = new Sprite(softDot());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.tint = color;
    s.alpha = alpha;
    s.scale.set(size / 32);
    s.blendMode = "add";
    parent.addChild(s);
    return s;
  }

  /** Brief white-hot flash. The filter is only attached while flashing: a
   *  permanent filter would force an offscreen render pass every frame. */
  async flash(strength = 2.6, dur = 0.18) {
    const f = this.flashFilter;
    this.body.filters = [f];
    this.flashing++;
    await this.ctx.tw.run(dur, (k) => f.brightness(1 + (strength - 1) * (1 - k), false));
    if (--this.flashing === 0) this.body.filters = null;
  }
  private flashing = 0;

  /** Wind-up before an attack. Subclasses can extend. */
  async windup(): Promise<void> {
    const { tw } = this.ctx;
    const sx = this.body.scale.x;
    await tw.to(this.body, { "scale.x": sx * 0.94, "scale.y": 1.06, y: -8 }, 0.18, ease.outCubic);
    await tw.to(this.body, { "scale.x": sx, "scale.y": 1, y: 0 }, 0.12, ease.outBack);
  }

  async lunge(dist = 60) {
    const { tw } = this.ctx;
    const d = dist * this.facing;
    await tw.to(this.body, { x: d }, 0.12, ease.outCubic);
    await tw.to(this.body, { x: 0 }, 0.35, ease.outCubic);
  }

  async hit(power = 1) {
    const { tw } = this.ctx;
    const back = -38 * power * this.facing;
    const sx = this.body.scale.x;
    this.flash(3, 0.25);
    await tw.to(this.body, { x: back, "scale.x": sx * 0.86, "scale.y": 1.12, rotation: -0.08 * this.facing * power }, 0.08, ease.outCubic);
    await tw.to(this.body, { x: 0, "scale.x": sx, "scale.y": 1, rotation: 0 }, 0.45, ease.outElastic);
  }

  async ko() {
    const { tw, fx } = this.ctx;
    this.alive = false;
    const c = this.hitPoint();
    this.flash(4, 0.6);
    for (let i = 0; i < 4; i++) fx.burst(c.x + (Math.random() - 0.5) * 120, c.y + (Math.random() - 0.5) * 160, { count: 30, color: this.color, speed: 380, life: 1.1 });
    await tw.to(this.body, { rotation: 0.35 * -this.facing, y: 30, alpha: 0 }, 1.1, ease.inCubic);
  }

  async victory() {
    const { tw } = this.ctx;
    for (let i = 0; i < 2; i++) {
      await tw.to(this.body, { y: -50 }, 0.22, ease.outCubic);
      await tw.to(this.body, { y: 0 }, 0.22, ease.inCubic);
    }
  }

  /** Called while the player's query is executing. */
  charging = false;
}
