/**
 * Phase 2 — Canonical ledger events (KV prefix `ledger_event:`).
 * Idempotency index: `ledger_event_idem:{sha256(idempotencyKey)}` → `{ id }`.
 */
import type { Context } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import { stampOrg } from "./org_scope.ts";

export const CANONICAL_SCHEMA_VERSION = 1;
export const CANONICAL_EVENT_KIND = "canonical";

const MAX_BATCH = 200;
const MAX_IDEMPOTENCY_KEY_LEN = 512;

/** Legacy + SSOT-oriented types allowed on canonical rows. */
const VALID_CANONICAL_EVENT_TYPES = new Set([
  "fare_earning",
  "tip",
  "prior_period_adjustment",
  "surge_bonus",
  "promotion",
  "refund_expense",
  "platform_fee",
  "fuel_expense",
  "toll_charge",
  "toll_refund",
  "adjustment",
  "other",
  "statement_line",
  "statement_adjustment",
  "payout_cash",
  "payout_bank",
  "toll_support_adjustment",
  "dispute_refund",
  "wallet_credit",
  "fuel_reimbursement",
  "toll_reconciled",
  "toll_unreconciled",
  "toll_approved",
  "toll_rejected",
]);

const VALID_DIRECTIONS = new Set(["inflow", "outflow", "neutral"]);

const VALID_SOURCE_TYPES = new Set(["trip", "statement", "import_batch", "transaction", "adjustment", "reconciliation"]);

async function sha256Hex(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function supabaseKv() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const LEDGER_DELETE_PAGE = 1000;
const SOURCE_ID_IN_CHUNK = 80;

/** Delete idempotency keys for distinct idempotencyKey strings (same hash as append). */
async function deleteIdemKeysForKeys(idempotencyKeys: string[]): Promise<number> {
  let n = 0;
  const seen = new Set<string>();
  for (const idem of idempotencyKeys) {
    const k = String(idem).trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    try {
      const idemKvKey = `ledger_event_idem:${await sha256Hex(k)}`;
      await kv.del(idemKvKey);
      n++;
    } catch {
      /* non-fatal */
    }
  }
  return n;
}

/**
 * Remove canonical `ledger_event:*` rows matching sourceType + sourceId, and their idempotency index keys.
 */
export async function deleteCanonicalLedgerBySource(
  sourceType: string,
  sourceIds: string[],
): Promise<{ deleted: number; idemDeleted: number }> {
  const ids = [...new Set(sourceIds.map((s) => String(s).trim()).filter(Boolean))];
  if (!ids.length || !VALID_SOURCE_TYPES.has(sourceType)) {
    return { deleted: 0, idemDeleted: 0 };
  }

  const sb = supabaseKv();
  const allRows: { key: string; value: Record<string, unknown> }[] = [];

  for (let i = 0; i < ids.length; i += SOURCE_ID_IN_CHUNK) {
    const chunk = ids.slice(i, i + SOURCE_ID_IN_CHUNK);
    let offset = 0;
    while (offset < 500_000) {
      const { data, error } = await sb
        .from("kv_store_37f42386")
        .select("key, value")
        .like("key", "ledger_event:%")
        .eq("value->>sourceType", sourceType)
        .in("value->>sourceId", chunk)
        .range(offset, offset + LEDGER_DELETE_PAGE - 1);
      if (error) throw error;
      const page = (data || []) as { key: string; value: Record<string, unknown> }[];
      allRows.push(...page);
      if (page.length < LEDGER_DELETE_PAGE) break;
      offset += LEDGER_DELETE_PAGE;
    }
  }

  if (allRows.length === 0) return { deleted: 0, idemDeleted: 0 };

  const idemKeys: string[] = [];
  for (const row of allRows) {
    const v = row.value;
    const idem = typeof v?.idempotencyKey === "string" ? String(v.idempotencyKey).trim() : "";
    if (idem) idemKeys.push(idem);
  }

  const keys = allRows.map((r) => r.key);
  for (let i = 0; i < keys.length; i += 100) {
    await kv.mdel(keys.slice(i, i + 100));
  }
  const idemDeleted = await deleteIdemKeysForKeys(idemKeys);
  console.log(
    `[CanonicalLedger] deleteCanonicalLedgerBySource type=${sourceType} ids=${ids.length} deleted=${keys.length} idem=${idemDeleted}`,
  );
  return { deleted: keys.length, idemDeleted };
}

/** Delete every canonical ledger row with the given sourceType (e.g. all trip fares when wiping trips). */
export async function deleteAllCanonicalLedgerBySourceType(
  sourceType: string,
): Promise<{ deleted: number; idemDeleted: number }> {
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    return { deleted: 0, idemDeleted: 0 };
  }

  const sb = supabaseKv();
  let totalDeleted = 0;
  let totalIdem = 0;

  while (true) {
    const { data, error } = await sb
      .from("kv_store_37f42386")
      .select("key, value")
      .like("key", "ledger_event:%")
      .eq("value->>sourceType", sourceType)
      .range(0, LEDGER_DELETE_PAGE - 1);
    if (error) throw error;
    const page = (data || []) as { key: string; value: Record<string, unknown> }[];
    if (page.length === 0) break;

    const idemKeys: string[] = [];
    for (const row of page) {
      const v = row.value;
      const idem = typeof v?.idempotencyKey === "string" ? String(v.idempotencyKey).trim() : "";
      if (idem) idemKeys.push(idem);
    }
    const keys = page.map((r) => r.key);
    for (let i = 0; i < keys.length; i += 100) {
      await kv.mdel(keys.slice(i, i + 100));
    }
    totalDeleted += keys.length;
    totalIdem += await deleteIdemKeysForKeys(idemKeys);
  }

  console.log(
    `[CanonicalLedger] deleteAllCanonicalLedgerBySourceType type=${sourceType} deleted=${totalDeleted} idem=${totalIdem}`,
  );
  return { deleted: totalDeleted, idemDeleted: totalIdem };
}

