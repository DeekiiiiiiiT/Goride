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
    idempotencyKey?: string;
    /** The refund journal already charged the restaurant. Do not charge them again. */
    skipLedger?: boolean;
  },
): Promise<void> {
  const amount = Math.round(opts.amount * 100) / 100;
  if (!opts.merchantId || amount <= 0) return;

  const idempotencyKey = opts.idempotencyKey ?? `fault_debit:${opts.orderId}:${opts.reason}`;
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

  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - periodStart.getDay());
  const periodKey = periodStart.toISOString().slice(0, 10);
  await serviceSb.rpc("add_merchant_fault_balance", {
    p_merchant: opts.merchantId,
    p_period: periodKey,
    p_amount: amount,
  });

  if (opts.skipLedger) return;

  const publicDb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const minor = Math.round(amount * 100);
  await publicDb.rpc("rush_post_journal", {
    p_idempotency_key: idempotencyKey,
    p_event_type: "merchant_fault",
    p_order_id: opts.orderId,
    p_correlation_id: null,
    p_lines: [
      { kind: "merchant_receivable", party_type: "merchant", party_id: opts.merchantId, component: "fault", amount_minor: minor },
      { kind: "platform_revenue", party_type: "platform", party_id: null, component: "fault", amount_minor: -minor },
    ],
    p_actor_type: "admin",
    p_actor_id: opts.createdBy ?? null,
    p_reason: opts.reason,
    p_evidence: {},
    p_policy_version: "rush-money-2026-10-04",
  });
}
