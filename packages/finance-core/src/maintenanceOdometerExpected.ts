/** Service log odometer check — same timestamp convention as fleet-ops complete. */
export function maintenanceServiceRecordedAt(serviceDateYmd: string): string {
  const d = String(serviceDateYmd || "").slice(0, 10);
  return `${d}T12:00:00.000Z`;
}

export function interpolateExpectedOdometer(args: {
  serviceDateYmd: string;
  priorReading: number | null;
  priorRecordedAt: string | null;
  nextReading: number | null;
  nextRecordedAt: string | null;
}): number | null {
  const serviceTs = Date.parse(maintenanceServiceRecordedAt(args.serviceDateYmd));
  if (!Number.isFinite(serviceTs)) return null;

  const priorTs = args.priorRecordedAt ? Date.parse(args.priorRecordedAt) : NaN;
  const nextTs = args.nextRecordedAt ? Date.parse(args.nextRecordedAt) : NaN;

  if (
    args.priorReading != null &&
    Number.isFinite(priorTs) &&
    args.nextReading != null &&
    Number.isFinite(nextTs) &&
    nextTs > priorTs
  ) {
    const ratio = (serviceTs - priorTs) / (nextTs - priorTs);
    const clamped = Math.max(0, Math.min(1, ratio));
    return Math.round(args.priorReading + (args.nextReading - args.priorReading) * clamped);
  }

  if (args.priorReading != null) return Math.round(args.priorReading);
  if (args.nextReading != null) return Math.round(args.nextReading);
  return null;
}
