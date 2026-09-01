/**
 * A-7: append settlement revision when paid/settlement fields change.
 */
import { getServiceClientWithSchema } from "./service_client.ts";

function sb() {
  return getServiceClientWithSchema("ledger");
}

export async function appendPeriodRevisionIfNeeded(
  driverId: string,
  periodAnchor: string,
  projectionVersion: number,
  body: Record<string, unknown>,
  prior?: { settlement_paid?: number | null; settlement_amount?: number | null; payout_net?: number | null },
): Promise<void> {
  const paid = Number(body.settlement_paid);
  const prevPaid = Number(prior?.settlement_paid) || 0;
  const paidChanged = Number.isFinite(paid) && Math.abs(paid - prevPaid) > 0.005;
  const statusChanged =
    body.settlement_status != null || body.payout_status != null;
  if (!paidChanged && !statusChanged) return;

  const meta = (body.metadata || {}) as Record<string, unknown>;
  const signed = meta.signedSnapshot;
  const { error } = await sb().from("driver_period_revisions").insert({
    driver_id: driverId,
    period_anchor: periodAnchor,
    projection_version: projectionVersion,
    settlement_paid: Number(body.settlement_paid) || 0,
    settlement_amount: Number(body.settlement_amount) || 0,
    payout_net: Number(body.payout_net) || 0,
    snapshot: signed && typeof signed === "object" ? signed : {},
    source_event_hash: body.source_event_hash ? String(body.source_event_hash) : null,
  });
  if (error) console.error("[period_revision] insert failed:", error.message);
}
