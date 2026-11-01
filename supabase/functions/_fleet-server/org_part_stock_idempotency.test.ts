/** R6-11: stable org-part-stock idempotency keys (matches apps/fleet/src/utils/orgPartStockIdempotency.ts). */
function orgPartStockIdempotencyKey(
  partId: string | undefined,
  universalPartId: string | undefined,
  location: string | null | undefined,
  qty: number,
): string {
  const target = partId ? `part:${partId}` : `universal:${universalPartId ?? "none"}`;
  const loc = location?.trim() || "default";
  return `org-part-stock:${target}:${loc}:qty${qty}`;
}

Deno.test("org part stock idempotency key is stable for retries", () => {
  const partId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const a = orgPartStockIdempotencyKey(partId, undefined, "Main store", 4);
  const b = orgPartStockIdempotencyKey(partId, undefined, "Main store", 4);
  if (a !== b) throw new Error(`expected stable key, got ${a} vs ${b}`);
  const c = orgPartStockIdempotencyKey(partId, undefined, "Main store", 5);
  if (a === c) throw new Error("qty change must change key");
});
