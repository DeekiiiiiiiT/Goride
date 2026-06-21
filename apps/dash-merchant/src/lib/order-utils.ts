import type { Order, OrderItem } from '../types/order';

export type HistoryDateRange = 'today' | 'yesterday' | 'week' | 'custom';

export interface CustomDateRange {
  start: string;
  end: string;
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString('en-JM', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatCompletedAt(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return `Completed today at ${formatTime(dateString)}`;
  return `Completed ${date.toLocaleDateString('en-JM', { month: 'short', day: 'numeric' })} at ${formatTime(dateString)}`;
}

export function getDurationMinutes(from: string, to?: string | null) {
  const end = to ? new Date(to).getTime() : Date.now();
  const start = new Date(from).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

export function splitInstructions(instructions?: string) {
  if (!instructions?.trim()) return [];
  return instructions
    .split(/[\n;]+/)
    .map((line) => line.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export const HANDOFF_CHECKLIST_ITEMS = [
  'Order sealed and bagged',
  'Receipt included',
  'All items present',
] as const;

export const TIMELINE_STEPS = [
  { key: 'placed', label: 'Order Placed', field: 'placed_at' as const },
  { key: 'accepted', label: 'Order Accepted', field: 'accepted_at' as const },
  { key: 'ready', label: 'Ready for Pickup', field: 'ready_at' as const },
  { key: 'picked_up', label: 'Picked Up by Courier', field: 'picked_up_at' as const },
  { key: 'delivered', label: 'Delivered to Customer', field: 'delivered_at' as const },
];

export function getItemModifiersText(item: OrderItem) {
  const lines =
    item.options?.flatMap((option) => {
      const selections = option.selections?.map((s) => s.name).join(', ') ?? '';
      if (!selections) return [];
      return `${option.name}: ${selections}`;
    }) ?? [];
  if (lines.length === 0) return '';
  return lines
    .map((line) => line.split(': ').pop())
    .filter(Boolean)
    .join(', ');
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function getOrderHistoryDate(order: Order) {
  return new Date(order.delivered_at || order.cancelled_at || order.placed_at || order.created_at);
}

export function filterOrdersByDateRange(
  orders: Order[],
  range: HistoryDateRange,
  customRange?: CustomDateRange,
) {
  const todayStart = startOfDay(new Date());

  return orders.filter((order) => {
    const date = getOrderHistoryDate(order);

    if (range === 'today') return date >= todayStart;

    if (range === 'yesterday') {
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      return date >= yesterdayStart && date < todayStart;
    }

    if (range === 'week') {
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      return date >= weekStart;
    }

    if (range === 'custom' && customRange?.start && customRange?.end) {
      const start = startOfDay(new Date(customRange.start));
      const end = startOfDay(new Date(customRange.end));
      end.setHours(23, 59, 59, 999);
      return date >= start && date <= end;
    }

    return true;
  });
}

export function formatItemCountLabel(count: number) {
  return `${count} Item${count === 1 ? '' : 's'}`;
}

export function formatItemsSummary(order: Order) {
  return order.items
    .map((item) => (item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name))
    .join(', ');
}

export function getCancelledByLabel(cancelledBy?: string | null) {
  if (!cancelledBy) return 'System';
  if (cancelledBy === 'merchant') return 'Restaurant';
  if (cancelledBy === 'customer') return 'Customer';
  return cancelledBy.charAt(0).toUpperCase() + cancelledBy.slice(1);
}

export function computeAvgPrepTimeMins(orders: Order[]) {
  const durations = orders
    .map((order) => {
      const start = order.preparing_at || order.accepted_at;
      const end = order.ready_at;
      if (!start || !end) return null;
      return getDurationMinutes(start, end);
    })
    .filter((value): value is number => value != null);

  if (durations.length === 0) return null;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

export function computeCancellationRatePercent(completed: number, cancelled: number) {
  const total = completed + cancelled;
  if (total === 0) return 0;
  return Math.round((cancelled / total) * 100);
}

export function exportOrdersToCsv(orders: Order[], filename: string) {
  const headers = ['Order', 'Status', 'Time', 'Total', 'Items'];
  const rows = orders.map((order) => [
    order.order_number,
    order.status,
    formatTime(getOrderHistoryDate(order).toISOString()),
    order.total,
    formatItemsSummary(order),
  ]);

  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
