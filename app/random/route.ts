import { redirect } from "next/navigation";
import { getGame, searchGames } from "@/lib/archive";

/**
 * Sends the visitor to a random playable game.
 *
 * A plain GET redirect so it works as an ordinary link, with no client JS.
 * Must never be cached — a cached "surprise" is the same game every time.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
/** Items whose Archive entry holds no SWF exist, so candidates are verified. */
const MAX_CANDIDATES = 5;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function GET() {
  try {
    // One request to learn how deep the collection goes, so the random page is
    // drawn from the whole library rather than the first few hundred items.
    const probe = await searchGames({ collection: "games", rows: 1, page: 1 });
    const pages = Math.max(1, Math.ceil(probe.total / PAGE_SIZE));
    const page = 1 + Math.floor(Math.random() * pages);

    const result = await searchGames({
      collection: "games",
      rows: PAGE_SIZE,
      page,
      // Sorting by title keeps paging stable; popularity would bias the draw
      // toward whatever happens to be trending when the page is fetched.
      sort: "title",
    });

    for (const candidate of shuffle(result.games).slice(0, MAX_CANDIDATES)) {
      const lookup = await getGame(candidate.identifier);
      if (lookup.status === "ok") redirect(`/play/${candidate.identifier}`);
    }
  } catch (error) {
    // `redirect` throws a control-flow signal that must not be swallowed.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    // Anything else: fall through to the library rather than erroring out.
  }

  redirect("/");
}
