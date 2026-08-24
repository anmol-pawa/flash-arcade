-- Schema for the shelf and game-save store.
--
-- Applied idempotently on first connection (see lib/db.ts). Small enough that a
-- migration tool would be ceremony; every statement is IF NOT EXISTS so running
-- it repeatedly is a no-op.

CREATE TABLE IF NOT EXISTS devices (
    id            UUID        PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shelf_entries (
    device_id   UUID        NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    -- CHECK rather than an ENUM type: only two values, and a CHECK is far
    -- cheaper to change later than ALTER TYPE on an enum in use.
    kind        TEXT        NOT NULL CHECK (kind IN ('favorite', 'recent')),
    identifier  TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    played_at   TIMESTAMPTZ,
    -- Explicit ordering column. Ordering by updated_at would conflate "when the
    -- row was written" with "where the user put it".
    position    INTEGER     NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (device_id, kind, identifier)
);

-- Every read is exactly: this device, this kind, in display order. Covering the
-- ordering column lets that come straight off the index.
CREATE INDEX IF NOT EXISTS shelf_entries_lookup_idx
    ON shelf_entries (device_id, kind, position DESC);

CREATE TABLE IF NOT EXISTS game_saves (
    device_id   UUID        NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    save_key    TEXT        NOT NULL,
    payload     TEXT        NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (device_id, save_key)
);

CREATE INDEX IF NOT EXISTS game_saves_device_idx
    ON game_saves (device_id, updated_at DESC);