function validateOne(raw: unknown, index: number): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `Event ${index}: must be an object` };
  }
  const e = raw as Record<string, unknown>;

  const idem = typeof e.idempotencyKey === "string" ? e.idempotencyKey.trim() : "";
  if (!idem || idem.length > MAX_IDEMPOTENCY_KEY_LEN) {
    return { ok: false, error: `Event ${index}: idempotencyKey required, max ${MAX_IDEMPOTENCY_KEY_LEN} chars` };
  }

  const date = typeof e.date === "string" ? e.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: `Event ${index}: date must be YYYY-MM-DD` };
  }

  const driverId = typeof e.driverId === "string" ? e.driverId.trim() : "";
  if (!driverId) {
    return { ok: false, error: `Event ${index}: driverId required` };
  }

  const eventType = typeof e.eventType === "string" ? e.eventType.trim() : "";
  if (!eventType || !VALID_CANONICAL_EVENT_TYPES.has(eventType)) {
    return { ok: false, error: `Event ${index}: invalid eventType` };
  }

  const direction = typeof e.direction === "string" ? e.direction.trim() : "";
  if (!VALID_DIRECTIONS.has(direction)) {
    return { ok: false, error: `Event ${index}: direction must be inflow or outflow` };
  }

  const netAmount = Number(e.netAmount);
  if (!Number.isFinite(netAmount)) {
    return { ok: false, error: `Event ${index}: netAmount must be a finite number` };
  }

  const sourceType = typeof e.sourceType === "string" ? e.sourceType.trim() : "";
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    return { ok: false, error: `Event ${index}: invalid sourceType` };
  }

  const sourceId = typeof e.sourceId === "string" ? e.sourceId.trim() : "";
  if (!sourceId) {
    return { ok: false, error: `Event ${index}: sourceId required` };
  }

  let grossAmount = e.grossAmount !== undefined && e.grossAmount !== null ? Number(e.grossAmount) : NaN;
  if (!Number.isFinite(grossAmount)) {
    grossAmount = Math.abs(netAmount);
  }

  const currency = typeof e.currency === "string" && e.currency.trim() ? e.currency.trim() : "JMD";

  const out: Record<string, unknown> = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    eventKind: CANONICAL_EVENT_KIND,
    idempotencyKey: idem,
    date,
    driverId,
    eventType,
    direction,
    netAmount,
    grossAmount,
    currency,
    sourceType,
    sourceId,
  };

  if (typeof e.id === "string" && e.id.trim()) out.id = e.id.trim();
  if (typeof e.batchId === "string" && e.batchId.trim()) out.batchId = e.batchId.trim();
  if (typeof e.importerUserId === "string" && e.importerUserId.trim()) out.importerUserId = e.importerUserId.trim();
  if (typeof e.sourceFileHash === "string" && e.sourceFileHash.trim()) out.sourceFileHash = e.sourceFileHash.trim();
  if (typeof e.periodStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.periodStart)) out.periodStart = e.periodStart;
  if (typeof e.periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.periodEnd)) out.periodEnd = e.periodEnd;
  if (typeof e.platform === "string" && e.platform.trim()) out.platform = e.platform.trim();
  if (typeof e.vehicleId === "string" && e.vehicleId.trim()) out.vehicleId = e.vehicleId.trim();
  if (typeof e.category === "string" && e.category.trim()) out.category = e.category.trim();
  else out.category = eventType;
  if (typeof e.description === "string" && e.description.trim()) out.description = e.description.trim();
  if (typeof e.paymentMethod === "string" && e.paymentMethod.trim()) out.paymentMethod = e.paymentMethod.trim();
  if (e.isReconciled === true || e.isReconciled === false) out.isReconciled = e.isReconciled;
  else out.isReconciled = false;
  if (e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)) {
    out.metadata = e.metadata;
  }

  return { ok: true, value: out };
}

