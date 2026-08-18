/**
 * Canonical money events — SSOT is ledger.entries (via fleetDualWriteCanonicalEvent).
 * Idempotency resolves against ledger.entries / source_receipts (KV money store retired).
 */
import type { Context } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { stampOrg } from "./org_scope.ts";
import { isKnownPlatform, normalizePlatform } from "../../../packages/finance-core/src/normalizePlatform.ts";

export const CANONICAL_SCHEMA_VERSION = 1;
export const CANONICAL_EVENT_KIND = "canonical";

const MONEY_PLATFORM_REQUIRED = new Set([
  "fare_earning",
  "tip",
  "statement_line",
  "statement_adjustment",
  "payout_cash",
  "payout_bank",
  "platform_fee",
  "promotion",
  "surge_bonus",
  "prior_period_adjustment",
  "payment_line",
  "dispute_refund",
  "toll_charge",
  "toll_support_adjustment",
  "toll_reimbursement",
]);
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
  "fuel_charge_offset",
  "toll_charge",
  "toll_reimbursement",
  "toll_refund",
  "adjustment",
  "other",
  "statement_line",
  "statement_adjustment",
  "payout_cash",
  "payout_bank",
  "toll_support_adjustment",
  "dispute_refund",
  /** One row per Uber payments_transaction.csv line (transaction-grain SSOT). */
  "payment_line",
  "wallet_credit",
  "fuel_reimbursement",
  "toll_reconciled",
  "toll_unreconciled",
  "toll_approved",
  "toll_rejected",
  "toll_usage",
  "toll_charged_to_driver",
  "toll_charge_reversed",
  "toll_charge_offset",
  "fuel_deduction",
  "fuel_fleet_share",
  "fuel_driver_spend",
  "fuel_gas_card_spend",
  "fuel_finalized",
  "cash_collected",
  "cash_returned",
  // Business-overhead SSOT (Business Finance coverage program).
  /** One dated occurrence of a recurring vehicle FixedExpenseConfig (Phase 2). */
  "fixed_expense",
  /** Generic manually-logged operating expense bridged from transaction:* (Phase 3). */
  "operating_expense",
  /** Generic manually-logged other income bridged from transaction:* (Phase 3). */
  "other_income",
  /** Completed, paid maintenance parts/labor spend (Phase 4). */
  "maintenance",
]);

const VALID_DIRECTIONS = new Set(["inflow", "outflow", "neutral"]);

const VALID_SOURCE_TYPES = new Set([
  "trip",
  "statement",
  "import_batch",
  "transaction",
  "adjustment",
  "reconciliation",
  "toll_resolution",
  "toll_workflow",
  "fuel_ops",
  "backfill",
  "financial_event",
]);

