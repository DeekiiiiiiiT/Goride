import type { Order } from '../types/order';
import type { MerchantOrdersChannel } from './merchant-orders-query';

/** Active statuses returned by the orders API for each channel scope. */
export function activeStatusesForChannel(channel: MerchantOrdersChannel): string[] {
  if (channel === 'roam_app') return ['placed', 'accepted', 'preparing', 'ready'];
  if (channel === 'in_store') return ['paid', 'preparing', 'ready'];
  return ['placed', 'accepted', 'preparing', 'ready', 'paid'];
}

export function counterOrdersForTab(orders: Order[], tab: 'new' | 'kitchen' | 'ready') {
  if (tab === 'new') return orders.filter((order) => order.status === 'placed');
  if (tab === 'kitchen') {
    return orders.filter(
      (order) =>
        order.status === 'accepted' ||
        order.status === 'preparing' ||
        (order.channel === 'in_store' && order.status === 'paid'),
    );
  }
  return orders.filter((order) => order.status === 'ready');
}

export function kitchenQueueOrders(orders: Order[]) {
  return orders
    .filter(
      (order) =>
        order.status === 'accepted' ||
        order.status === 'preparing' ||
        (order.channel === 'in_store' && order.status === 'paid'),
    )
    .sort(
      (a, b) =>
        new Date(a.accepted_at || a.placed_at || a.created_at).getTime() -
        new Date(b.accepted_at || b.placed_at || b.created_at).getTime(),
    );
}

export function counterReadyTabLabel(showInStoreOnCounter: boolean) {
  return showInStoreOnCounter ? 'Ready for Pickup' : 'Ready for Driver';
}

export interface ItemPrepStationLookup {
  byId: Map<string, string | null>;
  byName: Map<string, string | null>;
}

export function buildItemPrepStationLookup(
  menuItems: Array<{ id: string; name: string; prep_station_id?: string | null }>,
): ItemPrepStationLookup {
  const byId = new Map<string, string | null>();
  const byName = new Map<string, string | null>();
  for (const item of menuItems) {
    const prepId = item.prep_station_id ?? null;
    byId.set(item.id, prepId);
    byName.set(item.name.toLowerCase().trim(), prepId);
  }
  return { byId, byName };
}

export function resolveItemPrepStationId(
  item: { menuItemId?: string; name: string },
  lookup: ItemPrepStationLookup,
): string | null {
  if (item.menuItemId && lookup.byId.has(item.menuItemId)) {
    return lookup.byId.get(item.menuItemId) ?? null;
  }
  return lookup.byName.get(item.name.toLowerCase().trim()) ?? null;
}

/** Unassigned menu items appear on every prep-station KDS. */
export function itemMatchesPrepStation(
  item: { menuItemId?: string; name: string },
  prepStationId: string,
  lookup: ItemPrepStationLookup,
): boolean {
  const assigned = resolveItemPrepStationId(item, lookup);
  return assigned == null || assigned === prepStationId;
}

export function filterOrderItemsForPrepStation<T extends { menuItemId?: string; name: string }>(
  items: T[],
  prepStationId: string,
  lookup: ItemPrepStationLookup,
): T[] {
  return items.filter((item) => itemMatchesPrepStation(item, prepStationId, lookup));
}

export function orderHasPrepStationItems(
  order: { items: Array<{ menuItemId?: string; name: string }> },
  prepStationId: string,
  lookup: ItemPrepStationLookup,
): boolean {
  return filterOrderItemsForPrepStation(order.items, prepStationId, lookup).length > 0;
}

export function kitchenQueueForPrepStation(
  orders: Order[],
  prepStationId: string,
  lookup: ItemPrepStationLookup,
) {
  return kitchenQueueOrders(orders).filter((order) =>
    orderHasPrepStationItems(order, prepStationId, lookup),
  );
}
