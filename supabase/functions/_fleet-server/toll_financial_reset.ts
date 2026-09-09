/**
 * Toll usage financial_events — reverse when ledger rows die or become orphans.
 * Mirrors fuel_financial_reset.ts; projection sums active toll_usage events.
 *
 * Audit §10: active toll_usage must only exist for spend-eligible ledger rows
 * (isTollIncludedInSpend) and abs(event) must match abs(ledger).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import {
  minorToMajor,
  reverseFinancialEvent,
} from "./financial_ledger.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import {
  isTollIncludedInSpend,
  isTollLedgerVoided,
  isTollQuarantined,
  quarantineReasonFor,
  type TollIntegrityLike,
} from "../../../packages/finance-core/src/tollLedgerIntegrity.ts";

const AMOUNT_EPS = 0.005;

/** Map fleet.toll_ledger (snake_case) or KV camelCase into TollIntegrityLike. */
export function tollLedgerRowToIntegrity(row: Record<string, unknown>): TollIntegrityLike {
  const meta = (row.metadata && typeof row.metadata === "object"
    ? row.metadata
    : {}) as Record<string, unknown>;
  const payload = (row.payload_json && typeof row.payload_json === "object"
    ? row.payload_json
    : row.payloadJson && typeof row.payloadJson === "object"
      ? row.payloadJson
      : {}) as Record<string, unknown>;
  return {
    id: row.id != null ? String(row.id) : null,
    vehicleId: (row.vehicle_id ?? row.vehicleId) != null
      ? String(row.vehicle_id ?? row.vehicleId)
      : null,
    driverId: (row.driver_id ?? row.driverId) != null
      ? String(row.driver_id ?? row.driverId)
      : null,
    date: row.date != null ? String(row.date).slice(0, 10) : null,
    amount: Number(row.amount) || 0,
    paymentMethod: String(
      row.payment_method ?? row.paymentMethod ?? payload.paymentMethod ?? "",
    ) || null,
    referenceNumber: (row.reference_number ?? row.referenceNumber) != null
      ? String(row.reference_number ?? row.referenceNumber)
      : null,
    status: row.status != null ? String(row.status) : null,
    plaza: (row.plaza ?? payload.plaza) != null ? String(row.plaza ?? payload.plaza) : null,
    vendor: row.plaza != null ? String(row.plaza) : null,
    batchId: (row.batch_id ?? row.batchId) != null
      ? String(row.batch_id ?? row.batchId)
      : null,
    tripId: (row.trip_id ?? row.tripId) != null
      ? String(row.trip_id ?? row.tripId)
      : null,
    quarantined: meta.quarantined === true || meta.tollQuarantined === true,
    metadata: meta,
    auditTrail: Array.isArray(row.audit_trail)
      ? (row.audit_trail as TollIntegrityLike["auditTrail"])
      : Array.isArray(row.auditTrail)
        ? (row.auditTrail as TollIntegrityLike["auditTrail"])
        : null,
  };
}

function isUsageType(type: unknown): boolean {
  const t = String(type || "").toLowerCase();
  return !t || t === "usage" || t.includes("usage");
}

function paymentBucket(pm: string | null | undefined): "cash" | "tag" | "other" {
  const s = String(pm || "").toLowerCase();
  if (s.includes("cash")) return "cash";
  if (s.includes("tag") || s.includes("balance")) return "tag";
  return "other";
}

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function filterActiveEvents<T extends {
  id?: string;
  reverses_event_id?: string | null;
  reversed_at?: string | null;
}>(events: T[]): T[] {
  const reversedIds = new Set<string>();
  for (const ev of events) {
    if (ev?.reverses_event_id) reversedIds.add(String(ev.reverses_event_id));
  }
  return events.filter(
    (ev) =>
      ev?.id &&
      !ev.reverses_event_id &&
      !ev.reversed_at &&
      !reversedIds.has(String(ev.id)),
  );
}