async function sha256Hex(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fetch a canonical ledger event by its idempotencyKey, or null if none exists. */
export async function getCanonicalEventByIdemKey(idempotencyKey: string): Promise<Record<string, unknown> | null> {
  try {
    const client = supabaseKv();
    const unifiedKey = `kv_ledger_event:${idempotencyKey}`;
    const { data: byIdem } = await client
      .from("ledger_entries")
      .select("id, entry_type, amount_minor, currency, effective_at, organization_id, metadata, reference_type, reference_id, created_at")
      .eq("idempotency_key", unifiedKey)
      .limit(1);
    if (byIdem?.[0]) return mapEntryRowToCanonical(byIdem[0] as Record<string, unknown>, idempotencyKey);

    const { data: byReceipt } = await client
      .from("ledger_source_receipts")
      .select("ledger_entry_id")
      .eq("source_system", "kv_ledger_event")
      .eq("source_idempotency_key", idempotencyKey)
      .limit(1);
    if (byReceipt?.[0]?.ledger_entry_id) {
      const { data: entr } = await client
        .from("ledger_entries")
        .select("id, entry_type, amount_minor, currency, effective_at, organization_id, metadata, reference_type, reference_id, created_at")
        .eq("id", byReceipt[0].ledger_entry_id)
        .limit(1);
      if (entr?.[0]) return mapEntryRowToCanonical(entr[0] as Record<string, unknown>, idempotencyKey);
    }
  } catch (err) {
    console.warn("[canonical] unified idem lookup failed:", err);
  }
  return null;
}

function mapEntryRowToCanonical(e: Record<string, unknown>, idempotencyKey: string): Record<string, unknown> {
  const meta = (e.metadata && typeof e.metadata === "object" ? e.metadata : {}) as Record<string, unknown>;
  return {
    id: e.id,
    eventType: e.entry_type,
    netAmount: Number(e.amount_minor ?? 0) / 100,
    grossAmount: meta.grossAmount != null ? Number(meta.grossAmount) : Number(e.amount_minor ?? 0) / 100,
    date: String(e.effective_at ?? "").slice(0, 10),
    createdAt: e.created_at,
    organizationId: e.organization_id,
    sourceType: e.reference_type,
    sourceId: e.reference_id,
    metadata: meta,
    driverId: meta.driverId,
    platform: meta.platform,
    paymentMethod: meta.paymentMethod,
    periodStart: meta.periodStart,
    periodEnd: meta.periodEnd,
    category: meta.category,
    batchId: meta.batchId,
    description: meta.description,
    direction: meta.direction || "inflow",
    idempotencyKey,
    eventKind: CANONICAL_EVENT_KIND,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

/**
 * Does a canonical ledger event with this exact idempotencyKey already exist?
 */
export async function canonicalEventExistsByIdemKey(idempotencyKey: string): Promise<boolean> {
  return (await getCanonicalEventByIdemKey(idempotencyKey)) !== null;
}

function supabaseKv() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

const IMPORT_MONEY_TYPES = new Set([
  "payout_cash",
  "payout_bank",
  "promotion",
  "statement_line",
  "payment_line",
  "toll_support_adjustment",
]);

/** True when this CSV file hash already posted money under a different batch. */
export async function importFileHashAlreadyPosted(
  sourceFileHash: string,
  currentBatchId?: string,
): Promise<boolean> {
  const hash = String(sourceFileHash || "").trim();
  if (hash.length < 8) return false;
  try {
    const client = supabaseKv();
    const { data, error } = await client
      .from("ledger_entries")
      .select("id, metadata, entry_type")
      .eq("metadata->>sourceFileHash", hash)
      .limit(40);
    if (error || !data?.length) return false;
    const batch = String(currentBatchId || "").trim();
    return data.some((row) => {
      const t = String((row as { entry_type?: string }).entry_type || "");
      if (!IMPORT_MONEY_TYPES.has(t)) return false;
      const meta = ((row as { metadata?: Record<string, unknown> }).metadata || {}) as Record<
        string,
        unknown
      >;
      const existingBatch = String(meta.batchId || "").trim();
      if (batch && existingBatch && existingBatch === batch) return false;
      return true;
    });
  } catch (err) {
    console.warn("[canonical] importFileHashAlreadyPosted failed:", err);
    return false;
  }
}

async function deleteUnifiedEntries(opts: {
  referenceType?: string;
  referenceIds?: string[];
  batchId?: string;
  fromYmd?: string;
}): Promise<{ deleted: number; idemDeleted: number }> {
  const client = supabaseKv();
  const { data, error } = await client.rpc("ledger_delete_entries", {
    p_reference_type: opts.referenceType ?? null,
    p_reference_ids: opts.referenceIds?.length ? opts.referenceIds : null,
    p_batch_id: opts.batchId ?? null,
    p_from_ymd: opts.fromYmd ?? null,
    p_source_system: "kv_ledger_event",
  });
  if (error) {
    console.error("[CanonicalLedger] ledger_delete_entries failed:", error.message);
    throw new Error(error.message);
  }
  const deleted = Number((data as { deleted?: number } | null)?.deleted ?? 0);
  console.log(
    `[CanonicalLedger] deleteUnifiedEntries deleted=${deleted} ref=${opts.referenceType || ""} batch=${opts.batchId || ""} from=${opts.fromYmd || ""}`,
  );
  return { deleted, idemDeleted: 0 };
}

/**
 * Remove unified ledger.entries matching sourceType + sourceId.
 */
export async function deleteCanonicalLedgerBySource(
  sourceType: string,
  sourceIds: string[],
): Promise<{ deleted: number; idemDeleted: number }> {
  const ids = [...new Set(sourceIds.map((s) => String(s).trim()).filter(Boolean))];
  if (!ids.length || !VALID_SOURCE_TYPES.has(sourceType)) {
    return { deleted: 0, idemDeleted: 0 };
  }
  return await deleteUnifiedEntries({ referenceType: sourceType, referenceIds: ids });
}

/**
 * Remove unified rows for source ids on/after a date.
 */
export async function deleteCanonicalLedgerBySourceFromDate(
  sourceType: string,
  sourceIds: string[],
  fromYmd: string,
): Promise<{ deleted: number; idemDeleted: number }> {
  const ids = [...new Set(sourceIds.map((s) => String(s).trim()).filter(Boolean))];
  if (
    !ids.length ||
    !VALID_SOURCE_TYPES.has(sourceType) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fromYmd)
  ) {
    return { deleted: 0, idemDeleted: 0 };
  }
  return await deleteUnifiedEntries({ referenceType: sourceType, referenceIds: ids, fromYmd });
}

/** Delete every unified ledger row with the given sourceType. */
export async function deleteAllCanonicalLedgerBySourceType(
  sourceType: string,
): Promise<{ deleted: number; idemDeleted: number }> {
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    return { deleted: 0, idemDeleted: 0 };
  }
  // Page reference_ids then delete — avoids unbounded single RPC for huge fleets.
  const client = supabaseKv();
  let totalDeleted = 0;
  while (true) {
    const { data, error } = await client
      .from("ledger_entries")
      .select("reference_id")
      .eq("reference_type", sourceType)
      .not("reference_id", "is", null)
      .limit(500);
    if (error) throw error;
    const page = (data || []) as { reference_id: string }[];
    if (!page.length) break;
    const ids = [...new Set(page.map((r) => String(r.reference_id || "").trim()).filter(Boolean))];
    if (!ids.length) break;
    const res = await deleteUnifiedEntries({ referenceType: sourceType, referenceIds: ids });
    totalDeleted += res.deleted;
    if (res.deleted === 0) break;
  }
  console.log(`[CanonicalLedger] deleteAllCanonicalLedgerBySourceType type=${sourceType} deleted=${totalDeleted}`);
  return { deleted: totalDeleted, idemDeleted: 0 };
}

/** Delete unified entries stamped with a given import batchId. */
export async function deleteCanonicalLedgerByBatchId(
  batchId: string,
): Promise<{ deleted: number; idemDeleted: number }> {
  const id = String(batchId || "").trim();
  if (!id) return { deleted: 0, idemDeleted: 0 };
  return await deleteUnifiedEntries({ batchId: id });
}

/** Count unified entries for a batch (delete-preview). */
export async function countCanonicalLedgerByBatchId(batchId: string): Promise<number> {
  const id = String(batchId || "").trim();
  if (!id) return 0;
  const client = supabaseKv();
  const { data, error } = await client.rpc("ledger_count_entries_by_batch", { p_batch_id: id });
  if (error) {
    console.error("[CanonicalLedger] count by batch failed:", error.message);
    return 0;
  }
  return Number(data ?? 0);
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
  if (MONEY_PLATFORM_REQUIRED.has(eventType)) {
    if (!isKnownPlatform(typeof e.platform === "string" ? e.platform : null)) {
      return {
        ok: false,
        error: `Event ${index}: known platform required (Uber/Roam/InDrive)`,
      };
    }
    out.platform = normalizePlatform(String(e.platform));
  } else if (typeof e.platform === "string" && e.platform.trim()) {
    out.platform = e.platform.trim();
  }
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
 * Idempotent append — writes only to ledger.entries (unified SSOT).
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

    try {
      const idemHash = await sha256Hex(idem);
      const id =
        typeof base.id === "string" && (base.id as string).trim()
          ? (base.id as string).trim()
          : idemHash.slice(0, 8) + "-" + idemHash.slice(8, 12) + "-4" + idemHash.slice(13, 16) +
            "-a" + idemHash.slice(17, 20) + "-" + idemHash.slice(20, 32);

      const existing = await getCanonicalEventByIdemKey(idem);
      if (existing) {
        skipped++;
        details.push({ index: i, idempotencyKey: idem, id: String(existing.id || id), skipped: true });
        continue;
      }

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
      const orgId = typeof (stamped as { organizationId?: string }).organizationId === "string"
        ? (stamped as { organizationId: string }).organizationId
        : null;

      const metaBase =
        base.metadata && typeof base.metadata === "object" && !Array.isArray(base.metadata)
          ? { ...(base.metadata as Record<string, unknown>) }
          : {};
      // Stamp top-level fields into metadata for unified readers.
      if (base.batchId) metaBase.batchId = base.batchId;
      if (base.description) metaBase.description = base.description;
      if (base.vehicleId) metaBase.vehicleId = base.vehicleId;
      if (base.isReconciled === true || base.isReconciled === false) metaBase.isReconciled = base.isReconciled;
      if (base.platform) metaBase.platform = base.platform;
      if (base.paymentMethod) metaBase.paymentMethod = base.paymentMethod;
      if (base.periodStart) metaBase.periodStart = base.periodStart;
      if (base.periodEnd) metaBase.periodEnd = base.periodEnd;
      if (base.grossAmount != null) metaBase.grossAmount = base.grossAmount;
      if (base.category) metaBase.category = base.category;
      if (base.driverId) metaBase.driverId = base.driverId;
      if (base.direction) metaBase.direction = base.direction;
      if (typeof base.sourceFileHash === "string" && base.sourceFileHash.trim()) {
        metaBase.sourceFileHash = base.sourceFileHash.trim();
      }

      const { fleetDualWriteCanonicalEvent } = await import("./unified_ledger_dual_write.ts");
      await fleetDualWriteCanonicalEvent({
        id,
        idempotencyKey: idem,
        eventType: String(base.eventType),
        direction: String(base.direction),
        netAmount: Number(base.netAmount),
        currency: String(base.currency ?? "JMD"),
        driverId: String(base.driverId),
        sourceType: String(base.sourceType),
        sourceId: String(base.sourceId),
        organizationId: orgId,
        date: String(base.date),
        platform: typeof base.platform === "string" ? base.platform : undefined,
        paymentMethod: typeof base.paymentMethod === "string" ? base.paymentMethod : undefined,
        periodStart: typeof base.periodStart === "string" ? base.periodStart : undefined,
        periodEnd: typeof base.periodEnd === "string" ? base.periodEnd : undefined,
        grossAmount: Number.isFinite(Number(base.grossAmount)) ? Number(base.grossAmount) : undefined,
        category: typeof base.category === "string" ? base.category : undefined,
        metadata: metaBase,
      });

      inserted++;
      details.push({ index: i, idempotencyKey: idem, id });
      console.log(
        `[CanonicalLedger] inserted(unified) id=${id} type=${base.eventType} idem=${idem.slice(0, 40)}…`,
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

