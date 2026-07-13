/**
 * Pure odo-gap deadhead estimate (same rule as fuel_logic.classifyTripGaps odo-first branch).
 * Kept here so Vitest can cover the rule without importing Deno fuel_logic.
 */
export function sumOdoGapDeadheadKm(
  trips: Array<{
    requestTime?: string;
    date?: string;
    dropoffTime?: string;
    startOdometer?: number | null;
    endOdometer?: number | null;
    pickupOdometer?: number | null;
    dropoffOdometer?: number | null;
  }>,
): number {
  const usable = trips
    .filter((t) => (t.requestTime || t.date) && t.dropoffTime)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.requestTime || a.date!).getTime() -
        new Date(b.requestTime || b.date!).getTime(),
    );

  let sum = 0;
  for (let i = 0; i < usable.length - 1; i++) {
    const prevEnd =
      Number(usable[i].endOdometer ?? usable[i].dropoffOdometer) || null;
    const nextStart =
      Number(usable[i + 1].startOdometer ?? usable[i + 1].pickupOdometer) || null;
    if (prevEnd != null && nextStart != null && nextStart > prevEnd) {
      sum += nextStart - prevEnd;
    }
  }
  return sum;
}
