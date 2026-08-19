export type TrackingPhase =
  | 'preparing'
  | 'courier_assigned'
  | 'on_the_way'
  | 'almost_there'
  | 'delivered';

export type TrackingOrderItem = {
  name: string;
  quantity: number;
  price: number;
  note?: string;
};

export type TrackingOrder = {
  id: string;
  orderNumber: string;
  status: string;
  merchantId: string;
  merchantName: string;
  merchantAddress: string;
  merchantLogo: string;
  merchantImage: string;
  total: number;
  subtotal: number;
  fees: number;
  tip: number;
  deliveryInstructions: string;
  deliveryAddress?: string;
  items: TrackingOrderItem[];
  courier: {
    name: string;
    rating: number;
    deliveries: string;
    avatar: string;
    vehicle: string;
    plate: string;
    phone?: string;
  };
  courierLat?: number | null;
  courierLng?: number | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  placedAt?: string;
  acceptedAt?: string;
  preparingAt?: string;
  estimatedPrepMins?: number | null;
  estimatedDeliveryAt?: string | null;
  merchantAvgPrepMins?: number | null;
  deliveryPhotoUrl?: string;
  deliveredLabel?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  /** Approximate map until live courier GPS (Phase 3) */
  locationApproximate?: boolean;
};

export const MOCK_TRACKING_ORDER: TrackingOrder = {
  id: '8492',
  orderNumber: '8492',
  status: 'preparing',
  merchantId: 'island-grill',
  merchantName: 'Island Grill',
  merchantAddress: '123 Ocean Drive',
  merchantLogo:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuC8vbwuBhPKxLfz9GANPENcNIdDM74K05_dZ8uaphp89SuYCAQ0hQFkJy4dwsDNPzbeEQQmVCoTYP5ZpI7kV16CONqlYIzZ8MHJFMRVuiNeb5o3EWfr05XfZ4PY_46CklsFBUlUu6nFV5fQCBuRE847ZAddSwc-klhoTpYl0kLIFIWpU1EtP2qvqaPX4AhqNJ5b-gNxuKLNRQcXco3IEUE-3Ko8IZz4LukbUgTRB_HYshbxSWfVyW23FpkYbbDAQUDurDnqZ-vzv1o8',
  merchantImage:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBoH2YO07_oSHqT9JRLy6b6JcoFnfrEsfxFTvb_rQ5RC5OKx6pbAONZ5--oeOIgSsxRrEXXi25g2VOVKNOK_KrKmwb_FGuJNfa5-Lk0mgLkptMHOPHI77pHqaKa_GdQzSDl9Jg4wOb5m13_ncErZikIt5sB_ngW4UigtQ9aEF0deO1aFWkPHhTAG2wwXRKOffOwyDV-K_9Tr9GugPfL1vEkGXYmi33p7-YBHwT2itMOgFL2WC-LbyMBzaNURhwUFMkjwyyOiOU1XTTx',
  total: 3475,
  subtotal: 3050,
  fees: 425,
  tip: 400,
  deliveryInstructions: 'Leave at door • Gate code: 1234',
  deliveryAddress: '45 Constant Spring Rd, Apt 12B',
  items: [
    { name: 'Jerk Chicken Platter', quantity: 1, price: 1850, note: 'Extra plantains' },
    { name: 'Mango Smoothies', quantity: 2, price: 1200 },
  ],
  courier: {
    name: 'Marcus',
    rating: 4.9,
    deliveries: '2.4k Deliveries',
    avatar:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD1QzH7HwVyFyNIawxUbT8lliaUeRnfBxLr8ezcjEEghJfrBiCw-nR1VakUFMabU2cdID_Ri6ArM82HCy1RQnXntPy5Yrs2Xtfir9VuUfNE7wLlyV5ASy7QRC-6dlz9prhrWUL6_RkyIqkmuTtbF-eR2_0g8MiFlWZJhRBumOiqNxNuZiVh9e_SeRn1ImBAgTncYUDTAmctSgky4HDDr74WfLIfePgaik-QeTM96hQCGdwQadpnhSdoUx52wxPQVZn3yvrpiNGNIqVR',
    vehicle: 'Silver Honda Vario',
    plate: 'AB 1234 CD',
  },
  locationApproximate: true,
};