export type AppendCanonicalLedgerResult = {
  success: boolean;
  inserted: number;
  skipped: number;
  failed: number;
  details: Array<{
    index: number;
    idempotencyKey?: string;
    id?: string;
    error?: string;
    skipped?: boolean;
  }>;
};

/**
 * Idempotent append. Each event must include a unique idempotencyKey per logical fact.
 */
export async function appendCanonicalLedgerEvents(
  rawEvents: unknown[],
  c: Context,
): Promise<AppendCanonicalLedgerResult> {
  const details: AppendCanonicalLedgerResult["details"] = [];
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return { success: false, inserted: 0, skipped: 0, failed: 0, details: [{ index: -1, error: "events must be a non-empty array" }] };
  }
  if (rawEvents.length > MAX_BATCH) {
    return {
      success: false,
      inserted: 0,
      skipped: 0,
      failed: 0,
      details: [{ index: -1, error: `Max ${MAX_BATCH} events per request` }],
    };
  }

  for (let i = 0; i < rawEvents.length; i++) {
    const v = validateOne(rawEvents[i], i);
    if (!v.ok) {
      failed++;
      details.push({ index: i, error: v.error });
      continue;
    }

    const base = v.value;
    const idem = String(base.idempotencyKey);
    const idemKvKey = `ledger_event_idem:${await sha256Hex(idem)}`;

    try {
      const existing = await kv.get(idemKvKey);
      if (existing && typeof existing === "object" && existing !== null && typeof (existing as any).id === "string") {
        skipped++;
        details.push({ index: i, idempotencyKey: idem, id: (existing as any).id, skipped: true });
        continue;
      }

      const id =
        typeof base.id === "string" && (base.id as string).trim()
          ? (base.id as string).trim()
          : crypto.randomUUID();
      const createdAt =
        typeof (rawEvents[i] as { createdAt?: string })?.createdAt === "string"
          ? String((rawEvents[i] as { createdAt?: string }).createdAt)
          : new Date().toISOString();

      const { id: _dropId, ...rest } = base as Record<string, unknown> & { id?: string };
      void _dropId;
      const record: Record<string, unknown> = {
        ...rest,
        id,
        createdAt,
      };

      const stamped = stampOrg(record, c);
      await kv.set(`ledger_event:${id}`, stamped);
      await kv.set(idemKvKey, { id, idempotencyKey: idem });

      inserted++;
      details.push({ index: i, idempotencyKey: idem, id });
      console.log(
        `[CanonicalLedger] inserted id=${id} type=${base.eventType} idem=${idem.slice(0, 40)}…`,
      );
    } catch (err: any) {
      failed++;
      details.push({ index: i, idempotencyKey: idem, error: err?.message || String(err) });
      console.error(`[CanonicalLedger] append failed index=${i}:`, err);
    }
  }

  const success = failed === 0;
  return { success, inserted, skipped, failed, details };
}
