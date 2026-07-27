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

  let game;
  try {
    game = await getGame(identifier);
  } catch {
    return Response.json({ error: "Archive lookup failed" }, { status: 502 });
  }

  if (!game) {
    return Response.json(
      { error: "No playable SWF found for this item" },
      { status: 404 }
    );
  }

  return Response.json(
    {
      ...game,
      playUrl: proxyAssetUrl(game.identifier, game.swfFilename),
      playBaseUrl: proxyBaseUrl(game.identifier),
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
