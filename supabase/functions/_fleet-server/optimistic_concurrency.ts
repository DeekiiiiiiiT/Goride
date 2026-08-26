/**
 * Optimistic concurrency for tag (and similar) records.
 *
 * Two open tabs used to last-write-wins on the whole tag object. The client now
 * sends the `updatedAt` it last read as `expectedUpdatedAt`; if the stored
 * record has moved on, the write is rejected with 409 instead of silently
 * overwriting the other tab's edits.
 */
export class StaleWriteError extends Error {
  override readonly name = 'StaleWriteError';
  readonly status = 409;
  constructor(message = 'Record was updated elsewhere — refresh and try again') {
    super(message);
  }
}

export function assertExpectedUpdatedAt(
  existing: Record<string, unknown> | null | undefined,
  expectedUpdatedAt: unknown,
): void {
  if (expectedUpdatedAt == null || expectedUpdatedAt === '') return;
  if (!existing) return;
  const stored = existing.updatedAt;
  if (stored == null || stored === '') return;
  if (String(stored) !== String(expectedUpdatedAt)) {
    throw new StaleWriteError();
  }
}

/** Strip the concurrency token before persisting — it is not part of the record. */
export function stripConcurrencyToken<T extends Record<string, unknown>>(
  record: T,
): Omit<T, 'expectedUpdatedAt'> {
  const { expectedUpdatedAt: _ignored, ...rest } = record as T & { expectedUpdatedAt?: unknown };
  return rest;
}
