import { DatabaseUnavailableError, deviceExists } from "@/lib/db";
import { getDevice, persistDevice } from "@/lib/device";

/**
 * Read or adopt the recovery code for this browser's shelf.
 *
 * The shelf is keyed by an id in an httpOnly cookie, so clearing cookies leaves
 * the rows in Postgres with no way to reach them. Surfacing the id as a code the
 * user can write down turns that unrecoverable loss into a paste.
 *
 * The tradeoff, stated plainly: anyone holding the code gets that shelf. The id
 * is a v4 UUID (122 bits of randomness), so guessing one is not a concern, and
 * what it guards is a list of Flash games — no personal data, nothing sensitive.
 * That is the only reason exposing an httpOnly value is acceptable here.
 */
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const device = await getDevice();
  if (device.isNew) await persistDevice(device.id);
  return Response.json({ code: device.id });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = (body as Record<string, unknown>)?.code;
  if (typeof code !== "string" || !UUID_PATTERN.test(code.trim())) {
    return Response.json(
      { error: "That doesn't look like a recovery code." },
      { status: 400 }
    );
  }

  const id = code.trim().toLowerCase();

  try {
    if (!(await deviceExists(id))) {
      return Response.json(
        { error: "No shelf found for that code." },
        { status: 404 }
      );
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    }
    return Response.json({ error: "Could not check that code" }, { status: 500 });
  }

  await persistDevice(id);
  return Response.json({ adopted: true });
}
