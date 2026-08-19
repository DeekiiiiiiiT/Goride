import type { CourierHistoryRow } from '@/lib/courierApi';
import type { HistoryDelivery } from '@/lib/mockActivity';

export function formatDeliveryTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' });
}

export function dateGroupLabel(iso?: string): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-JM', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function mapCourierHistoryToActivity(rows: CourierHistoryRow[]): HistoryDelivery[] {
  return rows.map((row) => ({
    id: row.id,
    restaurant: row.restaurant,
    dropoff: row.dropoff,
    time: formatDeliveryTime(row.time),
    amount: row.status === 'cancelled' ? 0 : row.amount,
    status: row.status === 'cancelled' ? 'cancelled' : 'completed',
    icon: 'restaurant',
    dateGroup: dateGroupLabel(row.time),
  }));
}
