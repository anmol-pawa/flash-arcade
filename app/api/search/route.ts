import {
  DEFAULT_COLLECTION,
  isCollectionKey,
  isDecadeKey,
  isGenreKey,
  searchGames,
  type SortKey,
} from "@/lib/archive";

const VALID_SORTS: SortKey[] = ["popular", "title", "recent"];
const MAX_ROWS = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rows = Math.min(MAX_ROWS, Math.max(1, Number(searchParams.get("rows")) || 48));
  const sortParam = searchParams.get("sort") as SortKey | null;
  const sort = sortParam && VALID_SORTS.includes(sortParam) ? sortParam : "popular";

  // Unknown filter values are dropped rather than interpolated into the query.
  const collectionParam = searchParams.get("collection") ?? "";
  const collection = isCollectionKey(collectionParam)
    ? collectionParam
    : DEFAULT_COLLECTION;

  const genreParam = searchParams.get("genre") ?? "";
  const genre = isGenreKey(genreParam) ? genreParam : undefined;

  const decadeParam = searchParams.get("decade") ?? "";
  const decade = isDecadeKey(decadeParam) ? decadeParam : undefined;

  try {
    const result = await searchGames({
      search,
      page,
      rows,
      sort,
      collection,
      genre,
      decade,
    });
    return Response.json(result, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
