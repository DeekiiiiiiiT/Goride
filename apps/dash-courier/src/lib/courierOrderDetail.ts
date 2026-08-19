export type CourierOrderEvent = {
  id?: string;
  status?: string;
  created_at?: string;
  notes?: string;
};

export type CourierOrderDetailPayload = {
  order: Record<string, unknown>;
  events?: CourierOrderEvent[];
};

export type CourierDeliveryDetailView = {
  restaurant: string;
  customerName: string;
  statusLabel: string;
  completedAtLabel: string | null;
  items: Array<{ quantity: string; name: string }>;
  basePay: number;
  tip: number;
  total: number;
  proofUrl: string | null;
  dropoffLat?: number;
  dropoffLng?: number;
  timeline: Array<{ label: string; time: string; complete: boolean }>;
};

const EVENT_LABELS: Record<string, string> = {
  assigned: 'Offer accepted',
  picked_up: 'Order picked up',
  in_transit: 'En route',
  arrived: 'Arrived at customer',
  delivered: 'Delivery complete',
  completed: 'Delivery complete',
};

function clockLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' });
}

function nestedName(value: unknown, fallback: string): string {
  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return fallback;
}

function finiteCoord(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function mapCourierOrderDetail(payload: CourierOrderDetailPayload): CourierDeliveryDetailView {
  const order = payload.order;
  const merchant = order.merchant;
  const customer = order.customer;
  const restaurant = nestedName(merchant, 'Merchant');
  const customerName = nestedName(customer, 'Customer');
  const itemsRaw = Array.isArray(order.items) ? order.items : [];
  const items = itemsRaw.map((item) => {
    const row = (item && typeof item === 'object' ? item : {}) as {
      name?: string;
      quantity?: number;
    };
    const qty = Math.max(1, Number(row.quantity || 1));
    return { quantity: `${qty}x`, name: String(row.name || 'Item') };
  });

  const basePay = Math.max(0, Number(order.delivery_fee || 0));
  const tip = Math.max(0, Number(order.tip || 0));
  const status = String(order.status || '');
  const deliveredAt = order.delivered_at ? String(order.delivered_at) : null;
  const completedAtLabel = deliveredAt ? `Completed at ${clockLabel(deliveredAt)}` : null;

  const dropoffLatRaw = finiteCoord(order.delivery_lat);
  const dropoffLngRaw = finiteCoord(order.delivery_lng);
  const hasPin =
    dropoffLatRaw != null &&
    dropoffLngRaw != null &&
    !(dropoffLatRaw === 0 && dropoffLngRaw === 0);
  const dropoffLat = hasPin ? dropoffLatRaw : undefined;
  const dropoffLng = hasPin ? dropoffLngRaw : undefined;

  const proofRaw = order.delivery_photo_url ? String(order.delivery_photo_url) : '';
  const proofUrl = proofRaw || null;

  const events = Array.isArray(payload.events) ? payload.events : [];
  const timelineFromEvents = events
    .map((event) => {
      const key = String(event.status || '').toLowerCase();
      const label = EVENT_LABELS[key];
      if (!label) return null;
      return {
        label,
        time: clockLabel(event.created_at),
        complete: true,
      };
    })
    .filter((row): row is { label: string; time: string; complete: boolean } => row != null);

  const seen = new Set<string>();
  const timeline: CourierDeliveryDetailView['timeline'] = [];
  for (const row of timelineFromEvents) {
    if (seen.has(row.label)) continue;
    seen.add(row.label);
    timeline.push(row);
  }

  if (timeline.length === 0) {
    const fallback: Array<[string, unknown]> = [
      ['Offer accepted', order.assigned_at],
      ['Order picked up', order.picked_up_at],
      ['Delivery complete', order.delivered_at],
    ];
    for (const [label, ts] of fallback) {
      if (!ts) continue;
      timeline.push({ label, time: clockLabel(String(ts)), complete: true });
    }
  }

  const statusLabel =
    status === 'cancelled'
      ? 'Cancelled'
      : status === 'delivered' || status === 'completed'
        ? 'Delivered'
        : status
          ? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
          : 'Delivered';

  return {
    restaurant,
    customerName,
    statusLabel,
    completedAtLabel,
    items,
    basePay,
    tip,
    total: basePay + tip,
    proofUrl,
    dropoffLat,
    dropoffLng,
    timeline,
  };
}