export const TRACKING_MAP_IMAGES = {
  preparing:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCQc6jY_GAsHjzdnuwJBjqeXcHPgJCXfasUN59LucViSYlCFyJANc4vEXdIS-ml1Dnl8oyKLk2HcTKWbLl-g8ARL6RRDG2nFUmC_ddGaICh5NhvTAoRUm8nI4tvlqiwYptxFaVXMdMqdVWRjvV7t-iAOHfs5UahHRFVgnY3xVPts3R0AL1zBgltYspyN7y9pDEmuDgCsts_M5iFdbqB7RZ3J7tLIiMA2aREW_JzgR32BwT25_RSBjuLCoaECpeeE9idWK_7RqoBhto_',
  courierAssigned:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCa3vUx0AvnLHRJchXIqSkWgJGEFOXwIVf97kP9vc7Bs03twqWYgeAObbcCAQANRsJwgDjPug2r85VRH77F36dLjalifsLfqxfHlwfaZUDWQwmN5zM2HaWIfEoALa2okAeaXfQ-Pxqa4wvVZgZgUfzxKwmzGzsue126mmMXcIBtKA7LN_Dj59YuCWc-hVY7lLKOw8awzgfys086NF2aD2q80E3XvmfSXfibj0ELmKejERHfnpZlFAwrZy8WE8J0p6SxdKes93r0vA5p',
  almostThere:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBkF57PBkUo9432sMxzU2SGAJxi_GtSenHmvVOcb_DS9s3ZvNtJjBeZsPbreh5nK-wsvnQ6R3mjcCBRcSAIddDlgd8OqB5o4fS4sNUeXZm7Tmfv9vCv7aaWcatVIgdylk_pETe2Nu8ytePI2Ty8XbVxeEOCLOh9JGLPB6VWvGijv1393Vorv6F2EyJIk2fpBYXkS-J2y8MTzYXROswSmhsrVwq5mVX1al69LE25LutdIkxabma5TGgWmF0RQZsEWhjRjJhskV6tnasc',
  driverMarker:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuA3iouxjBRiFGUj0vTIMfvVVRdgzaHEc0LMPwcS4t0cymnrsw0CuoMgmX3jbwE9KZxc8CPFW1huqaGFWaRfNzenpoJQUZsh7c7LXjwv1ZDIM4KSotf0_fpi4f8R9t9wKIJN2ql-rDjsq20KQsi-U0RP4k2d7CBOyx1KAW54qMq6bgzxxS8ojyvC6ub60d9H6bValj5imrNzMv5z2sc-35UT0yjOj26cbyqdeHlX6pIjroAyVF6px9X4Gw-qHY9oLkuJRs7mTaPbznI6',
  courierAvatar:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAHRWXFKe5qAaQ0TTLfAdXvx7LR4yiJvuY15-DkBH8eSbIpImIJv_PWAw_-4gKzKOrlKWhCw7QJI3aQPMd78i21d1aD5xjlveXRaCq31skMy3oOKPKrR1eV2MpuyIArR8haH4DiXt08kUygfszuVppVS-5bhbj_E5OVUA6LMDDgW5TjuUY4of1N5r89xKBJOAzFvOaX0m7noCmw8E4-bsRXU4obu08mwZWDXUFszjjYW3fdYbttNETTRfSnCVJLqEzJPpITI8ShzH2M',
  proofOfDelivery:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCt6_uJjn-KgX3wXKamT3SqGNF5AsRtm5aD0E8QFCOXnR1HW8hgx0zy7FhK5gWa-L7BJC9MLLkYjWV96T1oJTT9nwwHTbGkXBx9JZeIqMOiSB6BBMK4Zhg5_e5hJWKiRSoTAaYflTsVHGLZmQ5afIsDT4YyGVYxoORI8Hgr-SYQNT17_Dz2jFEp9EI7uGGr7WbKIZ_01qD2wSE9abee6vyJX3s-4GbrlfEOzin9nZ3pY0AJF2Kkmgi_kQvBHPAeV8vPpS4yYS1fCGta',
};

