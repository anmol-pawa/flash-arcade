import { getDevice, persistDevice } from "@/lib/device";
import { readShelf, writeShelf, type ShelfEntryRow } from "@/lib/db";

/** Reads and writes the caller's own device row, so never cache it. */
export const dynamic = "force-dynamic";

const MAX_ENTRIES = 200;
const MAX_TITLE = 300;

/** Never trust the client's payload shape — this is a public endpoint. */
function sanitize(value: unknown): ShelfEntryRow[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const out: ShelfEntryRow[] = [];

  for (const raw of value.slice(0, MAX_ENTRIES)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const identifier = entry.identifier;
    const title = entry.title;
    if (typeof identifier !== "string" || !identifier) continue;
    // Archive identifiers only, matching the asset proxy's own rule.
    if (!/^[A-Za-z0-9._-]+$/.test(identifier)) continue;
    if (seen.has(identifier)) continue;
    seen.add(identifier);

    const playedAt = entry.playedAt;
    out.push({
      identifier,
      title: typeof title === "string" ? title.slice(0, MAX_TITLE) : identifier,
      ...(typeof playedAt === "number" && Number.isFinite(playedAt)
        ? { playedAt }
        : {}),
    });
  }

  return out;
}

export async function GET() {
  const device = await getDevice();
  if (device.isNew) {
    await persistDevice(device.id);
    return Response.json({ favorites: [], recents: [] });
  }
  return Response.json(readShelf(device.id));
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const device = await getDevice();
  if (device.isNew) await persistDevice(device.id);

  const state = {
    favorites: sanitize(payload.favorites),
    recents: sanitize(payload.recents),
  };

  try {
    writeShelf(device.id, state);
  } catch {
    return Response.json({ error: "Could not save shelf" }, { status: 500 });
  }

  return Response.json({
    saved: true,
    favorites: state.favorites.length,
    recents: state.recents.length,
  });
}
