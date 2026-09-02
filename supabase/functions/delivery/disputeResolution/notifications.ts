import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { orchestrateSystemOrderRefund } from "../admin/orderRefund.ts";

/** Best-effort customer notification via order_events audit trail. */
export async function notifyDisputeResolution(
  serviceSb: SupabaseClient,
  opts: {
    orderId: string;
    customerUserId?: string | null;
    event: "case_created" | "case_resolved" | "refund_issued" | "redispatch";
    message: string;
    refundAmount?: number;
  },
): Promise<void> {
  await serviceSb.from("order_events").insert({
    order_id: opts.orderId,
    status: `dispute_${opts.event}`,
    actor_type: "system",
    actor_id: opts.customerUserId ?? null,
    notes: opts.message,
  });

  // SMS for high-signal events when customer order status helper exists
  if (opts.event === "refund_issued" || opts.event === "redispatch") {
    try {
      const { notifyCustomerOrderStatus } = await import("../../_shared/dashOrderSms.ts");
      const status = opts.event === "refund_issued" ? "refunded" : "accepted";
      await notifyCustomerOrderStatus(serviceSb, opts.orderId, status);
    } catch {
      // non-fatal
    }
  }
}

export async function notifyCaseStatusChange(
  serviceSb: SupabaseClient,
  caseRow: Record<string, unknown>,
  status: string,
): Promise<void> {
  const orderId = caseRow.order_id as string | undefined;
  if (!orderId) return;

  let customerUserId: string | null = null;
  if (caseRow.customer_id) {
    const { data: customer } = await serviceSb
      .from("customers")
      .select("user_id")
      .eq("id", caseRow.customer_id)
      .maybeSingle();
    customerUserId = customer?.user_id as string | null;
  }

  const event = status === "resolved" || status === "closed" ? "case_resolved" : "case_created";
  await notifyDisputeResolution(serviceSb, {
    orderId,
    customerUserId,
    event,
    message: `Support case ${String(caseRow.id).slice(0, 8)} — ${status}`,
  });
}

/** Drain pending refunds where provider credentials may be missing. */
export async function processPendingRefunds(
  serviceSb: SupabaseClient,
  limit = 25,
): Promise<{ processed: number; failed: number }> {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const pdb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );

  const { data: pending } = await pdb
    .from("refunds")
    .select("id, order_id, amount, reason")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  let failed = 0;

  for (const row of pending ?? []) {
    const orderId = String(row.order_id || "");
    if (!orderId) {
      failed += 1;
      continue;
    }
    const result = await orchestrateSystemOrderRefund({
      orderId,
      amount: Number(row.amount),
      reason: String(row.reason || "Pending refund retry"),
      initiatedBy: "system",
    });
    if (result.ok) processed += 1;
    else failed += 1;
  }

  return { processed, failed };
}
