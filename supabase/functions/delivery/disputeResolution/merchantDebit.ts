import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

/** Debit merchant payout for merchant-fault refunds/disputes. */
export async function applyMerchantFaultDebit(
  serviceSb: SupabaseClient,
  opts: {
    merchantId: string;
    orderId: string;
    amount: number;
    reason: string;
    createdBy?: string | null;
  },
): Promise<void> {
  const amount = Math.round(opts.amount * 100) / 100;
  if (!opts.merchantId || amount <= 0) return;

  const idempotencyKey = `fault_debit:${opts.orderId}`;
  const pdb = getPaymentsDb();

  const { data: existing } = await pdb
    .from("merchant_adjustments")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing?.id) return;

  await pdb.from("merchant_adjustments").insert({
    merchant_id: opts.merchantId,
    amount: -amount,
    reason: opts.reason,
    created_by: opts.createdBy ?? null,
    idempotency_key: idempotencyKey,
  });

  // Bump chargeback balance on performance snapshot
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - periodStart.getDay());
  const periodKey = periodStart.toISOString().slice(0, 10);

  const { data: snap } = await serviceSb
    .from("merchant_performance_snapshots")
    .select("id, chargeback_balance, forgotten_order_count")
    .eq("merchant_id", opts.merchantId)
    .eq("period_start", periodKey)
    .maybeSingle();

  if (snap?.id) {
    await serviceSb
      .from("merchant_performance_snapshots")
      .update({
        chargeback_balance: Number(snap.chargeback_balance || 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", snap.id);
  } else {
    await serviceSb.from("merchant_performance_snapshots").insert({
      merchant_id: opts.merchantId,
      period_start: periodKey,
      chargeback_balance: amount,
      forgotten_order_count: 0,
    });
  }
}
