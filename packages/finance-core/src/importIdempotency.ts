/**
 * Import money keys must follow the file, not the batch.
 * Embedding batchId made every re-import of the same CSV a fresh posting (C1).
 */
export function importMoneyIdempotencyKey(
  sourceFileHash: string | undefined,
  batchId: string,
  rest: string,
): string {
  const h = String(sourceFileHash || '').trim();
  const prefix = h.length >= 8 ? `file:${h}` : String(batchId || '').trim();
  return `${prefix}|${rest}`;
}
