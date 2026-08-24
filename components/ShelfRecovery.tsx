"use client";

import { useCallback, useState } from "react";

/**
 * Shows this browser's recovery code, and adopts one from another browser.
 *
 * The shelf is keyed by an id in a cookie. Clearing cookies leaves the rows in
 * the database with nothing pointing at them — this is what makes that
 * recoverable, and what lets a shelf move between browsers or machines.
 */
export default function ShelfRecovery() {
  const [code, setCode] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reveal = useCallback(async () => {
    setRevealing(true);
    try {
      const res = await fetch("/api/device");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { code?: string };
      setCode(data.code ?? null);
    } catch {
      setStatus({ ok: false, message: "Couldn't reach the server for your code." });
      setRevealing(false);
    }
  }, []);

  const copy = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the code is on screen to copy by hand.
    }
  }, [code]);

  const adopt = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus({ ok: false, message: data.error ?? "That code didn't work." });
        setBusy(false);
        return;
      }
      setStatus({ ok: true, message: "Shelf restored. Reloading…" });
      // Full reload: the sync hook reads the cookie once on mount, so the new
      // identity only takes effect on a fresh page.
      window.setTimeout(() => window.location.reload(), 800);
    } catch {
      setStatus({ ok: false, message: "Couldn't reach the server." });
      setBusy(false);
    }
  }, [input]);

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Move or recover this shelf
        </h2>
        <p className="text-sm leading-relaxed text-zinc-400">
          Your shelf is tied to this browser by a cookie. Clearing cookies would
          otherwise strand it — keep this code and you can bring it back, or open
          the same shelf on another browser.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {code ? (
          <>
            <code className="rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-emerald-300">
              {code}
            </code>
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={reveal}
            disabled={revealing}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-40"
          >
            {revealing ? "Fetching…" : "Show my code"}
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-zinc-800/80 pt-4">
        <label htmlFor="recovery-code" className="block text-xs text-zinc-500">
          Have a code from another browser?
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="recovery-code"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="paste a recovery code"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={adopt}
            disabled={busy || input.trim() === ""}
            className="rounded-md border border-emerald-500/60 px-3 py-1.5 text-xs text-emerald-300 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Restore
          </button>
        </div>
        {status ? (
          <p
            role="status"
            className={`text-xs ${status.ok ? "text-emerald-400" : "text-amber-300"}`}
          >
            {status.message}
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-zinc-600">
          Anyone with a code can open that shelf, so treat it like a key. It
          guards a list of games — nothing personal.
        </p>
      </div>
    </section>
  );
}
