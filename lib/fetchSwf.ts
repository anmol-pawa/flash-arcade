"use client";

/**
 * Downloads a SWF with progress reporting.
 *
 * Ruffle fetches the movie itself and reports nothing while it does, so a 36 MB
 * title sits on a featureless spinner. Fetching it here instead lets the UI show
 * real progress; the bytes are handed to Ruffle as an object URL, so the file is
 * still only downloaded once.
 */

export interface SwfSource {
  /** URL to hand to Ruffle — an object URL when prefetched. */
  url: string;
  /** Set when an object URL was created and must be revoked after use. */
  revoke?: () => void;
}

export interface Progress {
  loaded: number;
  total: number;
}

/**
 * Falls back to the plain URL — letting Ruffle fetch as before — whenever
 * progress can't be tracked. A missing content-length or an unsupported stream
 * is a reason to skip the progress bar, never a reason to fail the game.
 */
export async function fetchSwfWithProgress(
  url: string,
  onProgress: (progress: Progress) => void,
  signal: AbortSignal
): Promise<SwfSource> {
  const plain: SwfSource = { url };

  if (typeof window === "undefined") return plain;
  // Only same-origin proxy paths; blob/data URLs are already local.
  if (!url.startsWith("/")) return plain;

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch {
    return plain;
  }

  if (!response.ok || !response.body) return plain;

  const total = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isFinite(total) || total <= 0) return plain;

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
    // Aborted (navigation) or the stream broke. Release anything queued and let
    // Ruffle fetch normally rather than leaving the player with no movie.
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
    return plain;
  }

  const blob = new Blob(chunks as BlobPart[], {
    type: "application/x-shockwave-flash",
  });
  const objectUrl = URL.createObjectURL(blob);

  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
