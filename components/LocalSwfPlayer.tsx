"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RufflePlayer from "@/components/RufflePlayer";

/**
 * Plays a .swf from the user's own machine. Everything stays client-side: the
 * file is handed to Ruffle through an object URL and never leaves the browser.
 */

interface LoadedFile {
  name: string;
  size: number;
  url: string;
}

/** SWF magic bytes: uncompressed, zlib-compressed, and LZMA-compressed. */
const SWF_SIGNATURES = ["FWS", "CWS", "ZWS"];

async function looksLikeSwf(file: File): Promise<boolean> {
  const header = await file.slice(0, 3).arrayBuffer();
  const signature = String.fromCharCode(...new Uint8Array(header));
  return SWF_SIGNATURES.includes(signature);
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function LocalSwfPlayer() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Held in a ref so the revoke on unmount sees the latest URL without making
  // the cleanup effect depend on (and re-run for) every file change.
  const activeUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    };
  }, []);

  const accept = useCallback(async (candidate: File | undefined) => {
    if (!candidate) return;

    if (!(await looksLikeSwf(candidate))) {
      setError(
        `“${candidate.name}” isn't a Flash movie — its header doesn't start with FWS, CWS or ZWS.`
      );
      return;
    }

    // Release the previous movie before replacing it.
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    const url = URL.createObjectURL(candidate);
    activeUrl.current = url;
    setError(null);
    setFile({ name: candidate.name, size: candidate.size, url });
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      void accept(event.dataTransfer.files[0]);
    },
    [accept]
  );

  if (file) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-50">{file.name}</h1>
            <p className="text-xs text-zinc-500">
              {formatSize(file.size)} · playing from your device
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
              activeUrl.current = null;
              setFile(null);
            }}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            Load another
          </button>
        </div>

        <RufflePlayer key={file.url} swfUrl={file.url} title={file.name} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          Play your own Flash files
        </h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          Got SWFs of your own — a Flashpoint export, an old backup, something you
          made? Drop one here. It runs entirely in your browser; the file is never
          uploaded anywhere.
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-12 text-center transition ${
          isDragging
            ? "border-emerald-400 bg-emerald-500/5"
            : "border-zinc-700 bg-zinc-900/40"
        }`}
      >
        <p className="text-sm text-zinc-300">Drop a .swf file here</p>
        <p className="mt-1 text-xs text-zinc-600">or</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 transition hover:border-emerald-500/60 hover:text-white"
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".swf,application/x-shockwave-flash"
          className="hidden"
          onChange={(event) => void accept(event.target.files?.[0])}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-200"
        >
          {error}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-zinc-600">
        Files opened here aren&apos;t saved or added to your shelf — reloading the page
        clears them. Games that expect a server they can no longer reach will still
        fail, the same as anything else from the Flash era.
      </p>
    </div>
  );
}
