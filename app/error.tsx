"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary. Without this an unexpected throw during render
 * blanks the page entirely, which for an arcade means a black screen with no
 * way back — worse than any individual game failing.
 *
 * Note the retry prop is `unstable_retry` in this Next version, not the `reset`
 * older releases used.
 */
export default function ErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // No error service wired up; the console is the only record there is.
    console.error("Unhandled error in route:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-zinc-100">
        Something broke on this page
      </h1>
      <p className="text-sm leading-relaxed text-zinc-400">
        Not the emulator and not the Archive — this one is the site itself. The
        games are fine; this page just failed to render.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-zinc-600">Reference: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={unstable_retry}
          className="rounded-md border border-emerald-500/60 px-4 py-2 text-sm text-emerald-300 transition hover:border-emerald-400 hover:text-emerald-200"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
        >
          Back to the arcade
        </Link>
      </div>
    </div>
  );
}