/** Extract toll ledger ids from KV keys / raw ids (Delete Center / bulk-delete). */
export function tollSourceIdsFromKeys(keys: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of keys) {
    const k = String(raw || "").trim();
    if (!k) continue;
    let id = k;
    if (k.startsWith("toll_ledger:")) id = k.slice("toll_ledger:".length);
    else if (k.startsWith("transaction:")) id = k.slice("transaction:".length);
    id = id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Active (unreversed) toll_usage events for the given source_ids. */
export async function listActiveTollUsageEventsForSourceIds(
  sourceIds: string[],
): Promise<any[]> {
  const ids = [...new Set(sourceIds.map(String).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await sb()
    .from("financial_events")
    .select(
      "id, event_type, domain, source_system, source_id, amount_minor, occurred_at, payload, reverses_event_id, reversed_at, driver_id, period_anchor",
    )
    .eq("event_type", "toll_usage")
    .in("source_id", ids);
  if (error) throw new Error(error.message);
  return filterActiveEvents(data || []);
}

/** Active toll_usage events for a driver-week (optional driver filter). */
export async function listActiveTollUsageEventsForWeek(opts: {
  periodAnchor: string;
  driverId?: string | null;
}): Promise<any[]> {
  const week = String(opts.periodAnchor || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    throw new Error("periodAnchor (YYYY-MM-DD) is required");
  }
  let q = sb()
    .from("financial_events")
    .select(
      "id, event_type, domain, source_system, source_id, amount_minor, occurred_at, payload, reverses_event_id, reversed_at, driver_id, period_anchor",
    )
    .eq("event_type", "toll_usage")
    .eq("period_anchor", week);
  if (opts.driverId) q = q.eq("driver_id", String(opts.driverId));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return filterActiveEvents(data || []);
}

/** Live (non-voided) toll ledger ids present in fleet.toll_ledger. */
export async function listLiveTollLedgerIds(sourceIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(sourceIds.map(String).filter(Boolean))];
  const live = new Set<string>();
  if (ids.length === 0) return live;

  // Prefer fleet table; fall back to KV existence checks.
  try {
    const { data, error } = await sb()
      .schema("fleet")
      .from("toll_ledger")
      .select("id, status, amount, metadata")
      .in("id", ids);
    if (!error && data) {
      for (const row of data) {
        const id = String((row as { id?: string }).id || "");
        if (!id) continue;
        const status = String((row as { status?: string }).status || "").toLowerCase();
        const meta = ((row as { metadata?: Record<string, unknown> }).metadata ||
          {}) as Record<string, unknown>;
        const voided = status === "voided" || meta.voided === true;
        if (voided) continue;
        live.add(id);
      }
      return live;
    }
  } catch {
    // fall through to KV
  }

  for (const id of ids) {
    const row = await kv.get(`toll_ledger:${id}`);
    if (!row) continue;
    const status = String(row.status || "").toLowerCase();
    const voided = status === "voided" || row.metadata?.voided === true;
    if (voided) continue;
    live.add(id);
  }
  return live;
}

async function reverseOneTollUsageEvent(
  ev: any,
  reason: string,
  idempotencyPrefix: string,
): Promise<{ ok: boolean; error?: string }> {
  const eventId = String(ev.id);
  const amountMajor = minorToMajor(Number(ev.amount_minor) || 0);
  const driverId = ev.driver_id ? String(ev.driver_id) : null;
  const result = await reverseFinancialEvent({
    priorEventId: eventId,
    idempotencyKey: `${idempotencyPrefix}:${eventId}`,
    reason,
    driverId,
    domain: "toll",
    eventType: "toll_usage",
    sourceSystem: "toll_workflow",
    sourceId: String(ev.source_id || eventId),
    amountMajor,
    occurredAt: ev.occurred_at || ev.period_anchor || new Date().toISOString(),
    payload: {
      priorEventType: ev.event_type,
      periodAnchor: ev.period_anchor,
      paymentMethod: (ev.payload as Record<string, unknown> | null)?.paymentMethod,
    },
  });
  if (result.ok || result.skipped) return { ok: true };
  return { ok: false, error: result.error || "failed" };
}

/**
 * Reverse active toll_usage events whose source_id is in the given set
 * (delete / void / bulk-delete / quarantine paths).
 */
export async function reverseTollUsageEventsForSourceIds(
  sourceIds: string[],
  reason = "toll_ledger_deleted",
): Promise<{ eventsReversed: number; errors: string[] }> {
  const errors: string[] = [];
  let eventsReversed = 0;
  const active = await listActiveTollUsageEventsForSourceIds(sourceIds);
  const prefix = `toll_usage_reverse:${reason}`;

  for (const ev of active) {
    try {
      const r = await reverseOneTollUsageEvent(ev, reason, prefix);
      if (r.ok) eventsReversed++;
      else errors.push(`reverse ${ev.id}: ${r.error}`);
    } catch (e: any) {
      errors.push(`reverse ${ev.id}: ${e?.message || e}`);
    }
  }
  return { eventsReversed, errors };
}

/**
 * Reverse active toll_usage when a toll is quarantined / excluded from spend.
 * Forward-only: does not rewrite closed weeks; events path simply stops counting.
 */
export async function reverseTollUsageEventsForQuarantine(
  sourceIds: string[],
): Promise<{ eventsReversed: number; errors: string[] }> {
  return reverseTollUsageEventsForSourceIds(sourceIds, "toll_ledger_quarantined");
}

/** Count prior non-reversal toll_usage rows for a source → next post generation (1-based). */
export async function nextTollUsagePostGeneration(sourceId: string): Promise<number> {
  const sid = String(sourceId || "").trim();
  if (!sid) return 1;
  const { count, error } = await sb()
    .from("financial_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "toll_usage")
    .eq("source_id", sid)
    .is("reverses_event_id", null);
  if (error) throw new Error(error.message);
  return (count || 0) + 1;
}

/**
 * Ensure a live, non-quarantined usage row has an active toll_usage event.
 * Used after un-quarantine — never revives a reversed row; posts a new generation.
 */
export async function ensureActiveTollUsagePostedForEntry(entry: {
  id?: string;
  type?: string;
  amount?: number;
  driverId?: string | null;
  vehicleId?: string | null;
  date?: string;
  paymentMethod?: string;
  workflowStage?: string;
  location?: string;
  plaza?: string;
  metadata?: Record<string, unknown> | null;
}): Promise<{ posted: boolean; skipped: boolean; error?: string }> {
  const id = String(entry.id || "").trim();
  const t = String(entry.type || "").toLowerCase();
  const abs = Math.abs(Number(entry.amount) || 0);
  if (!id || t !== "usage" || abs < 0.005 || !entry.driverId) {
    return { posted: false, skipped: true };
  }
  const meta = entry.metadata || {};
  const quarantined =
    meta.quarantined === true ||
    meta.tollQuarantined === true ||
    meta.excludeFromSpend === true;
  if (quarantined) return { posted: false, skipped: true };

  const active = await listActiveTollUsageEventsForSourceIds([id]);
  if (active.length > 0) return { posted: false, skipped: true };

  const { postFinancialEvent } = await import("./financial_ledger.ts");
  const generation = await nextTollUsagePostGeneration(id);
  const idempotencyKey =
    generation <= 1
      ? `toll_ledger:${id}|toll_usage`
      : `toll_ledger:${id}|toll_usage:g${generation}`;

  const result = await postFinancialEvent({
    idempotencyKey,
    domain: "toll",
    eventType: "toll_usage",
    sourceSystem: "toll_workflow",
    sourceId: id,
    driverId: String(entry.driverId),
    vehicleId: entry.vehicleId || null,
    occurredAt: entry.date || new Date().toISOString(),
    amountMajor: -abs,
    direction: "outflow",
    debitAccountKey: "platform:fleet_toll_expense",
    creditAccountKey: "platform:toll_tag_clearing",
    payload: {
      description: entry.location || entry.plaza,
      paymentMethod: entry.paymentMethod,
      workflowStage: entry.workflowStage,
      generation,
      reason: generation > 1 ? "toll_ledger_unquarantined" : undefined,
    },
  });
  if (!result.ok && !result.skipped) {
    return { posted: false, skipped: false, error: result.error || "failed" };
  }
  if (result.inserted === true) {
    // Non-fatal: invalidate $0 N/A seals when late toll_usage lands for the week.
    try {
      const { periodKeyFor } = await import("../../../packages/finance-core/src/periodKey.ts");
      const day = String(entry.date || "").slice(0, 10);
      const weekKey =
        periodKeyFor(/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10)) ||
        "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
        const { getServiceClient } = await import("./service_client.ts");
        const sb = getServiceClient();
        const { data: per } = await sb
          .from("driver_financial_periods")
          .select("organization_id")
          .eq("driver_id", String(entry.driverId))
          .eq("period_anchor", weekKey)
          .maybeSingle();
        const orgId = String((per as { organization_id?: string } | null)?.organization_id || "").trim();
        if (orgId) {
          const { getLatestWeekStatement } = await import("./week_statements.ts");
          const latest = await getLatestWeekStatement(orgId, String(entry.driverId), weekKey, "toll");
          if (
            latest?.status === "closed" &&
            String(latest.closeReason || "") === "zero_activity_na"
          ) {
            const { sealTollWeek } = await import("./toll_week_seal.ts");
            await sealTollWeek({
              organizationId: orgId,
              weekKey,
              actorId: "toll_usage_post",
              force: true,
            });
          }
        }
      }
    } catch (e) {
      console.warn(
        "[ensureActiveTollUsagePostedForEntry] stale zero-seal reseal failed (non-fatal)",
        entry.driverId,
        e,
      );
    }
  }
  return { posted: result.inserted === true, skipped: result.skipped === true };
}


/**
 * Find active toll_usage events whose source_id is missing/voided in the ledger,
 * then reverse them (ops remediation + post-reset cleanup).
 */
export async function reverseOrphanTollUsageEventsForWeek(opts: {
  periodAnchor: string;
  driverId?: string | null;
  reason?: string;
}): Promise<{
  eventsReversed: number;
  orphanCount: number;
  orphanAmountMajor: number;
  errors: string[];
  reversedEventIds: string[];
}> {
  const reason = opts.reason || "orphan_toll_usage_no_ledger_row";
  const errors: string[] = [];
  const reversedEventIds: string[] = [];
  let eventsReversed = 0;
  let orphanAmountMajor = 0;

  const active = await listActiveTollUsageEventsForWeek({
    periodAnchor: opts.periodAnchor,
    driverId: opts.driverId,
  });
  const sourceIds = [
    ...new Set(active.map((ev) => String(ev.source_id || "")).filter(Boolean)),
  ];
  const live = await listLiveTollLedgerIds(sourceIds);
  const orphans = active.filter((ev) => {
    const sid = String(ev.source_id || "");
    return !sid || !live.has(sid);
  });

  for (const ev of orphans) {
    orphanAmountMajor += Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
  }
  orphanAmountMajor = Math.round(orphanAmountMajor * 100) / 100;

  const prefix = `toll_orphan_reverse:${opts.periodAnchor}:${reason}`;
  for (const ev of orphans) {
    try {
      const r = await reverseOneTollUsageEvent(ev, reason, prefix);
      if (r.ok) {
        eventsReversed++;
        reversedEventIds.push(String(ev.id));
      } else {
        errors.push(`reverse ${ev.id}: ${r.error}`);
      }
    } catch (e: any) {
      errors.push(`reverse ${ev.id}: ${e?.message || e}`);
    }
  }

  return {
    eventsReversed,
    orphanCount: orphans.length,
    orphanAmountMajor,
    errors,
    reversedEventIds,
  };
}

export type TollUsageIntegritySummary = {
  orphanCount: number;
  orphanAmountMajor: number;
  eventSpendMajor: number;
  ledgerSpendMajor: number;
  orphanSourceIds: string[];
  /** Live spend-eligible toll rows with NO active toll_usage event. */
  missingEventCount: number;
  missingEventAmountMajor: number;
  missingEventTollIds: string[];
  /** Active events on quarantined (or otherwise non-spend) ledger rows. */
  ineligibleEventCount: number;
  ineligibleEventAmountMajor: number;
  ineligibleSourceIds: string[];
  /** Live spend-eligible rows where abs(event) ≠ abs(ledger). */
  amountMismatchCount: number;
  amountMismatchAmountMajor: number;
  amountMismatchSourceIds: string[];
};

async function loadTollLedgerRowsByIds(
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const uniq = [...new Set(ids.map(String).filter(Boolean))];
  if (uniq.length === 0) return out;
  try {
    const { data, error } = await sb()
      .schema("fleet")
      .from("toll_ledger")
      .select(
        "id, amount, type, status, metadata, driver_id, vehicle_id, date, payment_method, plaza, trip_id, batch_id, audit_trail, payload_json",
      )
      .in("id", uniq);
    if (!error && data) {
      for (const row of data) {
        const id = String((row as { id?: string }).id || "");
        if (id) out.set(id, row as Record<string, unknown>);
      }
      return out;
    }
  } catch {
    /* fall through */
  }
  for (const id of uniq) {
    const row = await kv.get(`toll_ledger:${id}`);
    if (row && typeof row === "object") out.set(id, row as Record<string, unknown>);
  }
  return out;
}

/** Summarize orphans / ineligible / amount gaps without reversing (close / nightly). */
export async function summarizeTollUsageOrphansForWeek(opts: {
  periodAnchor: string;
  driverId?: string | null;
}): Promise<TollUsageIntegritySummary> {
  const active = await listActiveTollUsageEventsForWeek(opts);
  let eventSpendMajor = 0;
  for (const ev of active) {
    eventSpendMajor += Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
  }
  eventSpendMajor = Math.round(eventSpendMajor * 100) / 100;

  const sourceIds = [
    ...new Set(active.map((ev) => String(ev.source_id || "")).filter(Boolean)),
  ];
  const ledgerById = await loadTollLedgerRowsByIds(sourceIds);
  const live = await listLiveTollLedgerIds(sourceIds);

  const orphanSourceIds: string[] = [];
  let orphanAmountMajor = 0;
  const ineligibleSourceIds: string[] = [];
  let ineligibleEventAmountMajor = 0;
  const amountMismatchSourceIds: string[] = [];
  let amountMismatchAmountMajor = 0;
  /** Spend-eligible ledger abs for events that resolve to live spend rows. */
  let eligibleLedgerSpendMajor = 0;

  for (const ev of active) {
    const sid = String(ev.source_id || "");
    const eventAbs = Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
    if (!sid || !live.has(sid)) {
      if (sid) orphanSourceIds.push(sid);
      orphanAmountMajor += eventAbs;
      continue;
    }
    const row = ledgerById.get(sid);
    if (!row) {
      orphanSourceIds.push(sid);
      orphanAmountMajor += eventAbs;
      continue;
    }
    const integrity = tollLedgerRowToIntegrity(row);
    if (!isTollIncludedInSpend(integrity)) {
      ineligibleSourceIds.push(sid);
      ineligibleEventAmountMajor += eventAbs;
      continue;
    }
    const ledgerAbs = Math.abs(Number(integrity.amount) || 0);
    eligibleLedgerSpendMajor += ledgerAbs;
    if (Math.abs(eventAbs - ledgerAbs) > AMOUNT_EPS) {
      amountMismatchSourceIds.push(sid);
      amountMismatchAmountMajor += Math.abs(eventAbs - ledgerAbs);
    }
  }
  orphanAmountMajor = Math.round(orphanAmountMajor * 100) / 100;
  ineligibleEventAmountMajor = Math.round(ineligibleEventAmountMajor * 100) / 100;
  amountMismatchAmountMajor = Math.round(amountMismatchAmountMajor * 100) / 100;
  eligibleLedgerSpendMajor = Math.round(eligibleLedgerSpendMajor * 100) / 100;

  // Missing events: spend-eligible usage rows in the week with no active event.
  const eventSourceIds = new Set(sourceIds);
  const missingEventTollIds: string[] = [];
  let missingEventAmountMajor = 0;
  try {
    const weekStart = String(opts.periodAnchor).slice(0, 10);
    const weekEnd = periodEndForAnchor(weekStart);
    let q = sb()
      .schema("fleet")
      .from("toll_ledger")
      .select(
        "id, amount, type, status, metadata, driver_id, vehicle_id, date, payment_method, plaza, trip_id, batch_id, audit_trail, payload_json",
      )
      .gte("date", weekStart)
      .lte("date", weekEnd);
    if (opts.driverId) q = q.eq("driver_id", String(opts.driverId));
    const { data } = await q;
    for (const row of data || []) {
      const rec = row as Record<string, unknown>;
      const id = String(rec.id || "");
      if (!id || eventSourceIds.has(id)) continue;
      if (!isUsageType(rec.type)) continue;
      const integrity = tollLedgerRowToIntegrity(rec);
      // Quarantined / voided must NOT raise TOLL_EVENT_MISSING after reverse.
      if (!isTollIncludedInSpend(integrity)) continue;
      missingEventTollIds.push(id);
      missingEventAmountMajor += Math.abs(Number(integrity.amount) || 0);
    }
  } catch (e) {
    console.warn("[tollUsageOrphans] missing-event scan skipped", opts.periodAnchor, e);
  }
  missingEventAmountMajor = Math.round(missingEventAmountMajor * 100) / 100;

  const uniqueOrphans = [...new Set(orphanSourceIds)];
  const uniqueIneligible = [...new Set(ineligibleSourceIds)];
  const uniqueMismatch = [...new Set(amountMismatchSourceIds)];
  return {
    orphanCount: uniqueOrphans.length,
    orphanAmountMajor,
    eventSpendMajor,
    // Eligible ledger + missing (understated) — excludes quarantined event spend.
    ledgerSpendMajor: Math.round((eligibleLedgerSpendMajor + missingEventAmountMajor) * 100) / 100,
    orphanSourceIds: uniqueOrphans,
    missingEventCount: missingEventTollIds.length,
    missingEventAmountMajor,
    missingEventTollIds,
    ineligibleEventCount: uniqueIneligible.length,
    ineligibleEventAmountMajor,
    ineligibleSourceIds: uniqueIneligible,
    amountMismatchCount: uniqueMismatch.length,
    amountMismatchAmountMajor,
    amountMismatchSourceIds: uniqueMismatch,
  };
}

export type IneligibleUsageRow = {
  sourceId: string;
  eventId: string;
  periodAnchor: string;
  driverId: string | null;
  eventAmountMajor: number;
  ledgerAmountMajor: number;
  paymentMethod: string | null;
  paymentBucket: "cash" | "tag" | "other";
  reason: "quarantined" | "voided" | "amount_mismatch" | "missing_ledger";
  quarantineReason: string | null;
  plaza: string | null;
  date: string | null;
};

export type IneligibleUsageReport = {
  dryRun: boolean;
  rows: IneligibleUsageRow[];
  byWeek: Array<{
    weekKey: string;
    count: number;
    amountMajor: number;
    tagAmountMajor: number;
    cashAmountMajor: number;
  }>;
  totals: {
    count: number;
    amountMajor: number;
    tagAmountMajor: number;
    cashAmountMajor: number;
  };
  eventsReversed?: number;
  periodsRebuilt?: number;
  errors?: string[];
};

/**
 * List active toll_usage events that should not count as spend (quarantined /
 * voided / missing ledger) or that amount-mismatch live spend rows.
 */
export async function listIneligibleTollUsageEvents(opts: {
  periodAnchor?: string | null;
  driverId?: string | null;
  sampleLimit?: number;
}): Promise<IneligibleUsageRow[]> {
  const week = opts.periodAnchor ? String(opts.periodAnchor).slice(0, 10) : null;
  let active: any[];
  if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
    active = await listActiveTollUsageEventsForWeek({
      periodAnchor: week,
      driverId: opts.driverId,
    });
  } else {
    // Fleet-wide: page active toll_usage (service role). Cap for safety.
    const { data, error } = await sb()
      .from("financial_events")
      .select(
        "id, event_type, source_id, amount_minor, payload, reverses_event_id, reversed_at, driver_id, period_anchor",
      )
      .eq("event_type", "toll_usage")
      .is("reverses_event_id", null)
      .is("reversed_at", null)
      .limit(Math.min(Math.max(opts.sampleLimit || 5000, 100), 10000));
    if (error) throw new Error(error.message);
    active = filterActiveEvents(data || []);
    if (opts.driverId) {
      active = active.filter((ev) => String(ev.driver_id || "") === String(opts.driverId));
    }
  }

  const sourceIds = [
    ...new Set(active.map((ev) => String(ev.source_id || "")).filter(Boolean)),
  ];
  const ledgerById = await loadTollLedgerRowsByIds(sourceIds);
  const rows: IneligibleUsageRow[] = [];

  for (const ev of active) {
    const sid = String(ev.source_id || "");
    const eventAbs = Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
    const pmFromEvent = String(
      (ev.payload as Record<string, unknown> | null)?.paymentMethod || "",
    ) || null;
    const periodAnchor = String(ev.period_anchor || "").slice(0, 10);
    const driverId = ev.driver_id ? String(ev.driver_id) : null;

    if (!sid) {
      rows.push({
        sourceId: "",
        eventId: String(ev.id),
        periodAnchor,
        driverId,
        eventAmountMajor: eventAbs,
        ledgerAmountMajor: 0,
        paymentMethod: pmFromEvent,
        paymentBucket: paymentBucket(pmFromEvent),
        reason: "missing_ledger",
        quarantineReason: null,
        plaza: null,
        date: null,
      });
      continue;
    }

    const row = ledgerById.get(sid);
    if (!row) {
      rows.push({
        sourceId: sid,
        eventId: String(ev.id),
        periodAnchor,
        driverId,
        eventAmountMajor: eventAbs,
        ledgerAmountMajor: 0,
        paymentMethod: pmFromEvent,
        paymentBucket: paymentBucket(pmFromEvent),
        reason: "missing_ledger",
        quarantineReason: null,
        plaza: null,
        date: null,
      });
      continue;
    }

    const integrity = tollLedgerRowToIntegrity(row);
    const ledgerAbs = Math.abs(Number(integrity.amount) || 0);
    const pm = integrity.paymentMethod || pmFromEvent;
    const base = {
      sourceId: sid,
      eventId: String(ev.id),
      periodAnchor,
      driverId: integrity.driverId || driverId,
      eventAmountMajor: eventAbs,
      ledgerAmountMajor: ledgerAbs,
      paymentMethod: pm,
      paymentBucket: paymentBucket(pm),
      plaza: integrity.plaza || null,
      date: integrity.date || null,
    };

    if (isTollLedgerVoided(integrity)) {
      rows.push({
        ...base,
        reason: "voided",
        quarantineReason: null,
      });
      continue;
    }
    if (!isTollIncludedInSpend(integrity) || isTollQuarantined(integrity)) {
      rows.push({
        ...base,
        reason: "quarantined",
        quarantineReason: quarantineReasonFor(integrity),
      });
      continue;
    }
    if (Math.abs(eventAbs - ledgerAbs) > AMOUNT_EPS) {
      rows.push({
        ...base,
        reason: "amount_mismatch",
        quarantineReason: null,
      });
    }
  }

  if (opts.sampleLimit && opts.sampleLimit > 0 && rows.length > opts.sampleLimit) {
    return rows.slice(0, opts.sampleLimit);
  }
  return rows;
}

