/**
 * Toll usage financial_events — reverse when ledger rows die or become orphans.
 * Mirrors fuel_financial_reset.ts; projection sums active toll_usage events.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import {
  minorToMajor,
  reverseFinancialEvent,
} from "./financial_ledger.ts";

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
 * (delete / void / bulk-delete paths).
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

/** Summarize orphans without reversing (close preview / nightly). */
export async function summarizeTollUsageOrphansForWeek(opts: {
  periodAnchor: string;
  driverId?: string | null;
}): Promise<{
  orphanCount: number;
  orphanAmountMajor: number;
  eventSpendMajor: number;
  ledgerSpendMajor: number;
  orphanSourceIds: string[];
}> {
  const active = await listActiveTollUsageEventsForWeek(opts);
  let eventSpendMajor = 0;
  for (const ev of active) {
    eventSpendMajor += Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
  }
  eventSpendMajor = Math.round(eventSpendMajor * 100) / 100;

  const sourceIds = [
    ...new Set(active.map((ev) => String(ev.source_id || "")).filter(Boolean)),
  ];
  const live = await listLiveTollLedgerIds(sourceIds);
  const orphanSourceIds: string[] = [];
  let orphanAmountMajor = 0;
  for (const ev of active) {
    const sid = String(ev.source_id || "");
    if (!sid || !live.has(sid)) {
      if (sid) orphanSourceIds.push(sid);
      orphanAmountMajor += Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
    }
  }
  orphanAmountMajor = Math.round(orphanAmountMajor * 100) / 100;

  // Ledger spend for live source ids in this week's event set (abs of live rows).
  let ledgerSpendMajor = 0;
  const liveIds = [...live];
  if (liveIds.length > 0) {
    try {
      const { data } = await sb()
        .schema("fleet")
        .from("toll_ledger")
        .select("id, amount, type, status, metadata")
        .in("id", liveIds);
      for (const row of data || []) {
        const status = String((row as { status?: string }).status || "").toLowerCase();
        const meta = ((row as { metadata?: Record<string, unknown> }).metadata ||
          {}) as Record<string, unknown>;
        if (status === "voided" || meta.voided === true) continue;
        const type = String((row as { type?: string }).type || "").toLowerCase();
        if (type && type !== "usage" && !type.includes("usage")) continue;
        ledgerSpendMajor += Math.abs(Number((row as { amount?: number }).amount) || 0);
      }
    } catch {
      for (const id of liveIds) {
        const row = await kv.get(`toll_ledger:${id}`);
        if (!row) continue;
        const status = String(row.status || "").toLowerCase();
        if (status === "voided" || row.metadata?.voided === true) continue;
        const type = String(row.type || "").toLowerCase();
        if (type && type !== "usage" && !type.includes("usage")) continue;
        ledgerSpendMajor += Math.abs(Number(row.amount) || 0);
      }
    }
  }
  ledgerSpendMajor = Math.round(ledgerSpendMajor * 100) / 100;

  const uniqueOrphans = [...new Set(orphanSourceIds)];
  return {
    orphanCount: uniqueOrphans.length,
    orphanAmountMajor,
    eventSpendMajor,
    ledgerSpendMajor,
    orphanSourceIds: uniqueOrphans,
  };
}
