"use client";
import { useEffect, useSyncExternalStore } from "react";
/**
 * Main-thread handle to the database worker: request/response over
 * postMessage, a watchdog that restarts the worker when a query runs too long
 * (e.g. an accidental Cartesian product), and a boot-status signal for the UI.
 */
import type { Dialect } from "../dialect/lint";
import type { ResultSet, RunResult, SqlError, Verdict } from "./engine";
import type { Envelope, Reply, Request, Response } from "./protocol";

export type DbStatus = "booting" | "ready" | "error";

const TIMEOUT_MS = 8000;

class SqlClient {
  private worker: Worker | null = null;
  private seq = 1;
  private pending = new Map<number, { resolve: (r: Response) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private listeners = new Set<(s: DbStatus) => void>();
  status: DbStatus = "booting";
  bootError = "";

  private spawn() {
    this.setStatus("booting");
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<Reply>) => {
      const { id, ok, data, error } = ev.data;
      if (id === 0) {
        this.bootError = error ?? "";
        if (!ok) console.error("[query-clash] database failed to boot:", error);
        this.setStatus(ok ? "ready" : "error");
        return;
      }
      const p = this.pending.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(id);
      if (ok) p.resolve(data as Response);
      else p.reject(new Error(error));
    };
    w.onerror = (e) => {
      this.bootError = e.message;
      console.error("[query-clash] worker error:", e.message);
      this.setStatus("error");
    };
    this.worker = w;
  }

  private ensure(): Worker {
    if (!this.worker) this.spawn();
    return this.worker!;
  }

  /** Start booting early (e.g. on the title screen) so the first battle is instant. */
  warmup() {
    this.ensure();
  }

  private setStatus(s: DbStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  subscribe(fn: (s: DbStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private call<T extends Response>(req: Request): Promise<T> {
    const w = this.ensure();
    const id = this.seq++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // Kill the stuck worker and boot a fresh database.
        w.terminate();
        this.worker = null;
        this.pending.forEach((p) => {
          clearTimeout(p.timer);
          p.reject(new Error("worker restarted"));
        });
        this.pending.clear();
        this.spawn();
        reject(new TimeoutError());
      }, TIMEOUT_MS + (this.status === "ready" ? 0 : 30000));
      this.pending.set(id, { resolve: resolve as (r: Response) => void, reject, timer });
      w.postMessage({ id, req } satisfies Envelope);
    });
  }

  async run(sql: string, dialect: Dialect): Promise<RunResult> {
    try {
      return await this.call<RunResult>({ type: "run", sql, dialect });
    } catch (e) {
      return { ok: false, error: toSqlError(e), notes: [], ms: TIMEOUT_MS };
    }
  }

  async evaluate(missionId: string, sql: string, dialect: Dialect): Promise<Verdict> {
    try {
      return await this.call<Verdict>({ type: "evaluate", missionId, sql, dialect });
    } catch (e) {
      return { run: { ok: false, error: toSqlError(e), notes: [], ms: TIMEOUT_MS }, correct: false };
    }
  }

  expected(missionId: string, dialect: Dialect): Promise<ResultSet | null> {
    return this.call<ResultSet | null>({ type: "expected", missionId, dialect });
  }

  reset(): Promise<unknown> {
    return this.call({ type: "reset" });
  }
}

class TimeoutError extends Error {
  constructor() {
    super("timeout");
  }
}

function toSqlError(e: unknown): SqlError {
  if (e instanceof TimeoutError) {
    return {
      code: "57014",
      message: `Query cancelled after ${TIMEOUT_MS / 1000}s`,
      title: "Spell fizzled — too slow",
      explain: "The query ran too long and was cancelled. Look for a missing join condition (a Cartesian product) or a recursive CTE with no stop condition. The database was restored.",
      oracle: "ORA-01013: user requested cancel of current operation",
      mismatch: [],
    };
  }
  return { message: e instanceof Error ? e.message : String(e), title: "Engine error", explain: "The database engine hit an internal error. Try again.", mismatch: [] };
}

let client: SqlClient | null = null;
export function sqlClient(): SqlClient {
  if (!client) client = new SqlClient();
  return client;
}

/** Subscribe to the engine's boot status (and start booting it). */
export function useDbStatus(): DbStatus {
  useEffect(() => sqlClient().warmup(), []);
  return useSyncExternalStore(
    (cb) => sqlClient().subscribe(cb),
    () => sqlClient().status,
    () => "booting",
  );
}
