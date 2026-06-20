import { formatJmd } from '@/lib/mockEarnings';

export type ActivityTab = 'current' | 'history';
export type HistoryFilter = 'all' | 'completed' | 'cancelled';

export type ActiveDeliverySummary = {
  restaurant: string;
  dropoff: string;
  status: string;
  statusIcon: string;
  estimatedArrival: string;
};

export type HistoryDelivery = {
  id: string;
  restaurant: string;
  dropoff: string;
  time: string;
  amount: number;
  status: 'completed' | 'cancelled';
  icon: string;
  dateGroup: string;
};

export const MOCK_ACTIVE_DELIVERY_SUMMARY: ActiveDeliverySummary = {
  restaurant: 'Island Grill',
  dropoff: 'New Kingston',
  status: 'En route to customer',
  statusIcon: 'directions_car',
  estimatedArrival: '2:55 PM',
};

export const MOCK_ACTIVITY_HISTORY: HistoryDelivery[] = [
  {
    id: 'del-1',
    restaurant: 'Island Grill',
    dropoff: 'New Kingston',
    time: '2:42 PM',
    amount: 520,
    status: 'completed',
    icon: 'restaurant',
    dateGroup: 'Today',
  },
  {
    id: 'del-2',
    restaurant: 'Cafe Blue',
    dropoff: 'Liguanea',
    time: '11:15 AM',
    amount: 450,
    status: 'completed',
    icon: 'local_cafe',
    dateGroup: 'Today',
  },
  {
    id: 'del-3',
    restaurant: 'Burger King',
    dropoff: 'Half Way Tree',
    time: '6:30 PM',
    amount: 600,
    status: 'completed',
    icon: 'fastfood',
    dateGroup: 'Yesterday',
  },
  {
    id: 'del-4',
    restaurant: 'Pita Grill',
    dropoff: 'Barbican',
    time: '1:20 PM',
    amount: 480,
    status: 'cancelled',
    icon: 'store',
    dateGroup: 'Yesterday',
  },
];

export { formatJmd };

export function groupHistoryByDate(
  items: HistoryDelivery[],
  filter: HistoryFilter,
): { date: string; items: HistoryDelivery[] }[] {
  const filtered =
    filter === 'all' ? items : items.filter((item) => item.status === filter);

  const groups = new Map<string, HistoryDelivery[]>();
  for (const item of filtered) {
    const list = groups.get(item.dateGroup) ?? [];
    list.push(item);
    groups.set(item.dateGroup, list);
  }
  return Array.from(groups.entries()).map(([date, groupItems]) => ({
    date,
    items: groupItems,
  }));
}
