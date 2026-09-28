import { Texture } from "pixi.js";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

let soft: Texture | null = null;
/** Soft round glow: white core fading to transparent. Tint it for colour. */
export function softDot(): Texture {
  if (soft) return soft;
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.8)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  soft = Texture.from(c);
  return soft;
}

let streak: Texture | null = null;
/** Elongated spark for fast particles. */
export function sparkTex(): Texture {
  if (streak) return streak;
  const [c, g] = canvas(64, 12);
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(32, 6, 32, 5, 0, 0, Math.PI * 2);
  g.fill();
  streak = Texture.from(c);
  return streak;
}

export function skyTex(top: string, mid: string, bottom: string): Texture {
  const [c, g] = canvas(8, 720);
  const grad = g.createLinearGradient(0, 0, 0, 720);
  grad.addColorStop(0, top);
  grad.addColorStop(0.62, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 720);
  return Texture.from(c);
}

let vig: Texture | null = null;
export function vignetteTex(): Texture {
  if (vig) return vig;
  const [c, g] = canvas(640, 360);
  const grad = g.createRadialGradient(320, 190, 120, 320, 180, 420);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.75)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 640, 360);
  vig = Texture.from(c);
  return vig;
}
