import type { Order } from '../../types/order';
import type { PinStatus, RosterMember } from '../../types/team';

const baseOrder: Omit<Order, 'id' | 'order_number' | 'status' | 'items'> = {
  total: 3200,
  subtotal: 2800,
  delivery_fee: 300,
  tax: 100,
  tip: 0,
  created_at: new Date().toISOString(),
  placed_at: new Date().toISOString(),
  accepted_at: null,
  preparing_at: null,
  ready_at: null,
  picked_up_at: null,
  delivered_at: null,
  cancelled_at: null,
  customer: { id: 'c1', name: 'Marcus B.', phone: '+18765550123' },
  payment_method: 'card',
};

export const MOCK_COUNTER_ORDERS: Order[] = [
  {
    ...baseOrder,
    id: 'mock-1',
    order_number: '1042',
    status: 'placed',
    items: [
      { name: 'Jerk Chicken Plate', quantity: 2, price: 1200 },
      { name: 'Festival', quantity: 3, price: 300 },
    ],
  },
  {
    ...baseOrder,
    id: 'mock-2',
    order_number: '1045',
    status: 'preparing',
    items: [{ name: 'Curry Goat & Rice', quantity: 1, price: 2550 }],
    lastHandledBy: { name: 'Alex', at: new Date().toISOString(), action: 'accepted' },
  },
  {
    ...baseOrder,
    id: 'mock-3',
    order_number: '1038',
    status: 'ready',
    items: [{ name: 'Oxtail Lunch', quantity: 1, price: 2800 }],
    lastHandledBy: { name: 'Sam', at: new Date().toISOString(), action: 'ready' },
  },
];

export const MOCK_KITCHEN_ORDERS: Order[] = MOCK_COUNTER_ORDERS.filter((order) =>
  ['accepted', 'preparing'].includes(order.status),
);

export const MOCK_ROSTER_MEMBERS: RosterMember[] = [
  { id: 'r1', name: 'Maria Lopez', role: 'staff', jobStation: 'counter', pinStatus: 'active' },
  { id: 'r2', name: 'Andre Chen', role: 'staff', jobStation: 'kitchen', pinStatus: 'active' },
  { id: 'r3', name: 'Kayra Williams', role: 'staff', jobStation: 'kitchen', pinStatus: 'unset' },
  { id: 'r4', name: 'Ricardo Blake', role: 'staff', jobStation: 'counter', pinStatus: 'locked' as PinStatus },
  { id: 'r5', name: 'Vanessa Grant', role: 'manager', jobStation: 'manager', pinStatus: 'active' },
];
