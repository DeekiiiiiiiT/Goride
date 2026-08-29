import type { TaxPointInput } from './types.ts';

function toMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * s.6(1) — tax point is the earliest of invoice, payment, or delivery when provided.
 * Throws if none of the timestamps are valid (fail-closed).
 */
export function resolveTaxPoint(input: TaxPointInput): Date {
  const times = [toMs(input.invoiceAt), toMs(input.paymentAt), toMs(input.deliveryAt)].filter(
    (t): t is number => t != null,
  );
  if (times.length === 0) {
    throw new Error('tax_point requires at least one of invoiceAt, paymentAt, deliveryAt');
  }
  return new Date(Math.min(...times));
}
