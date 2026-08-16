# Flash Arcade

A browser-based player for the Flash games that went dark when Adobe killed Flash Player on 31 December 2020. Search ~6,500 preserved titles and play them instantly — no plugin, no download, no Flash Player.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · TanStack Query · Ruffle (Rust → WebAssembly)

---

## The problem

Flash Player is gone and cannot come back — every browser removed the plugin, and Adobe ships a kill switch. But the *games* survived: the Internet Archive preserved thousands of `.swf` files before the sites hosting them went offline.

Two pieces are needed to make them playable again:

1. **An emulator.** [Ruffle](https://ruffle.rs) is an open-source Flash Player reimplementation written in Rust and compiled to WebAssembly. It parses the original SWF and executes its ActionScript inside the browser sandbox — no plugin, and none of the security model that got Flash killed.
2. **The games.** The Internet Archive preserved them. `softwarelibrary_flash_games` holds ~6,400 curated titles; the wider `softwarelibrary_flash` adds animations, toys and experiments for ~19,800 in total. Both are switchable in the UI.

This app is the layer that joins them.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│                                                             │
│   React UI ──── TanStack Query ──── infinite-scroll grid    │
│      │                                                      │
│   Ruffle (WASM)  ← executes the SWF, renders to <canvas>    │
│      │ fetches SWF + runtime assets (same-origin only)      │
└──────┼──────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│  Next.js route handlers                                     │
│                                                             │
│   GET /api/search                  → archive.org search     │
│   GET /api/game/[id]               → resolved SWF + URLs    │
│   GET /api/asset/[id]/[...path]    → streams item files     │
└──────┬──────────────────────────────────────────────────────┘
       │
   archive.org  (search · metadata · downloads)
```

Nothing is rehosted. Every byte is streamed from archive.org on demand.

### Why the asset proxy exists

archive.org serves item downloads **without `Access-Control-Allow-Origin`**. Ruffle fetches the SWF from the browser, so a direct cross-origin load is blocked by CORS — the emulator never receives the bytes.

`/api/asset/[identifier]/[...path]` is a catch-all proxy that makes the SWF *and* everything the game loads at runtime (XML level data, MP3 audio, sub-SWFs) same-origin. Ruffle's `base` is pointed at the proxy directory so relative asset loads inside the movie resolve correctly. The route validates the identifier against `^[A-Za-z0-9._-]+$`, rejects path traversal, forwards `Range` headers for seekable media, and caches immutably (Archive items never change once uploaded).

### Saves and keyboard

Flash games stored progress in SharedObjects ("Flash cookies"). Ruffle implements
that over `localStorage`, keyed as `{hostname}/{swf directory}/{save name}` — and
because the proxy gives every game a stable path, **saves survive a reload on
their own**. The player detects saves belonging to the loaded movie and offers to
clear just those; `lib/ruffleSaves.ts` mirrors Ruffle's own key matching so one
game's save is never mistaken for another's.

Ruffle also leaves its player at `tabIndex -1`, so keyboard input goes to the
document and games feel dead until clicked. The player puts it in the tab order
and focuses it once the movie is genuinely running — focusing when `load()`
resolves is too early, as Ruffle has not yet wired up its shadow root's focus
delegation and the call silently does nothing.

The status line reports both facts, and reconciles them against
`document.activeElement` and storage every second rather than trusting events:
focus events are suppressed entirely while the document itself is unfocused, and
games write saves whenever they like. It should never claim the keyboard is
connected when it isn't.

### Fullscreen

Ruffle drives the **native Fullscreen API** (`requestFullscreen`/`exitFullscreen`),
which is why **Esc already exits** — the browser handles that itself and page
script cannot intercept it. The string `Escape` does not appear anywhere in
Ruffle's bundle; nothing here re-implements it.

The button is a real toggle, and its label is reconciled from
`document.fullscreenElement` rather than from what we last asked for. Fullscreen
can end by routes the page never initiates — Esc, F11, the browser's own exit
control, the OS — and a label tracking intent instead of state would go wrong on
every one of them.

Some contexts refuse fullscreen outright (embedded frames, kiosk policies).
Ruffle calls `requestFullscreen` internally and swallows the result, so the
button confirms from the DOM shortly after and says plainly that the browser
refused, instead of appearing to do nothing.

There is deliberately no double-click-to-fullscreen. Rapid clicking is the core
input of a great many Flash games, and it would fire constantly during normal
play.

### Download progress

Ruffle fetches the movie itself and reports nothing while it does, so a large
title sat on a featureless spinner — the most-played game in the collection is
36 MB. The player downloads the SWF itself instead, streaming the response so it
can show real progress, then hands the bytes to Ruffle as an object URL. The file
is still fetched exactly once.

Anything that makes progress unmeasurable — a missing `content-length`, an
unsupported stream, a failed request — falls back to handing Ruffle the plain URL
and the old spinner. Not being able to draw a progress bar is never a reason to
fail the game.

### Volume, and the shortcuts that aren't there

Volume is a slider plus a mute toggle, remembered across games and tabs.
Unmuting restores the level you picked rather than jumping back to full.

There are deliberately **no single-key shortcuts** (P to pause, M to mute, F for
fullscreen). The player holds keyboard focus so games actually receive input —
which means any letter key bound here would be stolen from the game. Plenty of
Flash titles use P, M and F for their own controls, so the shortcut would break
the thing the page exists to do. The on-screen controls are the trade.

### Two Ruffle behaviours worth knowing

Both were found by testing against the live emulator rather than by reading docs:

- **`load()` resolves even when the movie fails.** Ruffle reports problems by rendering its own "panic" screen into its shadow DOM, not by rejecting the promise. Detecting failure means watching for `#panic` in the shadow root — the app does this on load *and* keeps a `MutationObserver` attached, so a game that crashes mid-play is caught too. On failure the VM is destroyed and a plain-English card replaces the stage.
- **Stage size has two unreliable sources and one good one.** The Archive's own dimension probe is often wrong — it reports `133×22` for Bloxorz, whose real stage is `550×300`. Ruffle's `<canvas>` is no better: its backing buffer is a fixed `550×400` stretched with CSS, so it reports the same size for every movie. The only trustworthy source is `player.ruffle().metadata`, which mirrors the SWF header. It is populated only once the movie is actually running and Ruffle fires no event for it, so the player polls briefly, using the (sanity-checked) Archive hint meanwhile to avoid a layout jump.

## Running locally

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000.

The Ruffle build is vendored into `public/ruffle/` from the `@ruffle-rs/ruffle` npm package so the app has no CDN dependency at runtime. To upgrade:

```bash
npm install @ruffle-rs/ruffle@latest && cp node_modules/@ruffle-rs/ruffle/*.js node_modules/@ruffle-rs/ruffle/*.wasm public/ruffle/
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (runs `next typegen` first for route types) |

## Browsing the library

- **Search by name** across title, creator and description. Title matches are boosted 4× and creator 2×, so searching a game's name ranks the game itself above anything that merely mentions it.
- **Genre chips** — twelve curated keywords over the Archive's `subject` field. That field is free text and mostly noise (`Flash`, `flash game`, plot summaries), so this is a hand-picked set of tags that recur often enough to filter usefully, not a taxonomy the Archive publishes.
- **Era chips** — year ranges from the 1990s to the 2020s. Roughly half the library carries a usable `year`, so era browsing is a curated view rather than a complete partition, and the UI says so.
- **[Top 30 by decade](/decades)** — the most-played items of each era, prerendered, each decade in its own Suspense boundary so one slow Archive call can't stall the page.

Filters compose: *puzzle · 2000s · "bobble"* is a single query.

**Filters live in the URL**, not component state — `/?q=bobble&genre=puzzle&era=2000s`. So a filtered shelf can be shared or bookmarked, and opening a game then pressing back returns to the same shelf instead of a reset grid. Only non-default values are written, keeping links readable. Changes use `replace` rather than `push`, since a debounced search box would otherwise stack one history entry per keystroke and bury the page you came from.

## Measured compatibility

A harness drives the real pipeline (`/api/game` → proxy → Ruffle) against the
collection's most-played titles and records what actually happens. Over the top
26 items:

| Outcome | Count |
| --- | --- |
| Played, stage size confirmed from SWF header | 25 |
| Archive item contains no SWF at all (only screenshots) | 1 |

Of the titles that ran, 13 distinct stage sizes appeared — 640×480, 800×600,
550×350, 512×480, 320×240 and more — which is exactly why the canvas-measuring
approach had to go: it reported 550×400 for every one of them.

The sample skews to popular AS1/AS2-era games, so treat it as evidence the
pipeline is sound rather than as a compatibility rate for all 6,500 items.

Two things the harness taught us that are worth repeating: Ruffle only populates
`metadata` for a player that is genuinely laid out and running (an off-screen
probe reports nothing at all), and large movies can take many seconds to reach
that point — so the sizing poll is deliberately patient.

## What doesn't work

No emulator covers all of Flash, and this README would be dishonest to imply otherwise:

- **Server-dependent games.** Anything needing a login, leaderboard, or game server is unplayable — those servers are gone. Nothing can fix this.
- **Some ActionScript 3 titles.** Ruffle's AS1/AS2 coverage is essentially complete; AS3 is well advanced but still has gaps, so a minority of later games fail or misbehave.
- **Touch devices.** These games were designed for mouse and keyboard and predate touchscreens.

Failures surface as an explanatory card with a link to the original Archive item, never a blank black rectangle. Items that contain no SWF at all get their own message rather than a bare 404.

If a game you own isn't in the Archive's collection, **Your files** (`/local`) plays a `.swf` straight from your machine — nothing is uploaded.

## Project layout

| Path | Role |
| --- | --- |
| `lib/archive.ts` | Internet Archive client — search, metadata, SWF selection, URL builders |
| `lib/useShelf.ts` | Favourites and recently-played via `useSyncExternalStore` over `localStorage` |
| `app/api/search/route.ts` | Search proxy with input validation and caching |
| `app/api/asset/[identifier]/[...path]/route.ts` | Same-origin file proxy (see above) |
| `components/RufflePlayer.tsx` | Emulator lifecycle, panic detection, stage sizing, controls |
| `components/GameStage.tsx` | Client shell owning shelf side effects |
| `components/GameGrid.tsx` | Infinite-scroll grid via `IntersectionObserver` |
| `components/FilterBar.tsx` | Search, collection, sort, genre and era in one filter set |
| `app/decades/page.tsx` | Prerendered Top 30 per decade |
| `components/LocalSwfPlayer.tsx` | Plays the user's own `.swf` files, fully client-side |
| `types/ruffle.d.ts` | Hand-written typings — the package ships none |

## Implementation notes

- **Search input is escaped** against Lucene syntax before hitting the Archive, so a user typing `sonic: the "best"` can't break the query or inject clauses into the collection filter. Matching is scoped to title/description/creator rather than the whole document, which keeps results relevant.
- **Queries filter on `mediatype:software`.** The Archive stores sub-collection entries ("Software Library: Flash Animations") alongside real items, and their download counts run into the millions — without the filter they monopolise the popular sort and lead to pages with nothing playable on them.
- **`useSyncExternalStore` for the shelf**, not effect-driven state: `localStorage` *is* an external store, so this gives correct server/client snapshots and avoids cascading renders on hydration. Snapshots are memoised against the raw string to stay referentially stable.
- **No database.** The shelf is device-local by design, which keeps the app statically deployable.
- **The player is keyed by game identifier**, so navigating between games remounts cleanly rather than resetting state by hand.

## Credits & licence

Games are served from the Internet Archive's [Flash software library](https://archive.org/details/softwarelibrary_flash_games) and each links back to its original item page. Rights holders wanting an item removed should contact the Archive, which maintains the collection.

Emulation by [Ruffle](https://ruffle.rs) (MIT / Apache-2.0). This project is MIT licensed — see [LICENSE](LICENSE).
