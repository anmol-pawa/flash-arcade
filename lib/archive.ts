/**
 * Client for the Internet Archive's public APIs.
 *
 * The Archive preserves the Flash era in two collections we care about:
 *   - softwarelibrary_flash_games  (~6.5k playable games)
 *   - softwarelibrary_flash        (animations + toys, superset)
 *
 * We never rehost SWFs; every byte is streamed from archive.org.
 */

export const FLASH_GAMES_COLLECTION = "softwarelibrary_flash_games";

const SEARCH_ENDPOINT = "https://archive.org/advancedsearch.php";
const METADATA_ENDPOINT = "https://archive.org/metadata";
const DOWNLOAD_ENDPOINT = "https://archive.org/download";

/** Thumbnail served straight from archive.org — no proxying needed. */
export function coverUrl(identifier: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

export function detailsUrl(identifier: string): string {
  return `https://archive.org/details/${encodeURIComponent(identifier)}`;
}

/**
 * archive.org serves SWFs without `Access-Control-Allow-Origin`, so the browser
 * cannot fetch them directly — Ruffle's load would fail CORS. Everything the
 * player touches is therefore routed through our own same-origin proxy.
 */
export function proxyAssetUrl(identifier: string, filename: string): string {
  const path = filename.split("/").map(encodeURIComponent).join("/");
  return `/api/asset/${encodeURIComponent(identifier)}/${path}`;
}

/** Trailing-slash directory used as Ruffle's `base` for sibling asset loads. */
export function proxyBaseUrl(identifier: string): string {
  return `/api/asset/${encodeURIComponent(identifier)}/`;
}

export interface GameSummary {
  identifier: string;
  title: string;
  description?: string;
  year?: string;
  creator?: string;
  downloads: number;
}

export interface SearchResult {
  games: GameSummary[];
  total: number;
  page: number;
  /** True when more pages remain — drives infinite scroll. */
  hasMore: boolean;
}

export type SortKey = "popular" | "title" | "recent";

const SORT_CLAUSES: Record<SortKey, string> = {
  popular: "downloads desc",
  title: "titleSorter asc",
  recent: "addeddate desc",
};

/**
 * Escape Lucene syntax so a user typing `sonic: the "best"` can't break the
 * query or inject clauses into the collection filter.
 */
function escapeLucene(input: string): string {
  return input.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1").trim();
}

function buildQuery(search: string): string {
  const base = `collection:${FLASH_GAMES_COLLECTION}`;
  const term = escapeLucene(search);
  if (!term) return base;
  // Match the term across title/description/creator rather than the whole doc,
  // which keeps results relevant instead of matching boilerplate metadata.
  return `${base} AND (title:(${term}) OR description:(${term}) OR creator:(${term}))`;
}

/** Archive returns numeric fields inconsistently (number | string | array). */
function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0] != null ? String(value[0]) : undefined;
  if (value == null) return undefined;
  return String(value);
}

