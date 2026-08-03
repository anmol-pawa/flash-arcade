"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RufflePlayerElement, RuffleInstance } from "@/types/ruffle";
import { clearSaves, saveSize } from "@/lib/ruffleSaves";

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
function classifyPanic(panicText: string, isLocal: boolean): string {
  const text = panicText.toLowerCase();
  if (text.includes("failed to load")) {
    return isLocal
      ? "The file couldn't be read."
      : "The game file couldn't be fetched from the Internet Archive.";
  }
  if (text.includes("cannot parse") || text.includes("invalid swf")) {
    return isLocal
      ? "That file isn't a Flash movie Ruffle can read."
      : "This item's file isn't a Flash movie Ruffle can read.";
  }
  return "The emulator hit something in this game it doesn't support yet.";
}

export interface RufflePlayerProps {
  /** Same-origin URL of the SWF (the /api/asset proxy, or a local blob URL). */
  swfUrl: string;
  /**
   * Directory the movie resolves relative asset loads against. Omitted for
   * local files, which have no sibling assets to fetch.
   */
  baseUrl?: string;
  title: string;
  /** Native stage size, used to preserve the game's real aspect ratio. */
  width?: number;
  height?: number;
  /** Shown in the failure card so users can still reach the original. */
  archiveUrl?: string;
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
  /** Read from Ruffle's SWF header metadata once the movie runs — see below. */
  const [stage, setStage] = useState<{ ratio: string; background: string | null } | null>(
    null
  );
  const [saveBytes, setSaveBytes] = useState(0);
  /** Tracked from real focus events — never assumed. */
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    // `cancelled` guards against React's dev-mode double-mount and against the
    // user navigating away mid-load, both of which would otherwise leave an
    // orphaned player attached to a detached container.
    // No state reset here: callers key this component by game identifier, so a
    // different SWF arrives as a fresh mount with correct initial state.
    let cancelled = false;
    let element: RufflePlayerElement | null = null;
    let panicObserver: MutationObserver | null = null;
    let metadataTimer: number | undefined;

    // Ruffle's shadow root uses delegatesFocus, so focusing the host forwards
    // focus to an inner element. `focus`/`blur` don't bubble and never reach a
    // listener on the host, so watch the document's bubbling focusin/focusout
    // and just ask who the active element actually is.
    // Checked on the next tick, not inline: during `focusout` the browser has
    // not yet moved activeElement, so reading it there reports the element that
    // is *losing* focus and the flag would never go false.
    const syncFocus = () => {
      window.setTimeout(() => {
        if (!cancelled) setHasFocus(document.activeElement === element);
      }, 0);
    };

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

        return instance.load(
          baseUrl ? { url: swfUrl, base: baseUrl } : { url: swfUrl }
        );
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
          setErrorMessage(classifyPanic(panic.textContent ?? "", !archiveUrl));
          setStatus("error");
          return true;
        };

        if (checkPanic()) return;
        setStatus("ready");

        // Ruffle leaves the player at tabIndex -1, so keyboard events go to the
        // document and games appear unresponsive until clicked. Put it in the
        // tab order so it is reachable by keyboard as well as by mouse.
        if (element) {
          element.tabIndex = 0;
          document.addEventListener("focusin", syncFocus);
          document.addEventListener("focusout", syncFocus);
        }

        // The real stage size comes from Ruffle's `metadata`, which mirrors the
        // SWF header. Don't measure the <canvas>: its backing buffer is a fixed
        // 550x400 that Ruffle stretches with CSS, so it reports the same size
        // for every movie regardless of the actual stage.
        //
        // `metadata` is only populated once the movie is running and Ruffle
        // emits no event for it, so poll briefly rather than guess.
        // Generous: big movies (one popular title is 36 MB uncompressed) can take
        // many seconds to start running. Falling past the deadline is harmless —
        // the Archive hint stays in place — so err on the side of waiting.
        const deadline = Date.now() + 30_000;
        const readStage = () => {
          if (cancelled) return;
          const md = instanceRef.current?.metadata;
          if (md && md.width > 0 && md.height > 0) {
            setStage({
              ratio: `${md.width} / ${md.height}`,
              background: md.backgroundColor,
            });
            // Focus only now. Calling it when `load()` resolved was too early:
            // Ruffle had not yet wired the shadow DOM's focus delegation, so
            // the call silently did nothing. `preventScroll` stops the page
            // jumping to the stage.
            try {
              element?.focus({ preventScroll: true });
            } catch {
              element?.focus();
            }
            syncFocus();
            return;
          }
          if (Date.now() < deadline) {
            metadataTimer = window.setTimeout(readStage, 120);
          }
        };
        readStage();

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
      if (metadataTimer !== undefined) window.clearTimeout(metadataTimer);
      document.removeEventListener("focusin", syncFocus);
      document.removeEventListener("focusout", syncFocus);
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
  }, [swfUrl, baseUrl, archiveUrl]);

  // Two things the status line reports that have no event to subscribe to:
  //
  //  - Games write SharedObject saves through Ruffle whenever they like.
  //  - Focus events are suppressed entirely while the document itself is
  //    unfocused (background tab, or an unfocused window), so the focusin /
  //    focusout listeners alone can leave the indicator stale.
  //
  // Both claims are shown to the player, so reconcile them against reality on a
  // slow interval rather than trusting the last event to have arrived.
  useEffect(() => {
    if (status !== "ready") return;

    const container = containerRef.current;
    const reconcile = () => {
      const player = container?.firstElementChild ?? null;
      setHasFocus(player !== null && document.activeElement === player);
      // Local files get a throwaway blob URL, so their saves can't be looked up
      // stably and there is nothing meaningful to report.
      if (swfUrl.startsWith("/")) setSaveBytes(saveSize(swfUrl));
    };

    reconcile();
    const timer = window.setInterval(reconcile, 1_000);
    return () => window.clearInterval(timer);
  }, [swfUrl, status]);

  const handleClearSaves = useCallback(() => {
    const removed = clearSaves(swfUrl);
    if (removed > 0) setSaveBytes(0);
  }, [swfUrl]);

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

  // Prefer Ruffle's SWF-header metadata; fall back to the Archive's
  // sanity-checked hint (which avoids a layout jump on first paint), then to
  // Flash's most common stage size.
  const aspectRatio =
    stage?.ratio ?? (width && height ? `${width} / ${height}` : "4 / 3");

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
        {archiveUrl ? (
          <a
            href={archiveUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            View on the Internet Archive →
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cap the stage height so a 4:3 game doesn't fill a tall viewport; the
          width derives from the aspect ratio, keeping the stage centred. */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg border border-zinc-800"
        style={{
          aspectRatio,
          maxHeight: "72vh",
          maxWidth: `calc(72vh * (${aspectRatio}))`,
          // Match the movie's own stage colour so letterbox bars don't clash.
          backgroundColor: stage?.background ?? "#000",
        }}
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

        {saveBytes > 0 ? (
          <button
            type="button"
            onClick={handleClearSaves}
            title="Delete this game's saved progress"
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-red-500/60 hover:text-red-300"
          >
            Clear save
          </button>
        ) : null}

        <p className="ml-auto text-xs text-zinc-600">
          {/* Driven by real focus events, so this never claims the keyboard is
              connected when it isn't. */}
          {status !== "ready"
            ? null
            : hasFocus
              ? saveBytes > 0
                ? "Keyboard ready · progress saved on this device"
                : "Keyboard ready"
              : "Click the game to use your keyboard"}
        </p>
      </div>
    </div>
  );
}
