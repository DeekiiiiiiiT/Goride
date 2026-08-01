/** Shared shipment status machine for freight edge + tests. */
export const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ["booked", "cancelled"],
  booked: ["in_transit", "cancelled", "exception"],
  in_transit: ["out_for_delivery", "delivered", "exception", "cancelled"],
  out_for_delivery: ["delivered", "exception", "cancelled"],
  delivered: [],
  cancelled: [],
  exception: ["in_transit", "out_for_delivery", "cancelled"],
};
