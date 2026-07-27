"use client";

import { useEffect, useState } from "react";
import type { SortKey } from "@/lib/archive";

const SORT_LABELS: Record<SortKey, string> = {
  popular: "Most played",
  title: "A–Z",
  recent: "Recently added",
};

export default function SearchBar({
  onSearchChange,
  sort,
  onSortChange,
}: {
  onSearchChange: (value: string) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
}) {
  const [input, setInput] = useState("");

  // Debounce so typing doesn't fire a request per keystroke at the Archive.
  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(input.trim()), 350);
    return () => clearTimeout(timer);
  }, [input, onSearchChange]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search 6,500+ preserved Flash games…"
          aria-label="Search games"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        />
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
          aria-hidden
        >
          ⌕
        </span>
      </div>

      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortKey)}
        aria-label="Sort games"
        className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-300 focus:border-emerald-500/60 focus:outline-none"
      >
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <option key={key} value={key}>
            {SORT_LABELS[key]}
          </option>
        ))}
      </select>
    </div>
  );
}
