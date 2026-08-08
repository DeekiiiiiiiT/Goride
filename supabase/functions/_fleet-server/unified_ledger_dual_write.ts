/**
 * Fleet edge — unified ledger dual-write (mirrors supabase/functions/_shared/unifiedLedger).
 */
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { dualWriteTollLedgerKv } from "../_shared/unifiedLedger/dualWriteToll.ts";
import { logDualWriteMetric } from "../_shared/unifiedLedger/metrics.ts";

import { isLedgerDualWriteIslandEnabled } from "../_shared/unifiedLedger/flags.ts";

function dualWriteEnabled(island = "kv_ledger_event"): boolean {
  return isLedgerDualWriteIslandEnabled(island);
}

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function majorToMinor(amount: number): number {
  return Math.round(Math.abs(Number(amount)) * 100);
}

async function postEntry(params: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb().rpc("ledger_post_entry", params);
  if (error) {
    console.error("[fleet unifiedLedger]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function fleetDualWriteCanonicalEvent(event: {
  id: string;
  idempotencyKey: string;
  eventType: string;
  direction: string;
  netAmount: number;
  currency?: string;
  driverId: string;
  sourceType: string;
  sourceId: string;
  organizationId?: string | null;
  date?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!dualWriteEnabled()) {
    logDualWriteMetric({
      source_system: "kv_ledger_event",
      status: "skipped",
      reason: "flag_off",
      source_id: event.id,
      entry_type: event.eventType,
    });
    return;
  }
  if (event.direction === "neutral") {
    logDualWriteMetric({
      source_system: "kv_ledger_event",
      status: "skipped",
      reason: "neutral",
      source_id: event.id,
      entry_type: event.eventType,
    });
    return;
  }

  const amountMinor = majorToMinor(event.netAmount);
  if (amountMinor <= 0) {
    logDualWriteMetric({
      source_system: "kv_ledger_event",
      status: "skipped",
      reason: "zero_amount",
      source_id: event.id,
      entry_type: event.eventType,
      amount_minor: amountMinor,
    });
    return;
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hasValidDriverId = uuidRe.test(event.driverId);
  const driverKey = hasValidDriverId
    ? `user:${event.driverId}:driver:digital`
    : (event.organizationId ? `org:${event.organizationId}:fleet` : "platform:clearing");
  const inflow = event.direction === "inflow";
  const debitKey = inflow ? "platform:clearing" : driverKey;
  const creditKey = inflow ? driverKey : "platform:clearing";

  // Same failure mode as toll missing-org: debit=credit is a no-op that pollutes recon.
  if (debitKey === creditKey) {
    logDualWriteMetric({
      source_system: "kv_ledger_event",
      status: "skipped",
      reason: "self_ref_accounts",
      source_id: event.id,
      entry_type: event.eventType,
      amount_minor: amountMinor,
    });
    return;
  }

  // Product: roam_driver for driver earnings, roam_fleet for org-level
  const product = hasValidDriverId ? "roam_driver" : "roam_fleet";

  const posted = await postEntry({
    p_idempotency_key: `kv_ledger_event:${event.idempotencyKey}`,
    p_entry_type: event.eventType,
    p_debit_account_key: debitKey,
    p_credit_account_key: creditKey,
    p_amount_minor: amountMinor,
    p_currency: event.currency ?? "JMD",
    p_product: product,
    p_organization_id: event.organizationId ?? null,
    p_effective_at: event.date ? `${event.date}T12:00:00.000Z` : new Date().toISOString(),
    p_reference_type: event.sourceType,
    p_reference_id: event.sourceId,
    p_metadata: event.metadata ?? {},
    p_source_system: "kv_ledger_event",
    p_source_id: event.id,
    p_source_idempotency_key: event.idempotencyKey,
  });

  logDualWriteMetric({
    source_system: "kv_ledger_event",
    status: posted.ok ? "ok" : "fail",
    reason: posted.ok ? "posted" : posted.error,
    source_id: event.id,
    entry_type: event.eventType,
    amount_minor: amountMinor,
  });
}

export async function fleetDualWriteToll(entry: {
  id: string;
  type: string;
  amount: number;
  currency?: string;
  driverId?: string | null;
  organizationId?: string | null;
  vehicleId?: string | null;
  date?: string;
}): Promise<void> {
  await dualWriteTollLedgerKv(entry);
}