function toNumber(value: unknown): number {
  const parsed = Number(firstValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

interface RawDoc {
  identifier?: string;
  title?: unknown;
  description?: unknown;
  year?: unknown;
  creator?: unknown;
  downloads?: unknown;
}

function normalizeDoc(doc: RawDoc): GameSummary | null {
  if (!doc.identifier) return null;
  return {
    identifier: doc.identifier,
    title: firstValue(doc.title) ?? doc.identifier,
    description: firstValue(doc.description),
    year: firstValue(doc.year),
    creator: firstValue(doc.creator),
    downloads: toNumber(doc.downloads),
  };
}

export async function searchGames(options: {
  search?: string;
  page?: number;
  rows?: number;
  sort?: SortKey;
  signal?: AbortSignal;
}): Promise<SearchResult> {
  const { search = "", page = 1, rows = 48, sort = "popular", signal } = options;

  const params = new URLSearchParams();
  params.set("q", buildQuery(search));
  for (const field of ["identifier", "title", "description", "year", "creator", "downloads"]) {
    params.append("fl[]", field);
  }
  params.append("sort[]", SORT_CLAUSES[sort] ?? SORT_CLAUSES.popular);
  params.set("rows", String(rows));
  params.set("page", String(page));
  params.set("output", "json");

  const res = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Archive search failed (${res.status})`);
  }

  const json = (await res.json()) as {
    response?: { numFound?: number; docs?: RawDoc[] };
  };

  const docs = json.response?.docs ?? [];
  const games = docs.map(normalizeDoc).filter((g): g is GameSummary => g !== null);
  const total = json.response?.numFound ?? 0;

  return {
    games,
    total,
    page,
    hasMore: page * rows < total && games.length > 0,
  };
}

export interface GameDetail extends GameSummary {
  /** Absolute archive.org URL of the SWF itself. */
  swfUrl: string;
  /** Directory the SWF lives in — Ruffle's `base` for sibling asset loads. */
  baseUrl: string;
  swfFilename: string;
  /** Native stage size from the Archive's SWF probe, when available. */
  width?: number;
  height?: number;
}

interface RawFile {
  name?: string;
  size?: string | number;
  format?: string;
  width?: string | number;
  height?: string | number;
}

/**
 * The Archive's SWF dimension probe is frequently wrong — it reports 133×22 for
 * Bloxorz, whose real stage is 550×300. Accept a hint only when it could
 * plausibly be a game stage; it is used purely to avoid a layout jump on first
 * paint, and the player replaces it with Ruffle's SWF-header metadata on load.
 */
function plausibleStage(width: number, height: number): boolean {
  if (width < 120 || height < 120) return false;
  if (width > 4000 || height > 4000) return false;
  const ratio = width / height;
  return ratio >= 0.25 && ratio <= 5;
}

/**
 * Pick the SWF to play. Items sometimes ship several (a loader stub plus the
 * real movie, or localized variants); the largest is reliably the main game.
 */
function pickSwf(files: RawFile[]): RawFile | undefined {
  const swfs = files.filter((f) => typeof f.name === "string" && /\.swf$/i.test(f.name));
  if (swfs.length === 0) return undefined;
  return swfs.reduce((largest, current) =>
    Number(current.size ?? 0) > Number(largest.size ?? 0) ? current : largest
  );
}

/**
 * Outcome of resolving an item. "no-swf" is distinct from "missing" because it
 * genuinely happens — some items in the games collection hold only screenshots
 * or notes — and it deserves a better explanation than a bare 404.
 */
export type GameLookup =
  | { status: "ok"; game: GameDetail }
  | { status: "no-swf"; title: string }
  | { status: "missing" };

export async function getGame(
  identifier: string,
  signal?: AbortSignal
): Promise<GameLookup> {
  const res = await fetch(`${METADATA_ENDPOINT}/${encodeURIComponent(identifier)}`, {
    signal,
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return { status: "missing" };

  const json = (await res.json()) as {
    metadata?: RawDoc & { addeddate?: unknown };
    files?: RawFile[];
    // Archive returns `{}` for unknown identifiers.
  };

  if (!json.metadata) return { status: "missing" };

  const summary = normalizeDoc({ ...json.metadata, identifier });

  const swf = pickSwf(json.files ?? []);
  if (!swf?.name) {
    return { status: "no-swf", title: summary?.title ?? identifier };
  }

  const dir = `${DOWNLOAD_ENDPOINT}/${encodeURIComponent(identifier)}`;

  const game: GameDetail = {
    identifier,
    title: summary?.title ?? identifier,
    description: summary?.description,
    year: summary?.year,
    creator: summary?.creator,
    downloads: summary?.downloads ?? 0,
    swfFilename: swf.name,
    // Filenames commonly contain spaces ("Bomb It 1.swf"), so encode them.
    swfUrl: `${dir}/${encodeURIComponent(swf.name)}`,
    baseUrl: `${dir}/`,
    ...stageHint(toNumber(swf.width), toNumber(swf.height)),
  };

  return { status: "ok", game };
}

function stageHint(width: number, height: number): { width?: number; height?: number } {
  return plausibleStage(width, height) ? { width, height } : {};
}
