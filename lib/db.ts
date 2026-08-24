import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

/**
 * Postgres store for a visitor's shelf and in-game progress.
 *
 * The database is an enhancement, not a hard dependency: if it is unreachable
 * the app still runs perfectly well on the browser's own localStorage, just
 * without anything surviving a storage clear. That is why every entry point
 * throws a typed error the routes turn into a 503, rather than crashing the
 * request — someone who only wants to play a game should not be blocked because
 * Docker happens to be stopped.
 */

export class DatabaseUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("The database is not reachable.");
    this.name = "DatabaseUnavailableError";
    this.cause = cause;
  }
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseUnavailableError("DATABASE_URL is not set");

  pool = new Pool({
    connectionString,
    // Small: this is a single local app, and an oversized pool just moves
    // contention from the app into Postgres' connection slots.
    max: 10,
    idleTimeoutMillis: 30_000,
    // Fail fast rather than leaving a request hanging when Docker is stopped.
    connectionTimeoutMillis: 4_000,
  });

  // A pool that emits an unhandled 'error' takes the process down. Idle backend
  // errors are expected (container restart) and must not be fatal.
  pool.on("error", () => {
    schemaReady = null;
  });

  return pool;
}

/** Applies the schema once per process; every statement is idempotent. */
async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
    await getPool().query(sql);
  })().catch((error) => {
    // Do not cache the failure: the next request should retry, so starting
    // Docker recovers the app without restarting it.
    schemaReady = null;
    throw new DatabaseUnavailableError(error);
  });

  return schemaReady;
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (error) {
    throw new DatabaseUnavailableError(error);
  }
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export interface ShelfEntryRow {
  identifier: string;
  title: string;
  playedAt?: number;
}

export interface ShelfState {
  favorites: ShelfEntryRow[];
  recents: ShelfEntryRow[];
}

async function touchDevice(client: PoolClient, deviceId: string): Promise<void> {
  await client.query(
    `INSERT INTO devices (id) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`,
    [deviceId]
  );
}

export async function readShelf(deviceId: string): Promise<ShelfState> {
  return withClient(async (client) => {
    const { rows } = await client.query<{
      kind: string;
      identifier: string;
      title: string;
      played_at: Date | null;
    }>(
      `SELECT kind, identifier, title, played_at
         FROM shelf_entries
        WHERE device_id = $1
        ORDER BY kind, position DESC`,
      [deviceId]
    );

    const state: ShelfState = { favorites: [], recents: [] };
    for (const row of rows) {
      const entry: ShelfEntryRow = {
        identifier: row.identifier,
        title: row.title,
        ...(row.played_at ? { playedAt: row.played_at.getTime() } : {}),
      };
      if (row.kind === "favorite") state.favorites.push(entry);
      else state.recents.push(entry);
    }
    return state;
  });
}

/**
 * Replaces a device's shelf wholesale. The client sends the merged result of
 * server + local state, so a partial update could resurrect entries the user
 * just removed.
 */
export async function writeShelf(deviceId: string, state: ShelfState): Promise<void> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await touchDevice(client, deviceId);

      for (const [kind, entries] of [
        ["favorite", state.favorites],
        ["recent", state.recents],
      ] as const) {
        await client.query(
          "DELETE FROM shelf_entries WHERE device_id = $1 AND kind = $2",
          [deviceId, kind]
        );
        if (entries.length === 0) continue;

        // One multi-row INSERT rather than a statement per entry: same
        // transaction either way, but a single round trip.
        const values: unknown[] = [deviceId, kind];
        const tuples = entries.map((entry, i) => {
          const base = i * 4 + 3;
          values.push(
            entry.identifier,
            entry.title,
            entry.playedAt != null ? new Date(entry.playedAt) : null,
            entries.length - i // position: preserves the order sent
          );
          return `($1, $2, $${base}, $${base + 1}, $${base + 2}, $${base + 3})`;
        });

        await client.query(
          `INSERT INTO shelf_entries
             (device_id, kind, identifier, title, played_at, position)
           VALUES ${tuples.join(", ")}
           ON CONFLICT (device_id, kind, identifier) DO UPDATE SET
             title      = EXCLUDED.title,
             played_at  = EXCLUDED.played_at,
             position   = EXCLUDED.position,
             updated_at = now()`,
          values
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

/**
 * Whether a device row exists. Used before adopting a recovery code, so a typo
 * fails loudly instead of silently stranding someone on a brand-new empty
 * identity that looks exactly like their shelf having been wiped.
 */
export async function deviceExists(deviceId: string): Promise<boolean> {
  return withClient(async (client) => {
    const { rowCount } = await client.query(
      "SELECT 1 FROM devices WHERE id = $1",
      [deviceId]
    );
    return (rowCount ?? 0) > 0;
  });
}

export async function readSaves(deviceId: string): Promise<Record<string, string>> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ save_key: string; payload: string }>(
      "SELECT save_key, payload FROM game_saves WHERE device_id = $1",
      [deviceId]
    );
    return Object.fromEntries(rows.map((row) => [row.save_key, row.payload]));
  });
}

/** Upsert only — saves are never wiped wholesale, since each key is a game. */
export async function writeSaves(
  deviceId: string,
  saves: Record<string, string>
): Promise<number> {
  const entries = Object.entries(saves);
  if (entries.length === 0) return 0;

  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await touchDevice(client, deviceId);

      const values: unknown[] = [deviceId];
      const tuples = entries.map(([key, payload], i) => {
        const base = i * 2 + 2;
        values.push(key, payload);
        return `($1, $${base}, $${base + 1})`;
      });

      await client.query(
        `INSERT INTO game_saves (device_id, save_key, payload)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (device_id, save_key) DO UPDATE SET
           payload    = EXCLUDED.payload,
           updated_at = now()`,
        values
      );

      await client.query("COMMIT");
      return entries.length;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}