export const FEEDBACK_CHIPS = [
  'Fast delivery',
  'Great food',
  'Friendly courier',
  'Item missing',
  'Wrong item',
  'Cold food',
] as const;

export function getTrackingPhase(status: string): TrackingPhase {
  switch (status) {
    case 'placed':
    case 'accepted':
    case 'preparing':
      return 'preparing';
    case 'ready':
    case 'assigned':
      return 'courier_assigned';
    case 'picked_up':
      return 'on_the_way';
    case 'in_transit':
      return 'almost_there';
    case 'delivered':
    case 'completed':
      return 'delivered';
    default:
      return 'preparing';
  }
}

export function formatJmd(amount: number): string {
  return `J$${amount.toLocaleString()}`;
}

export function formatDeliveredClock(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function mapApiOrderToTracking(order: Record<string, unknown>): TrackingOrder {
  const merchant = (order.merchant as Record<string, unknown>) ?? {};
  const courier = order.courier as Record<string, unknown> | undefined;
  const items = ((order.items as Array<Record<string, unknown>>) ?? []).map(item => ({
    name: String(item.name ?? ''),
    quantity: Number(item.quantity ?? 1),
    price: Number(item.price ?? 0),
    note: item.options
      ? ((item.options as Array<Record<string, unknown>>)[0]?.selections as Array<Record<string, unknown>>)
          ?.map(s => s.name)
          .join(', ')
      : undefined,
  }));

  return {
    id: String(order.id ?? ''),
    orderNumber: String(order.order_number ?? order.id ?? ''),
    status: String(order.status ?? 'preparing'),
    merchantId: String(order.merchant_id ?? merchant.id ?? merchant.slug ?? ''),
    merchantName: String(merchant.name ?? 'Restaurant'),
    merchantAddress: String(merchant.address ?? ''),
    merchantLogo: String(merchant.logo_url ?? ''),
    merchantImage: String(merchant.cover_image_url ?? merchant.logo_url ?? ''),
    total: Number(order.total ?? 0),
    subtotal: Number(order.subtotal ?? 0),
    fees: Number(order.delivery_fee ?? 0) + Number(order.platform_fee ?? 0) + Number(order.tax ?? 0),
    tip: Number(order.tip ?? 0),
    deliveryInstructions: String(order.delivery_instructions ?? ''),
    deliveryAddress: stringifyDeliveryAddress(order.delivery_address),
    items,
    courier: courier
      ? {
          name: String(courier.display_name ?? courier.name ?? 'Courier'),
          rating: Number(courier.rating ?? 0),
          deliveries: '',
          avatar: String(courier.avatar_url ?? ''),
          vehicle: String(courier.vehicle_type ?? ''),
          plate: String(courier.vehicle_plate ?? ''),
          phone: courier.phone ? String(courier.phone) : undefined,
        }
      : {
          name: 'Courier',
          rating: 0,
          deliveries: '',
          avatar: '',
          vehicle: '',
          plate: '',
        },
    courierLat: order.courier_lat != null ? Number(order.courier_lat) : null,
    courierLng: order.courier_lng != null ? Number(order.courier_lng) : null,
    deliveryLat: order.delivery_lat != null ? Number(order.delivery_lat) : null,
    deliveryLng: order.delivery_lng != null ? Number(order.delivery_lng) : null,
    placedAt: order.placed_at ? String(order.placed_at) : undefined,
    acceptedAt: order.accepted_at ? String(order.accepted_at) : undefined,
    preparingAt: order.preparing_at ? String(order.preparing_at) : undefined,
    estimatedPrepMins:
      order.estimated_prep_time_mins != null ? Number(order.estimated_prep_time_mins) : null,
    estimatedDeliveryAt: order.estimated_delivery_at ? String(order.estimated_delivery_at) : null,
    merchantAvgPrepMins:
      merchant.avg_prep_time_mins != null ? Number(merchant.avg_prep_time_mins) : null,
    deliveryPhotoUrl: order.delivery_photo_url ? String(order.delivery_photo_url) : undefined,
    deliveredLabel: formatDeliveredClock(order.delivered_at),
    paymentStatus: order.payment_status ? String(order.payment_status) : undefined,
    paymentMethod: order.payment_method ? String(order.payment_method) : undefined,
    locationApproximate: order.courier_lat == null || order.courier_lng == null,
  };
}

export type DeliveryHandoff = {
  mode: 'hand' | 'door';
  notes: string;
};

export function stringifyDeliveryAddress(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const row = raw as Record<string, unknown>;
    return String(row.line1 ?? row.address ?? '').trim();
  }
  return '';
}

