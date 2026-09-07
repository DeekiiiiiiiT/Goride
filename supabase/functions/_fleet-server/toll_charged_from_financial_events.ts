/**
 * H-9 wallet "Charged to Drivers" from financial_events (active only).
 * Prefer this over unified-ledger dual-writes when the wallet table has rows —
 * it is what actually hit the driver period.
 */
import { getServiceClient } from "./service_client.ts";

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export async function sumActiveTollChargedToDriverMajor(opts: {
  weekKey: string;
  driverId?: string;
  organizationId?: string;
}): Promise<{ charged: number; hasEvents: boolean }> {
  const weekKey = String(opts.weekKey || "").slice(0, 10);
  let q = getServiceClient()
    .from("financial_events")
    .select("id, amount_minor, reverses_event_id, reversed_at, driver_id, organization_id")
    .eq("period_anchor", weekKey)
    .in("event_type", ["toll_charged_to_driver", "toll_charge_reversed"]);

  if (opts.driverId) q = q.eq("driver_id", opts.driverId);
  // Many historical wallet rows have organization_id NULL — do not exclude them
  // with a hard eq. When org is provided, accept matching org OR null.
  if (opts.organizationId) {
    q = q.or(`organization_id.eq.${opts.organizationId},organization_id.is.null`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data || [];
  if (rows.length === 0) return { charged: 0, hasEvents: false };

  const reversed = new Set<string>();
  for (const ev of rows) {
    if (ev.reverses_event_id) reversed.add(String(ev.reverses_event_id));
  }

  let charged = 0;
  let hasActive = false;
  for (const ev of rows) {
    if (ev.reverses_event_id || ev.reversed_at) continue;
    if (reversed.has(String(ev.id))) continue;
    hasActive = true;
    // amountMajor is −charge; negate → driver-debt-positive.
    charged = round2(charged - (Number(ev.amount_minor) || 0) / 100);
  }
  return { charged, hasEvents: hasActive || rows.length > 0 };
}
