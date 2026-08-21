/**
 * Order chat window + participant access (source of truth for edge routes).
 * Client UX mirrors these constants via @roam/types — keep in sync.
 */

export type OrderChatPair =
  | "customer_courier"
  | "customer_merchant"
  | "merchant_courier"
  | "support";

export type OrderChatSenderRole =
  | "customer"
  | "merchant"
  | "courier"
  | "support"
  | "system";

export type OrderChatViewerRole = "customer" | "merchant" | "courier" | "support";

/** Grace windows (minutes) after nominal close status timestamp. */
export const ORDER_CHAT_GRACE_MINUTES: Record<OrderChatPair, number> = {
  customer_courier: 30,
  customer_merchant: 60,
  merchant_courier: 15,
  support: 0,
};

/** Statuses where the pair may accept new messages (before grace). */
export const ORDER_CHAT_OPEN_STATUSES: Record<OrderChatPair, readonly string[]> = {
  customer_courier: ["assigned", "picked_up", "in_transit", "delivered"],
  customer_merchant: [
    "accepted",
    "preparing",
    "ready",
    "assigned",
    "picked_up",
    "in_transit",
    "delivered",
  ],
  merchant_courier: ["assigned", "picked_up"],
  support: [], // ops-controlled; not status-derived
};

export const ORDER_CHAT_PAIR_FLAGS: Record<Exclude<OrderChatPair, "support">, string> = {
  customer_courier: "ORDER_CHAT_CUSTOMER_COURIER",
  merchant_courier: "ORDER_CHAT_MERCHANT_COURIER",
  customer_merchant: "ORDER_CHAT_CUSTOMER_MERCHANT",
};

export type OrderChatOrderRow = {
  id: string;
  status: string;
  customer_id?: string | null;
  merchant_id?: string | null;
  courier_id?: string | null;
  customer_user_id?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
};

export function parseOrderChatPair(raw: string | null | undefined): OrderChatPair | null {
  if (
    raw === "customer_courier" ||
    raw === "customer_merchant" ||
    raw === "merchant_courier" ||
    raw === "support"
  ) {
    return raw;
  }
  return null;
}

function addMinutes(iso: string | null | undefined, minutes: number, now: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return now.getTime() <= t + minutes * 60_000;
}

/**
 * Whether the pair window is open for *writes* at `now`.
 * Cancelled → always closed. Support pair is never status-derived (caller gates).
 */
export function isOrderChatWindowOpen(
  order: OrderChatOrderRow,
  pair: OrderChatPair,
  now: Date = new Date(),
): boolean {
  if (pair === "support") return true;
  const status = String(order.status ?? "");
  if (status === "cancelled") return false;

  const openStatuses = ORDER_CHAT_OPEN_STATUSES[pair];
  const grace = ORDER_CHAT_GRACE_MINUTES[pair];

  if (pair === "customer_courier") {
    if (openStatuses.includes(status) && status !== "delivered") return true;
    if (status === "delivered" || status === "completed") {
      return addMinutes(order.delivered_at, grace, now);
    }
    return false;
  }

  if (pair === "customer_merchant") {
    if (openStatuses.includes(status) && status !== "delivered") return true;
    if (status === "delivered" || status === "completed") {
      return addMinutes(order.delivered_at, grace, now);
    }
    return false;
  }

  if (pair === "merchant_courier") {
    if (status === "assigned") return true;
    // After pickup: short grace for "forgot drinks" / wrong bag
    if (["picked_up", "in_transit", "delivered", "completed"].includes(status)) {
      return addMinutes(order.picked_up_at, grace, now);
    }
    return false;
  }

  return false;
}

/** UX: explain why chat entry is missing before courier assignment. */
export function isOrderChatPreAssignment(
  order: OrderChatOrderProps,
  pair: OrderChatPair,
): boolean {
  if (pair !== "customer_courier" && pair !== "merchant_courier") return false;
  const status = String(order.status ?? "");
  return ["placed", "accepted", "preparing", "ready"].includes(status) && !order.courier_id;
}

export function pairAllowsViewerRole(
  pair: OrderChatPair,
  role: OrderChatViewerRole,
): boolean {
  switch (pair) {
    case "customer_courier":
      return role === "customer" || role === "courier" || role === "support";
    case "customer_merchant":
      return role === "customer" || role === "merchant" || role === "support";
    case "merchant_courier":
      return role === "merchant" || role === "courier" || role === "support";
    case "support":
      return role === "customer" || role === "merchant" || role === "courier" || role === "support";
    default:
      return false;
  }
}

export function mapViewerToSenderRole(role: OrderChatViewerRole): OrderChatSenderRole {
  if (role === "support") return "support";
  if (role === "merchant") return "merchant";
  if (role === "courier") return "courier";
  return "customer";
}

export type AssertOrderChatAccessOk = {
  ok: true;
  viewerRole: OrderChatViewerRole;
  senderRole: OrderChatSenderRole;
  chatOpen: boolean;
  courierUserId: string | null;
};

export type AssertOrderChatAccessFail = {
  ok: false;
  error: "forbidden" | "chat_not_available" | "pair_disabled" | "pre_assignment";
  status: number;
  message?: string;
};

/**
 * Identity + pair visibility + write window.
 * For GET history after close: pass `requireOpen: false` to allow reads while writes stay blocked.
 */
export function assertOrderChatAccess(opts: {
  order: OrderChatOrderProps;
  pair: OrderChatPair;
  userId: string;
  viewerRole: OrderChatViewerRole | null;
  now?: Date;
  requireOpen?: boolean;
  pairEnabled?: boolean;
}): AssertOrderChatAccessOk | AssertOrderChatAccessFail {
  const {
    order,
    pair,
    userId,
    viewerRole,
    now = new Date(),
    requireOpen = true,
    pairEnabled = true,
  } = opts;

  if (!viewerRole) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  if (!pairAllowsViewerRole(pair, viewerRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  if (pair !== "support" && !pairEnabled) {
    return { ok: false, error: "pair_disabled", status: 403, message: "Chat pair is disabled." };
  }

  if (viewerRole === "courier") {
    const assigned = order.courier_id ? String(order.courier_id) : null;
    if (!assigned || assigned !== userId) {
      return { ok: false, error: "forbidden", status: 403 };
    }
  }

  if (isOrderChatPreAssignment(order, pair) && requireOpen) {
    return {
      ok: false,
      error: "pre_assignment",
      status: 403,
      message: "A courier will be assigned soon.",
    };
  }

  const chatOpen = pair === "support" ? true : isOrderChatWindowOpen(order, pair, now);

  if (requireOpen && !chatOpen) {
    return { ok: false, error: "chat_not_available", status: 403 };
  }

  // After cancel, history remains readable (requireOpen=false) but never writable
  if (String(order.status) === "cancelled" && requireOpen) {
    return { ok: false, error: "chat_not_available", status: 403 };
  }

  return {
    ok: true,
    viewerRole,
    senderRole: mapViewerToSenderRole(viewerRole),
    chatOpen,
    courierUserId: order.courier_id ? String(order.courier_id) : null,
  };
}
