/**
 * Merchant analytics helpers — day-bucket aggregation + default date window.
 * Keeps heavy scan logic out of the route handler; route still owns auth.
 */

export type OrderRow = Record<string, unknown>;

export type DailyBucket = {
  key: string;
  label: string;
  revenue: number;
  orders: number;
};

export type AnalyticsDateRange = {
  fromDate: Date;
  toDate: Date;
  /** True when caller omitted from/to and we applied the default window. */
  usedDefaultWindow: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 30;

/** Cache-Control for merchant analytics JSON (short private cache). */
export const ANALYTICS_CACHE_CONTROL = "private, max-age=60";

/**
 * Resolve analytics window. Default: last 30 days through end of today (UTC calendar day).
 * Previously unbounded / "today only" defaults were easy to misuse for full-table scans.
 */
export function resolveAnalyticsDateRange(
  from?: string | null,
  to?: string | null,
  now: Date = new Date(),
): AnalyticsDateRange {
  const usedDefaultWindow = !from && !to;
  const toDate = to ? new Date(to) : new Date(now);
  if (!to) {
    toDate.setHours(23, 59, 59, 999);
  }

  let fromDate: Date;
  if (from) {
    fromDate = new Date(from);
  } else {
    fromDate = new Date(toDate.getTime() - (DEFAULT_LOOKBACK_DAYS - 1) * DAY_MS);
    fromDate.setHours(0, 0, 0, 0);
  }

  return { fromDate, toDate, usedDefaultWindow };
}

export function parseOrderItems(items: unknown): { name: string; quantity: number; price?: number }[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      name: String(row.name || "Unknown"),
      quantity: Number(row.quantity || 1),
      price: row.price != null ? Number(row.price) : undefined,
    };
  });
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayLabel(key: string): string {
  const d = new Date(key);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Precompute daily revenue/order counts from an already-fetched order set.
 * Call from GET /merchant/analytics after applying the date bound.
 */
export function aggregateAnalyticsByDay(orders: OrderRow[]): {
  delivered: OrderRow[];
  cancelled: OrderRow[];
  active: OrderRow[];
  totalRevenue: number;
  totalOrders: number;
  daily: DailyBucket[];
} {
  const delivered = orders.filter((o) => o.status === "delivered");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const active = orders.filter((o) =>
    ["placed", "accepted", "preparing", "ready"].includes(String(o.status))
  );

  const revenueByDay: Record<string, number> = {};
  const volumeByDay: Record<string, number> = {};

  for (const o of delivered) {
    const placed = new Date(String(o.placed_at || o.created_at));
    const key = dayKey(placed);
    revenueByDay[key] = (revenueByDay[key] || 0) + Number(o.subtotal || 0);
    volumeByDay[key] = (volumeByDay[key] || 0) + 1;
  }

  const keys = Object.keys(revenueByDay).sort();
  const daily: DailyBucket[] = keys.map((key) => ({
    key,
    label: dayLabel(key),
    revenue: revenueByDay[key] || 0,
    orders: volumeByDay[key] || 0,
  }));

  const totalRevenue = delivered.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
  return {
    delivered,
    cancelled,
    active,
    totalRevenue,
    totalOrders: delivered.length,
    daily,
  };
}
