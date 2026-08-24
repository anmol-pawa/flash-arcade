import { getDevice, persistDevice } from "@/lib/device";
import { readSaves, writeSaves } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Ruffle keys saves as `{hostname}/{swf dir}/{save name}`. */
const SAVE_KEY_PATTERN = /^[A-Za-z0-9._:\-]+(?:\/[^/]{1,120}){1,8}$/;
const MAX_KEYS = 300;
/** SharedObjects are small; a megabyte is already far beyond any real save. */
const MAX_PAYLOAD = 1_000_000;

export async function GET() {
  const device = await getDevice();
  if (device.isNew) {
    await persistDevice(device.id);
    return Response.json({ saves: {} });
  }
  return Response.json({ saves: readSaves(device.id) });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const incoming = (body as Record<string, unknown>)?.saves;
  if (typeof incoming !== "object" || incoming === null) {
    return Response.json({ error: "Expected a saves object" }, { status: 400 });
  }

  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming).slice(0, MAX_KEYS)) {
    if (typeof value !== "string") continue;
    if (value.length > MAX_PAYLOAD) continue;
    if (!SAVE_KEY_PATTERN.test(key)) continue;
    clean[key] = value;
  }

  const device = await getDevice();
  if (device.isNew) await persistDevice(device.id);

  try {
    const written = writeSaves(device.id, clean);
    return Response.json({ saved: true, keys: written });
  } catch {
    return Response.json({ error: "Could not save progress" }, { status: 500 });
  }
}
