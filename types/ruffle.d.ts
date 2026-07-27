/**
 * Minimal typings for the self-hosted Ruffle build, which ships no .d.ts.
 * Covers only the surface this app uses; see
 * https://github.com/ruffle-rs/ruffle/wiki/Using-Ruffle#javascript-api
 */

export interface RuffleLoadOptions {
  url: string;
  /** Resolves relative asset loads the movie performs at runtime. */
  base?: string;
  parameters?: string | Record<string, string>;
  allowScriptAccess?: boolean;
}

export type RuffleAutoplay = "on" | "off" | "auto";
export type RuffleUnmuteVisibility = "visible" | "hidden";
export type RuffleLetterbox = "on" | "off" | "fullscreen";
export type RuffleScale = "showAll" | "noBorder" | "exactFit" | "noScale";
export type RuffleQuality = "low" | "medium" | "high" | "best";
export type RuffleLogLevel = "error" | "warn" | "info" | "debug" | "trace";

export interface RuffleConfig {
  autoplay?: RuffleAutoplay;
  unmuteOverlay?: RuffleUnmuteVisibility;
  letterbox?: RuffleLetterbox;
  scale?: RuffleScale;
  quality?: RuffleQuality;
  logLevel?: RuffleLogLevel;
  contextMenu?: "on" | "off" | "rightClickOnly";
  splashScreen?: boolean;
  preferredRenderer?: "canvas" | "webgl" | "webgpu";
  warnOnUnsupportedContent?: boolean;
  publicPath?: string;
  wmode?: "window" | "opaque" | "transparent" | "direct" | "gpu";
}

/** The API object returned by `<ruffle-player>.ruffle()`. */
export interface RuffleInstance {
  config: RuffleConfig;
  load(options: RuffleLoadOptions | string): Promise<void>;
  play(): void;
  pause(): void;
  readonly isPlaying: boolean;
  set volume(value: number);
  get volume(): number;
  enterFullscreen(): void;
  exitFullscreen(): void;
  remove(): void;
  destroy?(): void;
}

/** The `<ruffle-player>` custom element. */
export interface RufflePlayerElement extends HTMLElement {
  ruffle(): RuffleInstance;
}

export interface RuffleSourceAPI {
  createPlayer(): RufflePlayerElement;
}

export interface RufflePlayerGlobal {
  config?: RuffleConfig;
  newest(): RuffleSourceAPI | null;
}

declare global {
  interface Window {
    RufflePlayer?: RufflePlayerGlobal;
  }
}
