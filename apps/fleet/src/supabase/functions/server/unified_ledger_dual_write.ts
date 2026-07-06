/**
 * Fleet edge — unified ledger dual-write (mirrors supabase/functions/_shared/unifiedLedger).
 */
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

function dualWriteEnabled(): boolean {
  const v = Deno.env.get("LEDGER_DUAL_WRITE_ENABLED");
  return v === "1" || v === "true" || v === "yes";
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

async function postEntry(params: Record<string, unknown>): Promise<void> {
  const { error } = await sb().rpc("ledger_post_entry", params);
  if (error) console.error("[fleet unifiedLedger]", error.message);
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
  if (!dualWriteEnabled() || event.direction === "neutral") return;
  const amountMinor = majorToMinor(event.netAmount);
  if (amountMinor <= 0) return;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hasValidDriverId = uuidRe.test(event.driverId);
  const driverKey = hasValidDriverId
    ? `user:${event.driverId}:driver:digital`
    : (event.organizationId ? `org:${event.organizationId}:fleet` : "platform:clearing");
  const inflow = event.direction === "inflow";

  // Product: roam_driver for driver earnings, roam_fleet for org-level
  const product = hasValidDriverId ? "roam_driver" : "roam_fleet";

  await postEntry({
    p_idempotency_key: `kv_ledger_event:${event.idempotencyKey}`,
    p_entry_type: event.eventType,
    p_debit_account_key: inflow ? "platform:clearing" : driverKey,
    p_credit_account_key: inflow ? driverKey : "platform:clearing",
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
  if (!dualWriteEnabled()) return;
  const amountMinor = majorToMinor(entry.amount);
  if (amountMinor <= 0) return;

  const fleetKey = entry.organizationId
    ? `org:${entry.organizationId}:fleet`
    : "platform:clearing";
  const isUsage = entry.type === "usage" || entry.amount < 0;

  await postEntry({
    p_idempotency_key: `kv_toll_ledger:${entry.id}`,
    p_entry_type: `toll_${entry.type}`,
    p_debit_account_key: isUsage ? fleetKey : "platform:clearing",
    p_credit_account_key: isUsage ? "platform:clearing" : fleetKey,
    p_amount_minor: amountMinor,
    p_currency: entry.currency ?? "JMD",
    p_product: "roam_fleet",  // Fleet operations (Fleet Plus feature)
    p_organization_id: entry.organizationId ?? null,
    p_effective_at: entry.date ? `${entry.date}T12:00:00.000Z` : new Date().toISOString(),
    p_reference_type: "toll",
    p_reference_id: entry.id,
    p_metadata: {
      driver_id: entry.driverId,
      vehicle_id: entry.vehicleId,
      toll_type: entry.type,
    },
    p_source_system: "kv_toll_ledger",
    p_source_id: entry.id,
  });
}
