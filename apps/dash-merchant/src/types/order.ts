export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  menuItemId?: string;
  options?: Array<{
    name: string;
    selections: Array<{ name: string; priceAdjustment: number }>;
  }>;
}

export interface Order {
  id: string;
  order_number: string;
  channel?: string;
  fulfillment_type?: string;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  platform_fee?: number;
  tax: number;
  tip: number;
  created_at: string;
  placed_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  estimated_prep_time_mins?: number | null;
  customer_rating?: number | null;
  customer_review?: string | null;
  courier_id?: string | null;
  cancellation_reason?: string | null;
  cancelled_by?: string | null;
  items: OrderItem[];
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  delivery_address?: string;
  delivery_instructions?: string;
  payment_method: string;
  lastHandledBy?: {
    name: string;
    at: string;
    action: string;
  } | null;
}

export interface OrderEvent {
  id: string;
  status: string;
  created_at: string;
  notes?: string | null;
}

export function getItemOptionLines(item: OrderItem) {
  return (
    item.options?.flatMap((option) => {
      const selections = option.selections?.map((s) => s.name).join(', ') ?? '';
      if (!selections) return [];
      return `${option.name}: ${selections}`;
    }) ?? []
  );
}
