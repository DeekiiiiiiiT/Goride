import { describe, expect, it } from 'vitest';
import {
  activeStatusesForChannel,
  counterOrdersForTab,
  counterReadyTabLabel,
  kitchenQueueOrders,
} from './staff-ops-order-filters';
import type { Order } from '../types/order';

const roamPlaced = { id: '1', status: 'placed', channel: 'roam_app' } as Order;
const roamReady = { id: '2', status: 'ready', channel: 'roam_app' } as Order;
const inStorePaid = {
  id: '3',
  status: 'paid',
  channel: 'in_store',
  created_at: '2026-01-01T10:00:00Z',
  placed_at: '2026-01-01T10:00:00Z',
} as Order;

describe('staff-ops-order-filters', () => {
  it('keeps roam-only active statuses', () => {
    expect(activeStatusesForChannel('roam_app')).toEqual([
      'placed',
      'accepted',
      'preparing',
      'ready',
    ]);
  });

  it('includes paid for unified channel', () => {
    expect(activeStatusesForChannel('all')).toContain('paid');
  });

  it('filters counter kitchen tab with in-store paid orders', () => {
    const kitchen = counterOrdersForTab([roamPlaced, inStorePaid], 'kitchen');
    expect(kitchen).toEqual([inStorePaid]);
  });

  it('builds kitchen queue with in-store paid', () => {
    expect(kitchenQueueOrders([roamReady, inStorePaid])).toEqual([inStorePaid]);
  });

  it('adapts ready tab label for hybrid merchants', () => {
    expect(counterReadyTabLabel(false)).toBe('Ready for Driver');
    expect(counterReadyTabLabel(true)).toBe('Ready for Pickup');
  });
});
