/**
 * Unified financial ledger poster — single entry point for toll/fuel/cash
 * money events. Calls public.ledger_post_financial_event (atomic SQL).
 */
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { startOfWeek, endOfWeek, format } from "npm:date-fns";
import { getFleetTimezone } from "./timezone_helper.tsx";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export type FinancialDomain = "toll" | "fuel" | "cash" | "earnings" | "payout" | "other";
export type FinancialDirection = "inflow" | "outflow" | "neutral";

export interface FinancialAllocationInput {
  allocation_type: string;
  amount_minor: number;
  currency?: string;
  driver_id?: string;
  toll_id?: string;
  claim_id?: string;
  fuel_entry_id?: string;
  period_anchor?: string;
  idempotency_key?: string;
  reverses_id?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface PostFinancialEventInput {
  idempotencyKey: string;
  requestHash?: string;
  domain: FinancialDomain;
  eventType: string;
  sourceSystem: string;
  sourceId: string;
  driverId?: string | null;
  vehicleId?: string | null;
  occurredAt: string | Date;
  amountMajor: number; // signed major units (JMD)
  direction?: FinancialDirection;
  organizationId?: string | null;
  product?: string;
  debitAccountKey?: string | null;
  creditAccountKey?: string | null;
  reversesEventId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  payload?: Record<string, unknown>;
  createdByUserId?: string | null;
  allocations?: FinancialAllocationInput[];
  /** When omitted, computed from occurredAt in fleet timezone (Monday). */
  periodAnchor?: string;
}

export interface PostFinancialEventResult {
  ok: boolean;
  inserted: boolean;
  skipped: boolean;
  conflict: boolean;
  eventId: string | null;
  ledgerEntryId: string | null;
  error?: string;
}

export function majorToMinor(amount: number): number {
  return Math.round(Number(amount) * 100);
}

export function minorToMajor(minor: number): number {
  return Math.round(Number(minor)) / 100;
}

/** Fleet-TZ Monday key for a date string / Date. */
export async function periodAnchorFor(dateLike: string | Date, timezone?: string): Promise<string> {
  const tz = timezone || (await getFleetTimezone());
  const raw = typeof dateLike === "string" ? dateLike : dateLike.toISOString();
  // Use calendar day from ISO or date-only, then Monday-start week in UTC-local parse.
  const day = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  const local = new Date(y, (m || 1) - 1, d || 1);
  const weekStart = startOfWeek(local, { weekStartsOn: 1 });
  return format(weekStart, "yyyy-MM-dd");
}

export function periodEndForAnchor(anchorYmd: string): string {
  const [y, m, d] = anchorYmd.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);
  return format(endOfWeek(start, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable request hash so changed payloads conflict instead of silent skip. */
export async function buildRequestHash(parts: Record<string, unknown>): Promise<string> {
  const ordered = Object.keys(parts).sort().reduce((acc: Record<string, unknown>, k) => {
    acc[k] = parts[k];
    return acc;
  }, {});
  return sha256Hex(JSON.stringify(ordered));
}

export async function postFinancialEvent(
  input: PostFinancialEventInput,
): Promise<PostFinancialEventResult> {
  try {
    const occurred =
      typeof input.occurredAt === "string"
        ? input.occurredAt
        : input.occurredAt.toISOString();
    const periodAnchor = input.periodAnchor || (await periodAnchorFor(occurred));
    const amountMinor = majorToMinor(input.amountMajor);
    const direction =
      input.direction ||
      (amountMinor === 0 ? "neutral" : amountMinor < 0 ? "outflow" : "inflow");
    const requestHash =
      input.requestHash ||
      (await buildRequestHash({
        domain: input.domain,
        eventType: input.eventType,
        sourceId: input.sourceId,
        amountMinor,
        driverId: input.driverId,
        occurred,
        payload: input.payload || {},
      }));

    const { data, error } = await sb().rpc("ledger_post_financial_event", {
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: requestHash,
      p_domain: input.domain,
      p_event_type: input.eventType,
      p_source_system: input.sourceSystem,
      p_source_id: input.sourceId,
      p_driver_id: input.driverId || null,
      p_vehicle_id: input.vehicleId || null,
      p_occurred_at: occurred.includes("T") ? occurred : `${occurred}T12:00:00.000Z`,
      p_period_anchor: periodAnchor,
      p_amount_minor: amountMinor,
      p_currency: "JMD",
      p_direction: direction,
      p_organization_id: input.organizationId || null,
      p_product: input.product || (input.domain === "earnings" ? "roam_driver" : "roam_fleet"),
      p_debit_account_key: input.debitAccountKey || null,
      p_credit_account_key: input.creditAccountKey || null,
      p_reverses_event_id: input.reversesEventId || null,
      p_correlation_id: input.correlationId || null,
      p_causation_id: input.causationId || null,
      p_payload: input.payload || {},
      p_created_by_user_id: input.createdByUserId || null,
      p_allocations: input.allocations || [],
    });

    if (error) {
      console.error("[FinancialLedger] post failed:", error.message);
      return {
        ok: false,
        inserted: false,
        skipped: false,
        conflict: false,
        eventId: null,
        ledgerEntryId: null,
        error: error.message,
      };
    }

    const row = data as Record<string, unknown>;
    return {
      ok: !(row?.conflict === true),
      inserted: row?.inserted === true,
      skipped: row?.skipped === true,
      conflict: row?.conflict === true,
      eventId: (row?.event_id as string) || null,
      ledgerEntryId: (row?.ledger_entry_id as string) || null,
      error: row?.conflict === true ? "idempotency_conflict" : undefined,
    };
  } catch (e: any) {
    console.error("[FinancialLedger] post exception:", e?.message || e);
    return {
      ok: false,
      inserted: false,
      skipped: false,
      conflict: false,
      eventId: null,
      ledgerEntryId: null,
      error: e?.message || String(e),
    };
  }
}

/** Reverse a prior financial event by posting a compensating event. */
export async function reverseFinancialEvent(opts: {
  priorEventId: string;
  idempotencyKey: string;
  reason?: string;
  driverId?: string | null;
  domain: FinancialDomain;
  eventType: string;
  sourceSystem: string;
  sourceId: string;
  amountMajor: number; // original signed amount — reversal flips direction
  occurredAt?: string;
  payload?: Record<string, unknown>;
}): Promise<PostFinancialEventResult> {
  const flipped = -opts.amountMajor;
  return postFinancialEvent({
    idempotencyKey: opts.idempotencyKey,
    domain: opts.domain,
    eventType: opts.eventType,
    sourceSystem: opts.sourceSystem,
    sourceId: opts.sourceId,
    driverId: opts.driverId,
    occurredAt: opts.occurredAt || new Date().toISOString(),
    amountMajor: flipped,
    direction: flipped < 0 ? "outflow" : flipped > 0 ? "inflow" : "neutral",
    reversesEventId: opts.priorEventId,
    payload: { ...(opts.payload || {}), reason: opts.reason, reverses_event_id: opts.priorEventId },
  });
}

export async function reverseLedgerEntry(
  entryId: string,
  idempotencyKey: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const { data, error } = await sb().rpc("ledger_reverse_entry", {
    p_entry_id: entryId,
    p_idempotency_key: idempotencyKey,
    p_reason: reason || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data };
}
