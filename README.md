# Flash Arcade

A browser-based player for the Flash games that went dark when Adobe killed Flash Player on 31 December 2020. Search ~6,500 preserved titles and play them instantly — no plugin, no download, no Flash Player.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · TanStack Query · Ruffle (Rust → WebAssembly)

---

## The problem

Flash Player is gone and cannot come back — every browser removed the plugin, and Adobe ships a kill switch. But the *games* survived: the Internet Archive preserved thousands of `.swf` files before the sites hosting them went offline.

Two pieces are needed to make them playable again:

1. **An emulator.** [Ruffle](https://ruffle.rs) is an open-source Flash Player reimplementation written in Rust and compiled to WebAssembly. It parses the original SWF and executes its ActionScript inside the browser sandbox — no plugin, and none of the security model that got Flash killed.
2. **The games.** The Internet Archive's `softwarelibrary_flash_games` collection holds ~6,500 titles with public search and download APIs.

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
│   GET /api/asset/[id]/[...path]    → streams item files     │
└──────┬──────────────────────────────────────────────────────┘
       │
   archive.org  (search · metadata · downloads)
```

Nothing is rehosted. Every byte is streamed from archive.org on demand.

### Why the asset proxy exists

archive.org serves item downloads **without `Access-Control-Allow-Origin`**. Ruffle fetches the SWF from the browser, so a direct cross-origin load is blocked by CORS — the emulator never receives the bytes.

`/api/asset/[identifier]/[...path]` is a catch-all proxy that makes the SWF *and* everything the game loads at runtime (XML level data, MP3 audio, sub-SWFs) same-origin. Ruffle's `base` is pointed at the proxy directory so relative asset loads inside the movie resolve correctly. The route validates the identifier against `^[A-Za-z0-9._-]+$`, rejects path traversal, forwards `Range` headers for seekable media, and caches immutably (Archive items never change once uploaded).

### Two Ruffle behaviours worth knowing

Both were found by testing against the live emulator rather than by reading docs:

- **`load()` resolves even when the movie fails.** Ruffle reports problems by rendering its own "panic" screen into its shadow DOM, not by rejecting the promise. Detecting failure means watching for `#panic` in the shadow root — the app does this on load *and* keeps a `MutationObserver` attached, so a game that crashes mid-play is caught too. On failure the VM is destroyed and a plain-English card replaces the stage.
- **The Archive's SWF dimension metadata is unreliable.** It reports `133×22` for Bloxorz, whose real stage is `550×400`. Metadata is accepted only if it's a plausible stage size; the authoritative value is read from Ruffle's own `<canvas>` after load, since Ruffle parses the true dimensions from the SWF header.

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

## What doesn't work

No emulator covers all of Flash, and this README would be dishonest to imply otherwise:

- **Server-dependent games.** Anything needing a login, leaderboard, or game server is unplayable — those servers are gone. Nothing can fix this.
- **Some ActionScript 3 titles.** Ruffle's AS1/AS2 coverage is essentially complete; AS3 is well advanced but still has gaps, so a minority of later games fail or misbehave.
- **Touch devices.** These games were designed for mouse and keyboard and predate touchscreens.

Failures surface as an explanatory card with a link to the original Archive item, never a blank black rectangle.

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
| `types/ruffle.d.ts` | Hand-written typings — the package ships none |

## Implementation notes

- **Search input is escaped** against Lucene syntax before hitting the Archive, so a user typing `sonic: the "best"` can't break the query or inject clauses into the collection filter. Matching is scoped to title/description/creator rather than the whole document, which keeps results relevant.
- **`useSyncExternalStore` for the shelf**, not effect-driven state: `localStorage` *is* an external store, so this gives correct server/client snapshots and avoids cascading renders on hydration. Snapshots are memoised against the raw string to stay referentially stable.
- **No database.** The shelf is device-local by design, which keeps the app statically deployable.
- **The player is keyed by game identifier**, so navigating between games remounts cleanly rather than resetting state by hand.

## Credits & licence

Games are served from the Internet Archive's [Flash software library](https://archive.org/details/softwarelibrary_flash_games) and each links back to its original item page. Rights holders wanting an item removed should contact the Archive, which maintains the collection.

Emulation by [Ruffle](https://ruffle.rs) (MIT / Apache-2.0). This project is MIT licensed — see [LICENSE](LICENSE).