/** Pin caption: saved Home/Work/Other, never a fake Home. */
export function destinationPinLabel(
  deliveryAddress: string | null | undefined,
  saved: Array<{ label: string; line1: string }>,
): string {
  const needle = (deliveryAddress ?? '').trim().toLowerCase();
  if (!needle) return 'Drop-off';
  const match = saved.find((place) => {
    const line = place.line1.trim().toLowerCase();
    if (!line) return false;
    return needle === line || needle.includes(line) || line.includes(needle);
  });
  if (match?.label === 'home') return 'Home';
  if (match?.label === 'work') return 'Work';
  if (match?.label === 'other') return 'Other';
  return 'Drop-off';
}

/** Checkout stores "Hand it to me" vs free-text door instructions. Never invent a gate code. */
export function parseDeliveryHandoff(instructions: string | null | undefined): DeliveryHandoff {
  const raw = (instructions ?? '').trim();
  if (!raw) return { mode: 'door', notes: '' };
  if (/^hand it to me/i.test(raw)) {
    const notes = raw.replace(/^hand it to me[.!\s-]*/i, '').trim();
    return { mode: 'hand', notes };
  }
  return { mode: 'door', notes: raw };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function remainingPrepMinutes(opts: {
  nowMs: number;
  placedAt?: string;
  acceptedAt?: string;
  preparingAt?: string;
  estimatedPrepMins?: number | null;
  merchantAvgPrepMins?: number | null;
}): number | null {
  const prep = opts.estimatedPrepMins ?? opts.merchantAvgPrepMins;
  if (prep == null || !Number.isFinite(prep) || prep <= 0) return null;
  const anchor = opts.preparingAt || opts.acceptedAt || opts.placedAt;
  if (!anchor) return Math.ceil(prep);
  const start = new Date(anchor).getTime();
  if (Number.isNaN(start)) return Math.ceil(prep);
  return Math.max(0, Math.ceil(prep - (opts.nowMs - start) / 60_000));
}

export function remainingDeliveryMinutes(opts: {
  nowMs: number;
  estimatedDeliveryAt?: string | null;
  courierLat?: number | null;
  courierLng?: number | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
}): number | null {
  if (opts.estimatedDeliveryAt) {
    const t = new Date(opts.estimatedDeliveryAt).getTime();
    if (!Number.isNaN(t)) return Math.max(0, Math.ceil((t - opts.nowMs) / 60_000));
  }
  const { courierLat, courierLng, deliveryLat, deliveryLng } = opts;
  if (
    courierLat == null ||
    courierLng == null ||
    deliveryLat == null ||
    deliveryLng == null ||
    !Number.isFinite(courierLat) ||
    !Number.isFinite(courierLng) ||
    !Number.isFinite(deliveryLat) ||
    !Number.isFinite(deliveryLng)
  ) {
    return null;
  }
  const km = haversineKm(courierLat, courierLng, deliveryLat, deliveryLng);
  if (km < 0.08) return 0;
  return Math.max(1, Math.round(km * 3 + 2));
}

export function formatPrepEta(mins: number | null): string {
  if (mins == null) return 'Restaurant is preparing';
  if (mins <= 0) return 'Almost ready';
  return `${mins} min`;
}

export function formatArrivalEta(mins: number | null): string {
  if (mins == null) return 'On the way';
  if (mins <= 0) return 'Arriving now';
  return `Arriving in ${mins} min`;
}

export function courierPhoneHref(phone: string | undefined, scheme: 'tel' | 'sms'): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `${scheme}:${cleaned}`;
}
