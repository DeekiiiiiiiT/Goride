/**
 * One refund path. The same row is retried. The ledger posts only after the provider confirms.
 */
import type { ProductAdminUser } from "../../_shared/productAdmin.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";
import { maybeClawbackGrowthGuarantee } from "../growthGuarantee.ts";
import { queueAndExecuteRefund } from "../../_shared/rushMoney/executeRefund.ts";

export type RefundOrchestratorResult =
  | {
      ok: true;
      refund: Record<string, unknown>;
      payment_status: string;
      providerCompleted: boolean;
      providerError?: string;
    }
  | { ok: false; status: number; error: string };

/** Resolve eligible refund amount and create/execute refund for an order. */
export async function orchestrateOrderRefund(opts: {
  orderId: string;
  amount?: number | null;
  reason: string;
  admin: ProductAdminUser;
  authHeader: string;
  idempotencyKey?: string;
  fault?: string | null;
}): Promise<RefundOrchestratorResult> {
  const { orderId, reason, admin } = opts;
  const db = getDb();

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, payment_status, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return { ok: false, status: 404, error: "Order not found" };
  }

  const priorOrderStatus = String((order as { status?: string }).status ?? "");
  const queued = await queueAndExecuteRefund({
    orderId,
    amount: opts.amount,
    reason,
    fault: opts.fault ?? null,
    initiatedBy: admin.id,
    idempotencyKey: opts.idempotencyKey
      ?? `refund:${orderId}:${opts.amount ?? "full"}:${reason}`.slice(0, 180),
  });
  if (!queued.ok) return queued;

  const refundAmount = Number(queued.refund.amount ?? opts.amount ?? 0);
  const nextPaymentStatus = queued.payment_status;

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

  if (nextPaymentStatus === "refunded") {
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
    refund: queued.refund,
    payment_status: nextPaymentStatus,
    providerCompleted: queued.providerCompleted,
    providerError: queued.providerError,
  };
}

/** System/customer-initiated refund without admin JWT. */
export async function orchestrateSystemOrderRefund(opts: {
  orderId: string;
  amount?: number | null;
  reason: string;
  initiatedBy: "customer" | "system";
  actorId?: string | null;
  idempotencyKey?: string;
  fault?: string | null;
}): Promise<RefundOrchestratorResult> {
  const syntheticAdmin = {
    id: opts.actorId || "system",
    email: opts.initiatedBy === "customer" ? "customer-self-serve" : "system-auto",
    roles: [] as string[],
  };
  return orchestrateOrderRefund({
    orderId: opts.orderId,
    amount: opts.amount,
    reason: opts.    reason,
    fault: opts.fault ?? null,
    admin: syntheticAdmin as ProductAdminUser,
    authHeader: "",
    idempotencyKey: opts.idempotencyKey ?? `cancel:${opts.orderId}`,
  });
}
