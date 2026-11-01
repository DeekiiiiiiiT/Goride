/** Stable idempotency keys for org-part-stock POST (R6-11). */
export function orgPartStockIdempotencyKey(
  partId: string | undefined,
  universalPartId: string | undefined,
  location: string | null | undefined,
  qty: number,
): string {
  const target = partId ? `part:${partId}` : `universal:${universalPartId ?? 'none'}`;
  const loc = location?.trim() || 'default';
  return `org-part-stock:${target}:${loc}:qty${qty}`;
}
