/**
 * Server enforcement of partner.orders.accept_deadline_seconds
 * and optional auto_reject_after_deadline.
 */
import { getSetting } from "../_shared/rushSettings/getSetting.ts";

// deno-lint-ignore no-explicit-any
type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

export type AcceptDeadlineResult =
  | { ok: true }
  | {
    ok: false;
    code: "accept_deadline_expired" | "auto_rejected";
    status: 409;
    error: string;
    order?: unknown;
  };

export async function secondsPastAcceptDeadline(placedAt: string | null | undefined): Promise<{
  overdue: boolean;
  deadlineSec: number;
  elapsedSec: number;
}> {
  const deadlineSec = await getSetting<number>("partner.orders.accept_deadline_seconds");
  if (!placedAt) {
    return { overdue: false, deadlineSec, elapsedSec: 0 };
  }
  const elapsedSec = Math.max(0, (Date.now() - new Date(placedAt).getTime()) / 1000);
  return { overdue: elapsedSec > deadlineSec, deadlineSec, elapsedSec };
}

/**
 * When merchant tries to accept a placed order past the deadline:
 * - always refuse accept
 * - if auto_reject_after_deadline, cancel the order as merchant timeout
 */
export async function enforcePartnerAcceptOnStatusChange(
  serviceSb: Sb,
  input: {
    orderId: string;
    currentStatus: string;
    nextStatus: string;
    placedAt?: string | null;
    actorId?: string | null;
  },
): Promise<AcceptDeadlineResult> {
  if (input.nextStatus !== "accepted" || input.currentStatus !== "placed") {
    return { ok: true };
  }

  const { overdue, deadlineSec } = await secondsPastAcceptDeadline(input.placedAt);
  if (!overdue) return { ok: true };

  const autoReject = await getSetting<boolean>("partner.orders.auto_reject_after_deadline");
  if (autoReject) {
    const { cancelOrder } = await import("./rushMoney/cancelOrder.ts");
    const result = await cancelOrder(serviceSb, {
      orderId: input.orderId,
      actor: "merchant",
      reason: `Auto-rejected: not accepted within ${deadlineSec}s`,
      actorId: input.actorId ?? null,
    });
    if (!result.ok) {
      return {
        ok: false,
        code: "accept_deadline_expired",
        status: 409,
        error: `Accept window of ${deadlineSec}s has expired`,
      };
    }
    return {
      ok: false,
      code: "auto_rejected",
      status: 409,
      error: `Order auto-rejected after ${deadlineSec}s without accept`,
      order: result.order,
    };
  }

  return {
    ok: false,
    code: "accept_deadline_expired",
    status: 409,
    error: `Accept window of ${deadlineSec}s has expired`,
  };
}

/** Cron/sweep: cancel placed orders past deadline when auto_reject is on. */
export async function autoRejectStalePlacedOrders(
  serviceSb: Sb,
  limit = 50,
): Promise<{ scanned: number; rejected: number }> {
  const autoReject = await getSetting<boolean>("partner.orders.auto_reject_after_deadline");
  if (!autoReject) return { scanned: 0, rejected: 0 };

  const deadlineSec = await getSetting<number>("partner.orders.accept_deadline_seconds");
  const cutoff = new Date(Date.now() - deadlineSec * 1000).toISOString();

  const { data: rows } = await serviceSb
    .from("orders")
    .select("id, placed_at")
    .eq("status", "placed")
    .lt("placed_at", cutoff)
    .order("placed_at", { ascending: true })
    .limit(limit);

  const list = rows ?? [];
  let rejected = 0;
  const { cancelOrder } = await import("./rushMoney/cancelOrder.ts");
  for (const row of list) {
    const result = await cancelOrder(serviceSb, {
      orderId: String(row.id),
      actor: "merchant",
      reason: `Auto-rejected: not accepted within ${deadlineSec}s`,
      actorId: null,
    });
    if (result.ok) rejected += 1;
  }
  return { scanned: list.length, rejected };
}
