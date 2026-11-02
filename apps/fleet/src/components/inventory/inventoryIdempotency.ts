export function newInventoryIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
