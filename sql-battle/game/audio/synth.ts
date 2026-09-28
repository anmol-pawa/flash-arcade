"use client";
/**
 * All sound is synthesized with the Web Audio API — no audio files, no
 * licensing. The context starts on the first user gesture (browser policy).
 */
import type { AttackKind } from "@/lib/dialect/concepts";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let volume = 0.6;
let musicOn = true;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setVolume(v: number) {
  volume = v;
  if (master) master.gain.value = v;
}

function tone(freq: number, dur: number, o: { type?: OscillatorType; gain?: number; slide?: number; delay?: number; dest?: AudioNode } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * o.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(o.dest ?? master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, o: { gain?: number; freq?: number; q?: number; delay?: number; sweep?: number } = {}) {
  const c = ac();
  if (!c || !master || !noiseBuf) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(o.freq ?? 1200, t0);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  unlock() {
    ac();
  },
  click() {
    tone(880, 0.06, { type: "square", gain: 0.05 });
  },
  hover() {
    tone(1400, 0.03, { type: "sine", gain: 0.025 });
  },
  card() {
    tone(660, 0.08, { type: "triangle", gain: 0.08, slide: 1.5 });
  },
  charge() {
    tone(180, 0.6, { type: "sawtooth", gain: 0.05, slide: 4 });
    noise(0.6, { gain: 0.05, freq: 400, sweep: 3000 });
  },
  cast(kind: AttackKind) {
    const base: Record<AttackKind, number> = { bolt: 880, chain: 330, slam: 110, mirror: 520, summon: 440, blade: 990, fusion: 660, shield: 392, haste: 1175, forge: 147, surge: 262, storm: 98, vortex: 220, lance: 784 };
    const f = base[kind];
    tone(f, 0.35, { type: "sawtooth", gain: 0.09, slide: 0.5 });
    tone(f * 1.5, 0.3, { type: "square", gain: 0.04, slide: 0.6, delay: 0.03 });
    noise(0.25, { gain: 0.12, freq: 2500, sweep: 500 });
  },
  hit(crit = false) {
    tone(crit ? 70 : 90, 0.35, { type: "sine", gain: 0.5, slide: 0.4 });
    noise(0.22, { gain: crit ? 0.5 : 0.32, freq: 900, sweep: 150 });
    if (crit) tone(1760, 0.3, { type: "triangle", gain: 0.08, slide: 0.5, delay: 0.02 });
  },
  hurt() {
    tone(160, 0.3, { type: "square", gain: 0.12, slide: 0.35 });
    noise(0.2, { gain: 0.25, freq: 600, sweep: 120 });
  },
  miss() {
    tone(330, 0.25, { type: "triangle", gain: 0.1, slide: 0.5 });
    tone(247, 0.3, { type: "triangle", gain: 0.08, slide: 0.5, delay: 0.1 });
  },
  error() {
    tone(200, 0.12, { type: "square", gain: 0.08 });
    tone(150, 0.2, { type: "square", gain: 0.08, delay: 0.12 });
  },
  victory() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { type: "triangle", gain: 0.12, delay: i * 0.12 }));
    tone(1047, 1.2, { type: "sine", gain: 0.08, delay: 0.5 });
  },
  defeat() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, { type: "sawtooth", gain: 0.06, delay: i * 0.2 }));
  },
  unlockCodex() {
    tone(1318, 0.15, { type: "sine", gain: 0.08 });
    tone(1760, 0.3, { type: "sine", gain: 0.08, delay: 0.1 });
  },
};

/** Minimal step sequencer: bass + arpeggio in a minor key, tempo by intensity. */
export function startMusic(root = 110, bpm = 112) {
  stopMusic();
  if (!musicOn) return;
  const c = ac();
  if (!c || !musicGain) return;
  const scale = [0, 3, 5, 7, 10, 12, 15];
  const bass = [0, 0, 5, 3];
  let step = 0;
  const stepDur = 60 / bpm / 2;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== "running") return;
    const bar = Math.floor(step / 8) % bass.length;
    if (step % 8 === 0) tone(root * Math.pow(2, bass[bar] / 12) / 2, stepDur * 7, { type: "sawtooth", gain: 0.12, dest: musicGain! });
    if (step % 2 === 0) noise(0.04, { gain: 0.05, freq: 8000 });
    if (step % 8 === 4) noise(0.12, { gain: 0.12, freq: 1800 });
    const n = scale[(step * 3 + bar) % scale.length];
    tone(root * 2 * Math.pow(2, (n + bass[bar]) / 12), stepDur * 0.9, { type: "square", gain: 0.035, dest: musicGain! });
    step++;
  }, stepDur * 1000);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

export function setMusic(on: boolean) {
  musicOn = on;
  if (!on) stopMusic();
}
