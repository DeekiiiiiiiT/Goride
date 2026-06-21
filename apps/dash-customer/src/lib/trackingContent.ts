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
  merchantName: string;
  merchantAddress: string;
  merchantLogo: string;
  merchantImage: string;
  total: number;
  subtotal: number;
  fees: number;
  tip: number;
  deliveryInstructions: string;
  items: TrackingOrderItem[];
  courier: {
    name: string;
    rating: number;
    deliveries: string;
    avatar: string;
    vehicle: string;
    plate: string;
  };
};

export const MOCK_TRACKING_ORDER: TrackingOrder = {
  id: '8492',
  orderNumber: '8492',
  status: 'preparing',
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
  'Careful handling',
] as const;

export function getTrackingPhase(status: string): TrackingPhase {
  switch (status) {
    case 'placed':
    case 'accepted':
    case 'preparing':
      return 'preparing';
    case 'ready':
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
    merchantName: String(merchant.name ?? 'Island Grill'),
    merchantAddress: String(merchant.address ?? '123 Ocean Drive'),
    merchantLogo: String(merchant.logo_url ?? MOCK_TRACKING_ORDER.merchantLogo),
    merchantImage: MOCK_TRACKING_ORDER.merchantImage,
    total: Number(order.total ?? 0),
    subtotal: Number(order.subtotal ?? 0),
    fees: Number(order.delivery_fee ?? 0) + Number(order.platform_fee ?? 0) + Number(order.tax ?? 0),
    tip: Number(order.tip ?? 0),
    deliveryInstructions: String(order.delivery_instructions ?? MOCK_TRACKING_ORDER.deliveryInstructions),
    items: items.length > 0 ? items : MOCK_TRACKING_ORDER.items,
    courier: courier
      ? {
          name: String(courier.name ?? 'Marcus'),
          rating: Number(courier.rating ?? 4.9),
          deliveries: '2.4k Deliveries',
          avatar: MOCK_TRACKING_ORDER.courier.avatar,
          vehicle: String(courier.vehicle_type ?? 'Silver Honda Vario'),
          plate: String(courier.vehicle_plate ?? 'AB 1234 CD'),
        }
      : MOCK_TRACKING_ORDER.courier,
  };
}
