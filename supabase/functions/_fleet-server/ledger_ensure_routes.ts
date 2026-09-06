/**
 * POST /ledger/ensure-from-trip-ids (+ /import) — idempotent canonical fare backfill.
 * Extracted from index.tsx for a lighter split (A-7).
 */
import type { Context, Hono, Next } from "npm:hono";
import * as kv from "./kv_store.tsx";
import {
  requireAuth,
  hasPermission,
  type RbacUser,
} from "./rbac_middleware.ts";
import { appendCanonicalLedgerEvents } from "./ledger_canonical.ts";
import { buildCanonicalTripFareEventsFromTrip } from "./canonical_from_ops.ts";

const PREFIX = "/make-server-37f42386";

function isCompletedTripStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s.includes("cancel") || s.includes("fail")) return false;
  return s.includes("complet") || s === "complete";
}

function isUberPlatform(platform: unknown): boolean {
  const p = String(platform ?? "").trim().toLowerCase();
  return p === "uber" || p.startsWith("uber ");
}

function coerceAmount(amount: unknown): number {
  const n = Number(amount);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Same eligibility as GET /ledger/driver-overview completeness:
 * completed trip with amount > 0, or Uber with positive fare/tip/prior components.
 */
export function tripHasMoneyForLedgerProjection(trip: any): boolean {
  if (!isCompletedTripStatus(trip?.status)) return false;
  const amt = coerceAmount(trip?.amount);
  const hasTripAmount = amt > 0;
  if (!isUberPlatform(trip?.platform)) return hasTripAmount;
  const uberGrossForLedger =
    coerceAmount(trip?.uberFareComponents) +
    coerceAmount(trip?.uberTips) +
    coerceAmount(trip?.uberPriorPeriodAdjustment);
  return hasTripAmount || uberGrossForLedger > 0;
}

/**
 * Import pipeline gate: Authorization Bearer must be the project anon or service role key.
 * Mirrors the "key-checked" internal import pattern — not session RBAC.
 */
export function requireImportAnonOrServiceKey() {
  return async (c: Context, next: Next) => {
    const auth = c.req.header("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
    const service = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!token || (!anon && !service) || (token !== anon && token !== service)) {
      return c.json(
        {
          error: "Unauthorized",
          message: "POST /ledger/ensure-from-trip-ids/import requires the project anon or service role key.",
        },
        401,
      );
    }
    return await next();
  };
}

async function handleEnsureFromTripIds(c: Context) {
  const startMs = Date.now();
  try {
    const body = (c.get("__cachedRequestBody") as unknown) ?? (await c.req.json());
    const rawIds: unknown = (body as any)?.tripIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return c.json({ error: "Body must include non-empty tripIds: string[]" }, 400);
    }
    const tripIds = [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))];
    if (tripIds.length > 12_000) {
      return c.json({ error: "Max 12000 trip ids per request — split the import batch" }, 400);
    }

    const stats = {
      tripIdsRequested: tripIds.length,
      tripsLoaded: 0,
      skippedNoMoney: 0,
      ledgerRowsWritten: 0,
      unresolvedAfterGenerate: 0,
      errors: 0,
    };

    const CHUNK = 100;
    for (let i = 0; i < tripIds.length; i += CHUNK) {
      const chunk = tripIds.slice(i, i + CHUNK);
      const keys = chunk.map((id) => `trip:${id}`);
      let values: any[] = [];
      try {
        const got = await kv.mget(keys);
        values = Array.isArray(got) ? got.filter(Boolean) : [];
      } catch (e) {
        console.warn("[Ledger EnsureTripIds] mget failed, falling back to per-key get:", e);
        for (const key of keys) {
          try {
            const v = await kv.get(key);
            if (v) values.push(v);
          } catch {
            /* skip */
          }
        }
      }
      stats.tripsLoaded += values.length;

      const toAppend: Record<string, unknown>[] = [];
      for (const trip of values) {
        if (!trip?.id) continue;
        if (!tripHasMoneyForLedgerProjection(trip)) {
          stats.skippedNoMoney += 1;
          continue;
        }
        const evs = buildCanonicalTripFareEventsFromTrip(trip as Record<string, unknown>);
        if (evs.length === 0) {
          stats.unresolvedAfterGenerate += 1;
        } else {
          toAppend.push(...evs);
        }
      }
      const MAX = 200;
      for (let j = 0; j < toAppend.length; j += MAX) {
        const slice = toAppend.slice(j, j + MAX);
        try {
          const r = await appendCanonicalLedgerEvents(slice, c);
          stats.ledgerRowsWritten += r.inserted;
        } catch (loopErr: any) {
          stats.errors += 1;
          console.error(`[Ledger EnsureTripIds] canonical append:`, loopErr?.message || loopErr);
        }
      }
    }

    const durationMs = Date.now() - startMs;
    console.log(
      `[Ledger EnsureTripIds] OK — requested=${stats.tripIdsRequested} loaded=${stats.tripsLoaded} rows=${stats.ledgerRowsWritten} skipped=${stats.skippedNoMoney} unresolved=${stats.unresolvedAfterGenerate} errors=${stats.errors} (${durationMs}ms)`,
    );
    return c.json({ success: true, stats, durationMs });
  } catch (e: any) {
    console.error("[Ledger EnsureTripIds] Fatal:", e);
    return c.json({ error: e?.message || "ensure-from-trip-ids failed" }, 500);
  }
}

export function registerLedgerEnsureRoutes(app: Hono) {
  // Repair Now (fleet UI): requireAuth + data.backfill OR transactions.edit.
  app.post(`${PREFIX}/ledger/ensure-from-trip-ids`, requireAuth(), async (c) => {
    const rbacUser = c.get("rbacUser") as RbacUser | undefined;
    const allowed =
      !!rbacUser &&
      (hasPermission(rbacUser.resolvedRole, "data.backfill") ||
        hasPermission(rbacUser.resolvedRole, "transactions.edit"));
    if (!allowed) {
      return c.json(
        {
          error: "Forbidden",
          message:
            'Repairing ledger from trip ids requires "data.backfill" or "transactions.edit".',
          required: ["data.backfill", "transactions.edit"],
          currentRole: rbacUser?.resolvedRole || "(none)",
        },
        403,
      );
    }
    return handleEnsureFromTripIds(c);
  });

  // Import callers (admin/driver anon or service key) — key-checked, not session RBAC.
  app.post(
    `${PREFIX}/ledger/ensure-from-trip-ids/import`,
    requireImportAnonOrServiceKey(),
    async (c) => handleEnsureFromTripIds(c),
  );
}
