/** Monotonic client sequence for courier GPS pings (prevents out-of-order writes). */
export function nextClientSeq(current: number): number {
  if (!Number.isFinite(current) || current < 0) return 1;
  return current + 1;
}
