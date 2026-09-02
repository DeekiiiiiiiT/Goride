import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Recompute rolling merchant performance snapshots and visibility penalties. */
export async function refreshMerchantPerformanceSnapshots(
  serviceSb: SupabaseClient,
): Promise<{ updated: number }> {
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - periodStart.getDay());
  const periodKey = periodStart.toISOString().slice(0, 10);
  const since = `${periodKey}T00:00:00.000Z`;

  const { data: merchants } = await serviceSb
    .from("merchants")
    .select("id")
    .eq("is_active", true);

  let updated = 0;
  for (const merchant of merchants ?? []) {
    const merchantId = String(merchant.id);

    const { data: orders } = await serviceSb
      .from("orders")
      .select("id, status, placed_at, accepted_at, ready_at, cancelled_by, cancellation_reason")
      .eq("merchant_id", merchantId)
      .gte("placed_at", since);

    const orderList = orders ?? [];
    const cancelled = orderList.filter((o) => String(o.status) === "cancelled");
    const merchantFaultCancels = cancelled.filter(
      (o) => String(o.cancelled_by) === "merchant" ||
        String(o.cancellation_reason || "").toLowerCase().includes("merchant"),
    );
    const cancellationFaultRate = orderList.length > 0
      ? merchantFaultCancels.length / orderList.length
      : 0;

    const { data: disputes } = await serviceSb
      .from("order_disputes")
      .select("id, fault_attribution, order_id")
      .eq("fault_attribution", "merchant_fault")
      .gte("created_at", since);

    const merchantOrderIds = new Set(orderList.map((o) => String(o.id)));
    const forgottenCount = (disputes ?? []).filter((d) =>
      merchantOrderIds.has(String(d.order_id)),
    ).length;

    let avgPrepDelay = 0;
    let prepSamples = 0;
    for (const o of orderList) {
      if (o.accepted_at && o.ready_at) {
        const mins = (new Date(String(o.ready_at)).getTime() - new Date(String(o.accepted_at)).getTime()) / 60000;
        if (mins > 0) avgPrepDelay += mins;
        prepSamples += 1;
      }
    }
    if (prepSamples > 0) avgPrepDelay /= prepSamples;

    const { data: chargebacks } = await serviceSb
      .from("merchant_performance_snapshots")
      .select("chargeback_balance")
      .eq("merchant_id", merchantId)
      .eq("period_start", periodKey)
      .maybeSingle();

    let visibilityTier = "none";
    if (forgottenCount >= 3 || cancellationFaultRate >= 0.1) visibilityTier = "warning";
    if (forgottenCount >= 5 || cancellationFaultRate >= 0.15) visibilityTier = "reduced";
    if (forgottenCount >= 8 || cancellationFaultRate >= 0.25) visibilityTier = "suspended";

    await serviceSb.from("merchant_performance_snapshots").upsert({
      merchant_id: merchantId,
      period_start: periodKey,
      forgotten_order_count: forgottenCount,
      avg_prep_delay_minutes: Math.round(avgPrepDelay * 10) / 10,
      cancellation_fault_rate: Math.round(cancellationFaultRate * 1000) / 1000,
      chargeback_balance: Number(chargebacks?.chargeback_balance || 0),
      visibility_penalty_tier: visibilityTier,
      updated_at: new Date().toISOString(),
    }, { onConflict: "merchant_id,period_start" });

    updated += 1;
  }

  return { updated };
}
