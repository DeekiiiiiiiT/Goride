import type { Order } from '../types/order';

export type OrderTabFilter = 'placed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type OrderSortOrder = 'oldest' | 'newest';

export interface OrderStatusCounts {
  placed: number;
  preparing: number;
  ready: number;
}

export function filterOrdersByTab(orders: Order[], filter: OrderTabFilter): Order[] {
  if (filter === 'placed') {
    return orders.filter((o) => o.status === 'placed');
  }
  if (filter === 'preparing') {
    return orders.filter((o) => ['accepted', 'preparing'].includes(o.status));
  }
  if (filter === 'ready') {
    return orders.filter((o) => o.status === 'ready');
  }
  return orders;
}

export function sortOrders(orders: Order[], sortOrder: OrderSortOrder): Order[] {
  return [...orders].sort((a, b) => {
    const aTime = new Date(a.placed_at || a.created_at).getTime();
    const bTime = new Date(b.placed_at || b.created_at).getTime();
    return sortOrder === 'oldest' ? aTime - bTime : bTime - aTime;
  });
}

export function countOrdersByStatus(orders: Order[]): OrderStatusCounts {
  return {
    placed: orders.filter((o) => o.status === 'placed').length,
    preparing: orders.filter((o) => ['accepted', 'preparing'].includes(o.status)).length,
    ready: orders.filter((o) => o.status === 'ready').length,
  };
}

export function getActiveQueueOrders(orders: Order[], sortOrder: OrderSortOrder): Order[] {
  const active = orders.filter((order) =>
    ['placed', 'accepted', 'preparing', 'ready'].includes(order.status),
  );
  return sortOrders(active, sortOrder);
}

export function computeTodayStats(orders: Order[], avgPrepMins: number) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = orders.filter((order) => {
    const orderDate = new Date(order.placed_at || order.created_at);
    return orderDate >= todayStart && order.status !== 'cancelled';
  });

  return {
    ordersToday: todayOrders.length,
    revenue: todayOrders.reduce((sum, order) => sum + order.total, 0),
    avgPrepMins: avgPrepMins || 12,
  };
}
