"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  DECADES,
  GENRES,
  type CollectionKey,
  type DecadeKey,
  type GenreKey,
  type SortKey,
} from "@/lib/archive";

const SORT_LABELS: Record<SortKey, string> = {
  popular: "Most played",
  title: "A–Z",
  recent: "Recently added",
};

export interface Filters {
  search: string;
  sort: SortKey;
  collection: CollectionKey;
  genre?: GenreKey;
  decade?: DecadeKey;
}

const selectClass =
  "rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-300 focus:border-emerald-500/60 focus:outline-none";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
          : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState(filters.search);
  const [syncedSearch, setSyncedSearch] = useState(filters.search);

  // Filters live in the URL, so `filters.search` can change without the user
  // typing — browser back, or a shared link. Adopt it during render (React's
  // pattern for state derived from props) so the box never shows stale text.
  if (filters.search !== syncedSearch) {
    setSyncedSearch(filters.search);
    setInput(filters.search);
  }

  // "/" jumps to search, the convention on any site with a search box.
  //
  // Safe only because this bar lives on the library page. The play page
  // deliberately has no single-key shortcuts: the emulator holds keyboard
  // focus there and any letter bound would be stolen from the game.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (typing) return;
      event.preventDefault();
      searchRef.current?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounce typing so the Archive isn't hit on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = input.trim();
      if (trimmed !== filters.search) onChange({ ...filters, search: trimmed });
    }, 350);
    return () => clearTimeout(timer);
  }, [input, filters, onChange]);

  const hasFilters = Boolean(filters.genre || filters.decade || filters.search);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <input
            ref={searchRef}
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={`Search ${COLLECTIONS[
              filters.collection
            ].approx.toLocaleString()}+ preserved Flash items by name…`}
            aria-label="Search by name"
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
          value={filters.collection}
          onChange={(event) =>
            onChange({ ...filters, collection: event.target.value as CollectionKey })
          }
          aria-label="Which collection to search"
          className={selectClass}
        >
          {(Object.keys(COLLECTIONS) as CollectionKey[]).map((key) => (
            <option key={key} value={key}>
              {COLLECTIONS[key].label}
            </option>
          ))}
        </select>

        <select
          value={filters.sort}
          onChange={(event) =>
            onChange({ ...filters, sort: event.target.value as SortKey })
          }
          aria-label="Sort results"
          className={selectClass}
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs uppercase tracking-wide text-zinc-600">
          Genre
        </span>
        {(Object.keys(GENRES) as GenreKey[]).map((key) => (
          <Chip
            key={key}
            active={filters.genre === key}
            // Clicking the active chip clears it — no separate "all" control.
            onClick={() =>
              onChange({ ...filters, genre: filters.genre === key ? undefined : key })
            }
          >
            {GENRES[key].label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs uppercase tracking-wide text-zinc-600">Era</span>
        {(Object.keys(DECADES) as DecadeKey[]).map((key) => (
          <Chip
            key={key}
            active={filters.decade === key}
            onClick={() =>
              onChange({
                ...filters,
                decade: filters.decade === key ? undefined : key,
              })
            }
          >
            {DECADES[key].label}
          </Chip>
        ))}

        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setInput("");
              onChange({ ...filters, search: "", genre: undefined, decade: undefined });
            }}
            className="ml-2 text-xs text-zinc-500 underline underline-offset-4 transition hover:text-zinc-300"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
