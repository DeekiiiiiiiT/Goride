import { describe, expect, it } from 'vitest';
import {
  activeStatusesForChannel,
  buildItemPrepStationLookup,
  counterOrdersForTab,
  counterReadyTabLabel,
  filterOrderItemsForPrepStation,
  itemMatchesBarStations,
  kitchenQueueForPrepStation,
  kitchenQueueOrders,
  orderHasPrepStationItems,
  resolveBarPrepStationIds,
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
      'assigned',
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

  it('routes menu items to prep stations and keeps unassigned on all lines', () => {
    const lookup = buildItemPrepStationLookup([
      { id: 'burger', name: 'Burger', prep_station_id: 'grill' },
      { id: 'fries', name: 'Fries', prep_station_id: 'fry' },
      { id: 'coleslaw', name: 'Coleslaw', prep_station_id: null },
    ]);

    expect(orderHasPrepStationItems({ items: [{ name: 'Burger' }] }, 'grill', lookup)).toBe(true);
    expect(orderHasPrepStationItems({ items: [{ name: 'Fries' }] }, 'grill', lookup)).toBe(false);
    expect(orderHasPrepStationItems({ items: [{ name: 'Coleslaw' }] }, 'grill', lookup)).toBe(true);

    const filtered = filterOrderItemsForPrepStation(
      [
        { name: 'Burger' },
        { name: 'Fries' },
        { name: 'Coleslaw' },
      ],
      'grill',
      lookup,
    );
    expect(filtered.map((item) => item.name)).toEqual(['Burger', 'Coleslaw']);
  });

  it('filters kitchen queue tickets by prep station', () => {
    const lookup = buildItemPrepStationLookup([
      { id: 'burger', name: 'Burger', prep_station_id: 'grill' },
      { id: 'fries', name: 'Fries', prep_station_id: 'fry' },
    ]);
    const grillOrder = {
      id: '10',
      status: 'preparing',
      items: [{ name: 'Burger', quantity: 1, price: 10 }],
      accepted_at: '2026-01-01T10:00:00Z',
      placed_at: '2026-01-01T10:00:00Z',
      created_at: '2026-01-01T10:00:00Z',
    } as Order;
    const fryOrder = {
      id: '11',
      status: 'preparing',
      items: [{ name: 'Fries', quantity: 1, price: 5 }],
      accepted_at: '2026-01-01T10:01:00Z',
      placed_at: '2026-01-01T10:01:00Z',
      created_at: '2026-01-01T10:01:00Z',
    } as Order;

    expect(kitchenQueueForPrepStation([grillOrder, fryOrder], 'grill', lookup)).toEqual([grillOrder]);
    expect(kitchenQueueOrders([grillOrder, fryOrder])).toEqual([grillOrder, fryOrder]);
  });

  it('routes bar queue items by prep_station_id, not item name heuristics', () => {
    const lookup = buildItemPrepStationLookup([
      { id: 'soda', name: 'House Soda', prep_station_id: 'prep-bar' },
      { id: 'burger', name: 'Burger with drink deal', prep_station_id: 'grill' },
    ]);
    const barIds = resolveBarPrepStationIds([
      { id: 'prep-bar', name: 'Expo' },
      { id: 'grill', name: 'Grill' },
    ]);
    expect(barIds).toEqual(['prep-bar']);
    expect(
      itemMatchesBarStations({ menuItemId: 'soda', name: 'House Soda' }, barIds, lookup),
    ).toBe(true);
    expect(
      itemMatchesBarStations(
        { menuItemId: 'burger', name: 'Burger with drink deal' },
        barIds,
        lookup,
      ),
    ).toBe(false);
  });
});
