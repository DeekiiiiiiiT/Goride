/**
 * Cancel compensation policy v1 (plan default).
 * - Before accept: $0
 * - After accept, before pickup: 50% delivery_fee
 * - After pickup: 100% delivery_fee
 * - Courier-initiated unassign/abort: $0
 */

export type CancelCompensationInput = {
  deliveryFee: number;
  cancelledBy: string;
  pickedUpAt?: string | null;
  hadCourier?: boolean;
};

export function computeCourierCancelCompensation(input: CancelCompensationInput): number {
  const fee = Math.max(0, Number(input.deliveryFee || 0));
  const by = String(input.cancelledBy || "").toLowerCase();

  if (by === "courier") return 0;

  const pickedUp = Boolean(input.pickedUpAt);
  if (pickedUp) return Math.round(fee * 100) / 100;
  if (input.hadCourier) return Math.round(fee * 0.5 * 100) / 100;
  return 0;
}
