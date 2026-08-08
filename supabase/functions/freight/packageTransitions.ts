/** Package status machine for Jamaica intl mailbox freight. */
export const PACKAGE_TRANSITIONS: Record<string, string[]> = {
  expected: ["received_at_warehouse", "exception"],
  received_at_warehouse: ["manifested", "exception"],
  manifested: ["in_transit_intl", "exception"],
  in_transit_intl: ["customs_hold", "customs_cleared", "received_hub", "exception"],
  customs_hold: ["customs_cleared", "exception"],
  customs_cleared: ["received_hub", "exception"],
  received_hub: ["ready_for_fulfillment", "exception"],
  ready_for_fulfillment: ["out_for_delivery", "awaiting_pickup", "exception"],
  out_for_delivery: ["delivered", "exception"],
  awaiting_pickup: ["collected", "exception"],
  delivered: [],
  collected: [],
  exception: [
    "received_at_warehouse",
    "manifested",
    "in_transit_intl",
    "customs_cleared",
    "received_hub",
    "ready_for_fulfillment",
  ],
};

export const PACKAGE_STATUSES = Object.keys(PACKAGE_TRANSITIONS);

export function canTransitionPackage(from: string, to: string): boolean {
  return (PACKAGE_TRANSITIONS[from] ?? []).includes(to);
}
