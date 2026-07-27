"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RufflePlayerElement, RuffleInstance } from "@/types/ruffle";

const RUFFLE_SCRIPT = "/ruffle/ruffle.js";

/**
 * Ruffle installs itself onto `window.RufflePlayer` when its script runs. We
 * only ever want one script tag per document, so the load is memoised into a
 * module-level promise shared by every player instance.
 */
let ruffleScriptPromise: Promise<void> | null = null;

function loadRuffleScript(): Promise<void> {
  if (ruffleScriptPromise) return ruffleScriptPromise;

  ruffleScriptPromise = new Promise<void>((resolve, reject) => {
    if (window.RufflePlayer?.newest()) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RUFFLE_SCRIPT}"]`
    );
    const script = existing ?? document.createElement("script");

    const onLoad = () => resolve();
    const onError = () => {
      // Allow a later retry rather than caching the failure forever.
      ruffleScriptPromise = null;
      reject(new Error("Failed to load the Ruffle emulator."));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.src = RUFFLE_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return ruffleScriptPromise;
}

type Status = "loading" | "ready" | "error";

/**
 * Turn Ruffle's panic screen into one line of plain English. Its own wording is
 * aimed at developers and is styled for its shadow DOM, so we surface our own.
 */
function classifyPanic(panicText: string): string {
  const text = panicText.toLowerCase();
  if (text.includes("failed to load")) {
    return "The game file couldn't be fetched from the Internet Archive.";
  }
  if (text.includes("cannot parse") || text.includes("invalid swf")) {
    return "This item's file isn't a Flash movie Ruffle can read.";
  }
  return "The emulator hit something in this game it doesn't support yet.";
}

export interface RufflePlayerProps {
  /** Same-origin URL of the SWF (see the /api/asset proxy). */
  swfUrl: string;
  /** Same-origin directory the movie resolves relative asset loads against. */
  baseUrl: string;
  title: string;
  /** Native stage size, used to preserve the game's real aspect ratio. */
  width?: number;
  height?: number;
  /** Shown in the failure card so users can still reach the original. */
  archiveUrl: string;
}

export default function RufflePlayer({
  swfUrl,
  baseUrl,
  title,
  width,
  height,
  archiveUrl,
}: RufflePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<RuffleInstance | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isPaused, setIsPaused] = useState(false);
  /** Measured from Ruffle once the movie is parsed — see below. */
  const [measuredRatio, setMeasuredRatio] = useState<string | null>(null);

  useEffect(() => {
    // `cancelled` guards against React's dev-mode double-mount and against the
    // user navigating away mid-load, both of which would otherwise leave an
    // orphaned player attached to a detached container.
    // No state reset here: callers key this component by game identifier, so a
    // different SWF arrives as a fresh mount with correct initial state.
    let cancelled = false;
    let element: RufflePlayerElement | null = null;
    let panicObserver: MutationObserver | null = null;

    loadRuffleScript()
      .then(() => {
        if (cancelled) return;

        const source = window.RufflePlayer?.newest();
        const container = containerRef.current;
        if (!source || !container) {
          throw new Error("The Ruffle emulator did not initialise.");
        }

        element = source.createPlayer();
        element.style.width = "100%";
        element.style.height = "100%";
        container.appendChild(element);

        const instance = element.ruffle();
        instanceRef.current = instance;

        instance.config = {
          autoplay: "on",
          // Browsers block audio before a gesture; Ruffle's overlay prompts for
          // the click that unmutes, instead of the game just being silent.
          unmuteOverlay: "visible",
          letterbox: "on",
          scale: "showAll",
          quality: "high",
          contextMenu: "rightClickOnly",
          warnOnUnsupportedContent: false,
          logLevel: "error",
        };

        return instance.load({ url: swfUrl, base: baseUrl });
      })
      .then(() => {
        if (cancelled || !element) return;

        const shadow = element.shadowRoot;

        // `load()` resolves even when the movie fails — Ruffle reports problems
        // by rendering its own "panic" screen inside the shadow DOM instead of
        // rejecting. So the promise tells us nothing; the DOM is the signal.
        const checkPanic = (): boolean => {
          const panic = shadow?.querySelector("#panic");
          if (!panic) return false;
          // Showing our card unmounts the stage, so shut the VM down explicitly
          // rather than leaving a dead player consuming CPU and audio.
          panicObserver?.disconnect();
          panicObserver = null;
          try {
            instanceRef.current?.destroy?.();
          } catch {
            // Already torn down.
          }
          instanceRef.current = null;
          setErrorMessage(classifyPanic(panic.textContent ?? ""));
          setStatus("error");
          return true;
        };

        if (checkPanic()) return;

        // Ruffle parses the true stage size from the SWF header, so its canvas
        // is authoritative. The Archive's metadata is often wrong (it claims
        // 133x22 for Bloxorz), which would otherwise squash the stage.
        const canvas = shadow?.querySelector("canvas");
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          setMeasuredRatio(`${canvas.width} / ${canvas.height}`);
        }
        setStatus("ready");

        // A game can also panic later — an unimplemented AS3 call mid-level, for
        // instance — so keep watching rather than only checking once.
        if (shadow) {
          panicObserver = new MutationObserver(() => {
            if (!cancelled) checkPanic();
          });
          panicObserver.observe(shadow, { childList: true, subtree: true });
        }
      })
      .catch((error: unknown) => {
        // Reached when the emulator script itself fails to load.
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : "This game could not be started."
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
      panicObserver?.disconnect();
      const instance = instanceRef.current;
      instanceRef.current = null;
      // Stop the WASM VM so an abandoned game isn't left burning CPU/audio.
      try {
        instance?.pause();
        instance?.destroy?.();
      } catch {
        // The player may already be torn down; nothing useful to do here.
      }
      element?.remove();
    };
  }, [swfUrl, baseUrl]);

  const togglePause = useCallback(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (instance.isPlaying) {
      instance.pause();
      setIsPaused(true);
    } else {
      instance.play();
      setIsPaused(false);
    }
  }, []);

  const goFullscreen = useCallback(() => {
    instanceRef.current?.enterFullscreen();
  }, []);

  // Prefer what Ruffle measured; then the Archive's (sanity-checked) hint;
  // then Flash's most common stage size.
  const aspectRatio =
    measuredRatio ?? (width && height ? `${width} / ${height}` : "4 / 3");

  if (status === "error") {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-8 text-center">
        <h2 className="text-lg font-semibold text-amber-200">
          This one won&apos;t run
        </h2>
        <p className="mx-auto mt-3 max-w-prose text-sm leading-relaxed text-zinc-400">
          Ruffle couldn&apos;t start <span className="text-zinc-200">{title}</span>. No
          emulator covers all of Flash yet — games built on later ActionScript 3
          features, or ones that talked to servers now switched off, are the usual
          casualties.
        </p>
        {errorMessage ? (
          <p className="mt-3 font-mono text-xs text-zinc-600">{errorMessage}</p>
        ) : null}
        <a
          href={archiveUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
        >
          View on the Internet Archive →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cap the stage height so a 4:3 game doesn't fill a tall viewport; the
          width derives from the aspect ratio, keeping the stage centred. */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg border border-zinc-800 bg-black"
        style={{ aspectRatio, maxHeight: "72vh", maxWidth: `calc(72vh * (${aspectRatio}))` }}
      >
        <div ref={containerRef} className="absolute inset-0" />
        {status === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400"
              aria-hidden
            />
            <p className="text-sm text-zinc-500">Starting the emulator…</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePause}
          disabled={status !== "ready"}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPaused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={goFullscreen}
          disabled={status !== "ready"}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Fullscreen
        </button>
        <p className="ml-auto text-xs text-zinc-600">
          Click the game first so it receives your keyboard input.
        </p>
      </div>
    </div>
  );
}
