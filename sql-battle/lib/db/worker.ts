/// <reference lib="webworker" />
/**
 * Web Worker hosting PGlite (PostgreSQL compiled to WebAssembly). Running the
 * database off the main thread keeps the battle animations at 60fps while
 * queries execute, and lets the client kill a runaway query by terminating
 * the worker.
 */
import type { PGlite } from "@electric-sql/pglite";
import { ALL_MISSIONS } from "@/content/chapters";
import { evaluate, expectedFor, resetDatabase, runScript } from "./engine";
import type { Envelope, Reply, Response } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

/**
 * PGlite is served unbundled from <base>/pglite (see scripts/copy-pglite.mjs).
 * The base path comes from this worker's own URL (…/<base>/_next/static/…),
 * so the same build works at the site root or under a sub-path such as
 * GitHub Pages' /<repo>/.
 */
const BASE = self.location.pathname.split("/_next/")[0];
const PGLITE_URL = `${BASE}/pglite/index.js`;

async function boot(): Promise<PGlite> {
  const mod: typeof import("@electric-sql/pglite") = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PGLITE_URL);
  const db = await mod.PGlite.create();
  await resetDatabase(db);
  return db;
}

const ready = boot();
ready.then(
  () => self.postMessage({ id: 0, ok: true }),
  (e) => self.postMessage({ id: 0, ok: false, error: String(e) }),
);

function mission(id: string) {
  const m = ALL_MISSIONS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown mission ${id}`);
  return m;
}

self.onmessage = async (ev: MessageEvent<Envelope>) => {
  const { id, req } = ev.data;
  let reply: Reply;
  try {
    const db = await ready;
    let data: Response;
    switch (req.type) {
      case "run":
        data = await runScript(db, req.sql, req.dialect);
        break;
      case "evaluate":
        data = await evaluate(db, mission(req.missionId), req.sql, req.dialect);
        break;
      case "expected":
        data = await expectedFor(db, mission(req.missionId), req.dialect);
        break;
      case "reset":
        await resetDatabase(db);
        data = { ok: true };
        break;
    }
    reply = { id, ok: true, data };
  } catch (e) {
    reply = { id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  self.postMessage(reply);
};
