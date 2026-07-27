import { getGame, proxyAssetUrl, proxyBaseUrl } from "@/lib/archive";

/**
 * Resolved detail for one Archive item: which SWF to play and the same-origin
 * URLs the emulator should use. Keeps SWF resolution in one place rather than
 * duplicating the file-picking rules on the client.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/game/[identifier]">
) {
  const { identifier } = await ctx.params;

  let lookup;
  try {
    lookup = await getGame(identifier);
  } catch {
    return Response.json({ error: "Archive lookup failed" }, { status: 502 });
  }

  if (lookup.status === "missing") {
    return Response.json({ error: "No such Archive item" }, { status: 404 });
  }

  if (lookup.status === "no-swf") {
    return Response.json(
      { error: "This Archive item contains no playable SWF", title: lookup.title },
      { status: 404 }
    );
  }

  const { game } = lookup;

  return Response.json(
    {
      ...game,
      playUrl: proxyAssetUrl(game.identifier, game.swfFilename),
      playBaseUrl: proxyBaseUrl(game.identifier),
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
