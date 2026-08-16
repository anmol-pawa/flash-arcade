"use client";

/**
 * Downloads a SWF with progress reporting.
 *
 * Ruffle fetches the movie itself and reports nothing while it does, so a 36 MB
 * title sits on a featureless spinner. Fetching it here instead lets the UI show
 * real progress; the bytes are handed to Ruffle as an object URL, so the file is
 * still only downloaded once.
 */

export type SwfSource =
  /** Prefetched. `url` is an object URL that must be revoked after use. */
  | { kind: "ready"; url: string; revoke: () => void }
  /** Progress couldn't be measured; let Ruffle fetch the URL itself. */
  | { kind: "passthrough"; url: string }
  /**
   * The Archive refused or couldn't be reached. Reported rather than silently
   * falling through, so the UI can say the library is unreachable instead of
   * blaming the game, and so Ruffle doesn't repeat a request known to fail.
   */
  | { kind: "unavailable"; status: number };

export interface Progress {
  loaded: number;
  total: number;
}

/**
 * Two different fallbacks, deliberately kept apart:
 *
 *  - Progress can't be measured (no content-length, no stream) → passthrough.
 *    Not being able to draw a progress bar is never a reason to fail a game.
 *  - The Archive says no, or can't be reached → unavailable. Reporting this
 *    lets the UI blame the outage instead of the game, which matters: during an
 *    archive.org outage the old code fell through to Ruffle, which failed too,
 *    and the player was told the game was incompatible.
 */
export async function fetchSwfWithProgress(
  url: string,
  onProgress: (progress: Progress) => void,
  signal: AbortSignal
): Promise<SwfSource> {
  const passthrough: SwfSource = { kind: "passthrough", url };

  if (typeof window === "undefined") return passthrough;
  // Only same-origin proxy paths; blob/data URLs are already local.
  if (!url.startsWith("/")) return passthrough;

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch {
    // Aborted navigations are handled by the caller's cancelled flag; anything
    // else here means the request never completed at all.
    if (signal.aborted) return passthrough;
    return { kind: "unavailable", status: 0 };
  }

  if (!response.ok) return { kind: "unavailable", status: response.status };
  if (!response.body) return passthrough;

  const total = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isFinite(total) || total <= 0) return passthrough;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress({ loaded, total });
      }
    }
  } catch {
    // Aborted (navigation) or the stream broke mid-transfer. Release anything
    // queued and let Ruffle try normally rather than leaving it with no movie.
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
    return passthrough;
  }

  const blob = new Blob(chunks as BlobPart[], {
    type: "application/x-shockwave-flash",
  });
  const objectUrl = URL.createObjectURL(blob);

  return {
    kind: "ready",
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
