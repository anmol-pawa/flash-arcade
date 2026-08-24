import "server-only";

import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

/**
 * Anonymous per-browser identity for the shelf and saves.
 *
 * There are no accounts here and adding them for a public archive browser would
 * be disproportionate, so a device gets an opaque random id in an httpOnly
 * cookie. It identifies a browser, nothing about a person — no email, no
 * profile, and it is never exposed to page scripts.
 */

const COOKIE = "flash-arcade-device";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Opaque v4 UUIDs only; anything else is a forged or corrupted cookie. */
const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Device {
  id: string;
  /** True when a new id was minted and the caller must set the cookie. */
  isNew: boolean;
}

export async function getDevice(): Promise<Device> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;

  if (existing && DEVICE_ID_PATTERN.test(existing)) {
    return { id: existing, isNew: false };
  }

  return { id: randomUUID(), isNew: true };
}

/**
 * Route Handlers can set cookies; Server Components cannot, so the caller does
 * this explicitly rather than `getDevice` doing it invisibly.
 */
export async function persistDevice(id: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    // Not `secure`: this runs over plain http on localhost, where a secure
    // cookie would simply never be stored.
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}
