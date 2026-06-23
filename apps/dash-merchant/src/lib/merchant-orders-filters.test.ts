import { describe, expect, it } from 'vitest';
import type { Order } from '../types/order';
import {
  computeTodayStats,
  countOrdersByStatus,
  filterOrdersByTab,
  getActiveQueueOrders,
  sortOrders,
} from './merchant-orders-filters';

function makeOrder(overrides: Partial<Order> & Pick<Order, 'id' | 'status'>): Order {
  return {
    id: overrides.id,
    order_number: overrides.order_number ?? '1001',
    status: overrides.status,
    total: overrides.total ?? 1000,
    subtotal: overrides.subtotal ?? 900,
    delivery_fee: overrides.delivery_fee ?? 50,
    tax: overrides.tax ?? 50,
    tip: overrides.tip ?? 0,
    created_at: overrides.created_at ?? '2026-06-22T12:00:00Z',
    placed_at: overrides.placed_at ?? overrides.created_at ?? '2026-06-22T12:00:00Z',
    accepted_at: overrides.accepted_at ?? null,
    preparing_at: overrides.preparing_at ?? null,
    ready_at: overrides.ready_at ?? null,
    picked_up_at: overrides.picked_up_at ?? null,
    delivered_at: overrides.delivered_at ?? null,
    cancelled_at: overrides.cancelled_at ?? null,
    items: overrides.items ?? [],
    customer: overrides.customer ?? { id: 'c1', name: 'Test', phone: '555' },
    payment_method: overrides.payment_method ?? 'card',
  };
}

describe('merchant-orders-filters', () => {
  const orders = [
    makeOrder({ id: '1', status: 'placed', placed_at: '2026-06-22T10:00:00Z' }),
    makeOrder({ id: '2', status: 'accepted', placed_at: '2026-06-22T11:00:00Z' }),
    makeOrder({ id: '3', status: 'preparing', placed_at: '2026-06-22T12:00:00Z' }),
    makeOrder({ id: '4', status: 'ready', placed_at: '2026-06-22T13:00:00Z' }),
  ];

  it('filterOrdersByTab filters placed/preparing/ready', () => {
    expect(filterOrdersByTab(orders, 'placed')).toHaveLength(1);
    expect(filterOrdersByTab(orders, 'preparing')).toHaveLength(2);
    expect(filterOrdersByTab(orders, 'ready')).toHaveLength(1);
  });

  it('sortOrders sorts oldest and newest', () => {
    const oldest = sortOrders(orders, 'oldest');
    expect(oldest.map((o) => o.id)).toEqual(['1', '2', '3', '4']);
    const newest = sortOrders(orders, 'newest');
    expect(newest.map((o) => o.id)).toEqual(['4', '3', '2', '1']);
  });

  it('countOrdersByStatus returns tab badge counts', () => {
    expect(countOrdersByStatus(orders)).toEqual({
      placed: 1,
      preparing: 2,
      ready: 1,
    });
  });

  it('getActiveQueueOrders includes active statuses only', () => {
    const withCancelled = [
      ...orders,
      makeOrder({ id: '5', status: 'cancelled', placed_at: '2026-06-22T14:00:00Z' }),
    ];
    expect(getActiveQueueOrders(withCancelled, 'oldest')).toHaveLength(4);
  });

  it('computeTodayStats sums today orders', () => {
    const stats = computeTodayStats(
      [
        makeOrder({ id: '1', status: 'placed', total: 500, placed_at: new Date().toISOString() }),
        makeOrder({
          id: '2',
          status: 'cancelled',
          total: 999,
          placed_at: new Date().toISOString(),
        }),
      ],
      15,
    );
    expect(stats.ordersToday).toBe(1);
    expect(stats.revenue).toBe(500);
    expect(stats.avgPrepMins).toBe(15);
  });
});
