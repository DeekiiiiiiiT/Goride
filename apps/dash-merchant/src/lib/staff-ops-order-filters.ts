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
