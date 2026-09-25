/**
 * Short-TTL request dedupe for toll reconciliation money POSTs.
 * Primary store: in-memory Map (edge isolate). Best-effort KV mirror when available.
 * Key shape: `toll_idempotency:{route}:{key}`
 */
import type { Context } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";

export const TOLL_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type IdempotencyRecord = {
  status: "in_progress" | "completed";
  expiresAt: number;
  httpStatus?: number;
  body?: unknown;
  startedAt: number;
  completedAt?: number;
};

const mem = new Map<string, IdempotencyRecord>();

function storageKey(route: string, key: string): string {
  return `toll_idempotency:${route}:${key}`;
}

function memGet(k: string, now: number): IdempotencyRecord | null {
  const hit = mem.get(k);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    mem.delete(k);
    return null;
  }
  return hit;
}

function memSet(k: string, rec: IdempotencyRecord): void {
  mem.set(k, rec);
}

function memDel(k: string): void {
  mem.delete(k);
}

async function kvGetSafe(k: string): Promise<IdempotencyRecord | null> {
  try {
    return ((await kv.get(k)) as IdempotencyRecord | null) ?? null;
  } catch {
    return null;
  }
}

async function kvSetSafe(k: string, rec: IdempotencyRecord): Promise<void> {
  try {
    await kv.set(k, rec);
  } catch {
    /* in-memory is enough for same-isolate retries */
  }
}

async function kvDelSafe(k: string): Promise<void> {
  try {
    await kv.del(k);
  } catch {
    /* ignore */
  }
}

/** Read Idempotency-Key header (case-insensitive via Hono). Empty → null. */
export function readIdempotencyKey(c: Context): string | null {
  const raw =
    c.req.header("Idempotency-Key") ||
    c.req.header("idempotency-key") ||
    "";
  const key = String(raw).trim();
  if (!key || key.length > 256) return null;
  return key;
}

/**
 * Begin or replay an idempotent POST.
 * - No key → proceed (caller runs handler normally).
 * - Fresh key → mark in_progress, return proceed.
 * - Completed unexpired → return replay.
 * - In-progress unexpired → return conflict.
 */
export async function beginTollIdempotency(
  route: string,
  key: string | null,
  now = Date.now(),
): Promise<
  | { mode: "skip" }
  | { mode: "proceed"; key: string }
  | { mode: "replay"; httpStatus: number; body: unknown }
  | { mode: "conflict" }
> {
  if (!key) return { mode: "skip" };
  const k = storageKey(route, key);

  let existing = memGet(k, now);
  if (!existing) {
    const fromKv = await kvGetSafe(k);
    if (fromKv && fromKv.expiresAt > now) {
      existing = fromKv;
      memSet(k, fromKv);
    }
  }

  if (existing && existing.expiresAt > now) {
    if (existing.status === "completed" && existing.body !== undefined) {
      return {
        mode: "replay",
        httpStatus: existing.httpStatus ?? 200,
        body: existing.body,
      };
    }
    if (existing.status === "in_progress") {
      return { mode: "conflict" };
    }
  }

  const rec: IdempotencyRecord = {
    status: "in_progress",
    expiresAt: now + TOLL_IDEMPOTENCY_TTL_MS,
    startedAt: now,
  };
  memSet(k, rec);
  await kvSetSafe(k, rec);
  return { mode: "proceed", key };
}

export async function completeTollIdempotency(
  route: string,
  key: string,
  httpStatus: number,
  body: unknown,
  now = Date.now(),
): Promise<void> {
  const k = storageKey(route, key);
  const rec: IdempotencyRecord = {
    status: "completed",
    expiresAt: now + TOLL_IDEMPOTENCY_TTL_MS,
    httpStatus,
    body,
    startedAt: now,
    completedAt: now,
  };
  memSet(k, rec);
  await kvSetSafe(k, rec);
}

/** Clear in_progress on failure so a retry with the same key can run. */
export async function abandonTollIdempotency(route: string, key: string): Promise<void> {
  const k = storageKey(route, key);
  memDel(k);
  await kvDelSafe(k);
}

/**
 * Wrap a JSON handler with optional Idempotency-Key dedupe.
 * Handler returns `{ status, body }` (status defaults 200).
 */
export async function withTollIdempotency(
  c: Context,
  route: string,
  run: () => Promise<{ status?: number; body: unknown }>,
): Promise<Response> {
  const key = readIdempotencyKey(c);
  const gate = await beginTollIdempotency(route, key);
  if (gate.mode === "replay") {
    return c.json(gate.body as any, gate.httpStatus as any);
  }
  if (gate.mode === "conflict") {
    return c.json(
      {
        error: "idempotency_in_progress",
        code: "IDEMPOTENCY_IN_PROGRESS",
        message: "A request with this Idempotency-Key is already in progress",
      },
      409,
    );
  }
  try {
    const result = await run();
    const status = result.status ?? 200;
    if (gate.mode === "proceed") {
      await completeTollIdempotency(route, gate.key, status, result.body);
    }
    return c.json(result.body as any, status as any);
  } catch (e) {
    if (gate.mode === "proceed") {
      await abandonTollIdempotency(route, gate.key);
    }
    throw e;
  }
}

/** Test-only: clear in-memory store. */
export function __resetTollIdempotencyMemForTests(): void {
  mem.clear();
}