function rollupIneligibleRows(rows: IneligibleUsageRow[]): IneligibleUsageReport["byWeek"] {
  const map = new Map<string, {
    weekKey: string;
    count: number;
    amountMajor: number;
    tagAmountMajor: number;
    cashAmountMajor: number;
  }>();
  for (const r of rows) {
    const wk = r.periodAnchor || "unknown";
    let slot = map.get(wk);
    if (!slot) {
      slot = { weekKey: wk, count: 0, amountMajor: 0, tagAmountMajor: 0, cashAmountMajor: 0 };
      map.set(wk, slot);
    }
    slot.count += 1;
    slot.amountMajor += r.eventAmountMajor;
    if (r.paymentBucket === "tag") slot.tagAmountMajor += r.eventAmountMajor;
    else if (r.paymentBucket === "cash") slot.cashAmountMajor += r.eventAmountMajor;
  }
  return [...map.values()]
    .map((s) => ({
      ...s,
      amountMajor: Math.round(s.amountMajor * 100) / 100,
      tagAmountMajor: Math.round(s.tagAmountMajor * 100) / 100,
      cashAmountMajor: Math.round(s.cashAmountMajor * 100) / 100,
    }))
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}

/** Dry-run or apply reverse for ineligible / mismatch active toll_usage. */
export async function reportOrReverseIneligibleTollUsage(opts: {
  periodAnchor?: string | null;
  driverId?: string | null;
  apply?: boolean;
  sampleLimit?: number;
  rebuild?: boolean;
  organizationId?: string | null;
}): Promise<IneligibleUsageReport> {
  // Always scan the full week (or capped fleet page) for accurate rollups;
  // sampleLimit only trims the rows array returned for UI review.
  const allRows = await listIneligibleTollUsageEvents({
    periodAnchor: opts.periodAnchor,
    driverId: opts.driverId,
    sampleLimit: opts.periodAnchor ? undefined : Math.min(opts.sampleLimit || 5000, 10000),
  });
  const byWeek = rollupIneligibleRows(allRows);
  let tagAmountMajor = 0;
  let cashAmountMajor = 0;
  let amountMajor = 0;
  for (const r of allRows) {
    amountMajor += r.eventAmountMajor;
    if (r.paymentBucket === "tag") tagAmountMajor += r.eventAmountMajor;
    else if (r.paymentBucket === "cash") cashAmountMajor += r.eventAmountMajor;
  }
  const totals = {
    count: allRows.length,
    amountMajor: Math.round(amountMajor * 100) / 100,
    tagAmountMajor: Math.round(tagAmountMajor * 100) / 100,
    cashAmountMajor: Math.round(cashAmountMajor * 100) / 100,
  };

  const displayLimit =
    !opts.apply && opts.sampleLimit && opts.sampleLimit > 0
      ? opts.sampleLimit
      : allRows.length;
  const rows = allRows.slice(0, displayLimit);

  if (!opts.apply) {
    return { dryRun: true, rows, byWeek, totals };
  }

  // Reverse quarantined / voided / missing; amount_mismatch on non-void live rows
  // needs a re-post path — reverse only when ledger is non-spend or missing.
  const reverseIds = [
    ...new Set(
      allRows
        .filter((r) =>
          r.reason === "quarantined" ||
          r.reason === "voided" ||
          r.reason === "missing_ledger"
        )
        .map((r) => r.sourceId)
        .filter(Boolean),
    ),
  ];
  const rev = await reverseTollUsageEventsForSourceIds(
    reverseIds,
    "toll_ledger_ineligible_restatement",
  );
  const errors = [...rev.errors];
  let eventsReversed = rev.eventsReversed;

  // Amount mismatches on spend-eligible rows: reverse then re-post generation.
  const mismatchIds = [
    ...new Set(
      allRows.filter((r) => r.reason === "amount_mismatch").map((r) => r.sourceId).filter(Boolean),
    ),
  ];
  if (mismatchIds.length > 0) {
    const mRev = await reverseTollUsageEventsForSourceIds(
      mismatchIds,
      "toll_ledger_amount_mismatch_restatement",
    );
    errors.push(...mRev.errors);
    eventsReversed += mRev.eventsReversed;
    const ledgerById = await loadTollLedgerRowsByIds(mismatchIds);
    for (const id of mismatchIds) {
      const row = ledgerById.get(id);
      if (!row) continue;
      const integrity = tollLedgerRowToIntegrity(row);
      if (!isTollIncludedInSpend(integrity)) continue;
      try {
        await ensureActiveTollUsagePostedForEntry({
          id,
          type: String(row.type || "usage"),
          amount: Number(integrity.amount) || 0,
          driverId: integrity.driverId,
          vehicleId: integrity.vehicleId,
          date: integrity.date || undefined,
          paymentMethod: integrity.paymentMethod || undefined,
          metadata: integrity.metadata,
        });
      } catch (e: any) {
        errors.push(`repost ${id}: ${e?.message || e}`);
      }
    }
  }

  let periodsRebuilt = 0;
  if (opts.rebuild !== false) {
    const anchors = [
      ...new Set(allRows.map((r) => r.periodAnchor).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))),
    ];
    const driverIds = opts.driverId
      ? [String(opts.driverId)]
      : [...new Set(allRows.map((r) => r.driverId).filter(Boolean).map(String))];
    try {
      const { rebuildPeriodsForAnchors } = await import("./driver_financial_periods.ts");
      for (const driverId of driverIds) {
        for (const anchor of anchors) {
          try {
            periodsRebuilt += await rebuildPeriodsForAnchors(driverId, [anchor]);
          } catch (re: any) {
            errors.push(`rebuild ${driverId}@${anchor}: ${re?.message || re}`);
          }
        }
      }
    } catch (e: any) {
      errors.push(`rebuild: ${e?.message || e}`);
    }
  }

  return {
    dryRun: false,
    rows: allRows,
    byWeek,
    totals,
    eventsReversed,
    periodsRebuilt,
    errors,
  };
}
