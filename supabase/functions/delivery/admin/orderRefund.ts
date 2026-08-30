/**
 * Admin order refund orchestration — one money path via payments.refunds.
 * Queues pending row always; provider execution via POST /payments/refunds when called with auth.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ProductAdminUser } from "../../_shared/productAdmin.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";
import { maybeClawbackGrowthGuarantee } from "../growthGuarantee.ts";

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

export type RefundOrchestratorResult =
  | {
      ok: true;
      refund: Record<string, unknown>;
      payment_status: string;
      providerCompleted: boolean;
      providerError?: string;
    }
  | { ok: false; status: number; error: string };

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** Resolve eligible refund amount and create/execute refund for an order. */
export async function orchestrateOrderRefund(opts: {
  orderId: string;
  amount?: number | null;
  reason: string;
  admin: ProductAdminUser;
  authHeader: string;
}): Promise<RefundOrchestratorResult> {
  const { orderId, reason, admin, authHeader } = opts;
  const db = getDb();
  const pdb = getPaymentsDb();

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, payment_status, total, customer_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return { ok: false, status: 404, error: "Order not found" };
  }

  const priorOrderStatus = String((order as { status?: string }).status ?? "");
  const paymentStatus = String(order.payment_status || "");
  if (!["paid", "refund_pending", "partially_refunded"].includes(paymentStatus)) {
    return {
      ok: false,
      status: 400,
      error: `Cannot refund order with payment_status=${paymentStatus || "unknown"}`,
    };
  }

  const { data: txn } = await pdb
    .from("transactions")
    .select("id, amount, currency, status")
    .eq("order_id", orderId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!txn?.id) {
    return { ok: false, status: 400, error: "No completed payment transaction for this order" };
  }

  const paidAmount = Number(txn.amount) || 0;
  const { data: priorRefunds } = await pdb
    .from("refunds")
    .select("amount, status")
    .eq("order_id", orderId)
    .in("status", ["pending", "completed"]);

  const alreadyRefunded = (priorRefunds || []).reduce(
    (sum, r) => sum + Number((r as { amount?: number }).amount || 0),
    0,
  );
  const eligible = roundMoney(Math.max(0, paidAmount - alreadyRefunded));
  if (eligible <= 0) {
    return { ok: false, status: 400, error: "Order has no remaining refundable amount" };
  }

  const requested = opts.amount != null ? roundMoney(Number(opts.amount)) : eligible;
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, status: 400, error: "Refund amount must be positive" };
  }
  if (requested > eligible + 0.001) {
    return {
      ok: false,
      status: 400,
      error: `Refund amount exceeds eligible ${eligible.toFixed(2)}`,
    };
  }

  const refundAmount = requested;
  const isFull = refundAmount >= eligible - 0.001;

  // Prefer payments edge for provider execution (forwards admin JWT)
  const paymentsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payments/refunds`;
  let refundRow: Record<string, unknown> | null = null;
  let providerCompleted = false;
  let providerError: string | undefined;

  try {
    const res = await fetch(paymentsUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactionId: txn.id,
        amount: refundAmount,
        reason,
      }),
    });
    const json = await res.json().catch(() => ({})) as {
      refund?: Record<string, unknown>;
      error?: string;
    };
    if (json.refund) {
      refundRow = json.refund;
      providerCompleted = String(json.refund.status) === "completed";
      if (!res.ok && json.error) providerError = json.error;
    } else if (!res.ok) {
      // Fall through to direct queue insert
      providerError = json.error || `payments/refunds ${res.status}`;
    }
  } catch (e) {
    providerError = e instanceof Error ? e.message : "payments/refunds unreachable";
  }

  // Queue-first honesty: if payments call did not create a row, insert pending locally
  if (!refundRow) {
    const { data: inserted, error: insertErr } = await pdb
      .from("refunds")
      .insert({
        transaction_id: txn.id,
        order_id: orderId,
        amount: refundAmount,
        currency: (txn as { currency?: string }).currency || "JMD",
        reason,
        status: "pending",
        initiated_by: admin.id,
      })
      .select()
      .single();
    if (insertErr || !inserted) {
      return {
        ok: false,
        status: 500,
        error: insertErr?.message || providerError || "Failed to queue refund",
      };
    }
    refundRow = inserted as Record<string, unknown>;
  }

  const nextPaymentStatus = providerCompleted
    ? (isFull ? "refunded" : "partially_refunded")
    : "refund_pending";

  await db
    .from("orders")
    .update({ payment_status: nextPaymentStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  await db.from("order_events").insert({
    order_id: orderId,
    status: "refund",
    actor_type: "admin",
    actor_id: admin.id,
    notes: `${reason} | amount=${refundAmount} | ${nextPaymentStatus}`,
  });

  await writeKvAudit(
    admin,
    "roam_dash.order_refund",
    orderId,
    admin.email,
    `amount=${refundAmount} status=${nextPaymentStatus} reason=${reason}`,
  );

  // Full refund of a delivered/completed order — claw GG share if period was credited
  if (isFull && nextPaymentStatus === "refunded") {
    try {
      await maybeClawbackGrowthGuarantee(db, {
        orderId,
        priorStatus: priorOrderStatus,
      });
    } catch (e) {
      console.error("[gg-clawback] full refund", e);
    }
  }

  return {
    ok: true,
    refund: refundRow,
    payment_status: nextPaymentStatus,
    providerCompleted,
    providerError,
  };
}
