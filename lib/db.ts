import "server-only";

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Durable storage for a visitor's shelf and their in-game progress.
 *
 * Everything used to live in localStorage, which is lost whenever the browser
 * clears site data for the origin — so a shelf could vanish between visits
 * through no fault of the app. The browser copy is still the fast path; this is
 * the copy that survives.
 *
 * SQLite via node:sqlite: a built-in, so there is no native module to compile,
 * and the whole store is a single file that can be deleted to reset.
 */

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "arcade.db");

let db: DatabaseSync | null = null;

function connect(): DatabaseSync {
  if (db) return db;

  mkdirSync(DB_DIR, { recursive: true });
  const connection = new DatabaseSync(DB_PATH);

  // WAL lets reads proceed during writes, which matters because every page
  // load reads the shelf while gameplay may be writing a save.
  connection.exec("PRAGMA journal_mode = WAL");
  connection.exec("PRAGMA foreign_keys = ON");

  connection.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id            TEXT PRIMARY KEY,
      created_at    INTEGER NOT NULL,
      last_seen_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shelf_entries (
      device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK (kind IN ('favorite', 'recent')),
      identifier  TEXT NOT NULL,
      title       TEXT NOT NULL,
      played_at   INTEGER,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (device_id, kind, identifier)
    );

    -- Every read is "this device, this kind, newest first".
    CREATE INDEX IF NOT EXISTS idx_shelf_lookup
      ON shelf_entries (device_id, kind, updated_at DESC);

    CREATE TABLE IF NOT EXISTS game_saves (
      device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      save_key    TEXT NOT NULL,
      payload     TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (device_id, save_key)
    );

    CREATE INDEX IF NOT EXISTS idx_saves_device
      ON game_saves (device_id, updated_at DESC);
  `);

  db = connection;
  return db;
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

export function touchDevice(deviceId: string): void {
  const now = Date.now();
  connect()
    .prepare(
      `INSERT INTO devices (id, created_at, last_seen_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    )
    .run(deviceId, now, now);
}

function readKind(deviceId: string, kind: "favorite" | "recent"): ShelfEntryRow[] {
  const rows = connect()
    .prepare(
      `SELECT identifier, title, played_at FROM shelf_entries
       WHERE device_id = ? AND kind = ?
       ORDER BY updated_at DESC`
    )
    .all(deviceId, kind) as {
    identifier: string;
    title: string;
    played_at: number | null;
  }[];

  return rows.map((row) => ({
    identifier: row.identifier,
    title: row.title,
    ...(row.played_at != null ? { playedAt: row.played_at } : {}),
  }));
}

export function readShelf(deviceId: string): ShelfState {
  return {
    favorites: readKind(deviceId, "favorite"),
    recents: readKind(deviceId, "recent"),
  };
}

/**
 * Replaces a device's shelf wholesale. The client sends the merged result of
 * server + local state, so a partial update would risk resurrecting entries the
 * user just removed.
 */
export function writeShelf(deviceId: string, state: ShelfState): void {
  const connection = connect();
  touchDevice(deviceId);

  const wipe = connection.prepare(
    "DELETE FROM shelf_entries WHERE device_id = ? AND kind = ?"
  );
  const insert = connection.prepare(
    `INSERT INTO shelf_entries
       (device_id, kind, identifier, title, played_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(device_id, kind, identifier) DO UPDATE SET
       title = excluded.title,
       played_at = excluded.played_at,
       updated_at = excluded.updated_at`
  );

  // One transaction: a crash mid-write must not leave a half-erased shelf.
  connection.exec("BEGIN IMMEDIATE");
  try {
    for (const [kind, entries] of [
      ["favorite", state.favorites],
      ["recent", state.recents],
    ] as const) {
      wipe.run(deviceId, kind);
      // Ordering is by updated_at DESC on read, so count downwards to preserve
      // the order the client sent rather than collapsing to one timestamp.
      let rank = entries.length;
      for (const entry of entries) {
        insert.run(
          deviceId,
          kind,
          entry.identifier,
          entry.title,
          entry.playedAt ?? null,
          rank
        );
        rank -= 1;
      }
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

export function readSaves(deviceId: string): Record<string, string> {
  const rows = connect()
    .prepare("SELECT save_key, payload FROM game_saves WHERE device_id = ?")
    .all(deviceId) as { save_key: string; payload: string }[];

  return Object.fromEntries(rows.map((row) => [row.save_key, row.payload]));
}

/** Upsert only — saves are never wiped wholesale, since each key is a game. */
export function writeSaves(deviceId: string, saves: Record<string, string>): number {
  const connection = connect();
  touchDevice(deviceId);

  const upsert = connection.prepare(
    `INSERT INTO game_saves (device_id, save_key, payload, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(device_id, save_key) DO UPDATE SET
       payload = excluded.payload,
       updated_at = excluded.updated_at`
  );

  const now = Date.now();
  let written = 0;
  connection.exec("BEGIN IMMEDIATE");
  try {
    for (const [key, payload] of Object.entries(saves)) {
      upsert.run(deviceId, key, payload, now);
      written += 1;
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  return written;
}
