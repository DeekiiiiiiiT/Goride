/**
 * Trip import merge policy: CSV/import payloads must not wipe Toll Recon
 * operational fields already set on an existing trip:{id}.
 */
export const TRIP_IMPORT_PRESERVE_FIELDS = [
  "tollRefundResolution",
] as const;

export type TripImportPreserveField = (typeof TRIP_IMPORT_PRESERVE_FIELDS)[number];

/**
 * Merge incoming import trip over existing KV/fleet trip.
 * Incoming wins for Uber money fields; preserve list wins when incoming lacks them.
 */
export function mergeTripForImport(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!existing || typeof existing !== "object") {
    return { ...incoming };
  }
  const out: Record<string, unknown> = { ...incoming };
  for (const field of TRIP_IMPORT_PRESERVE_FIELDS) {
    const nextVal = out[field];
    const prevVal = existing[field];
    const nextEmpty =
      nextVal == null ||
      (typeof nextVal === "object" &&
        nextVal !== null &&
        !(nextVal as { status?: unknown }).status);
    if (nextEmpty && prevVal != null) {
      out[field] = prevVal;
    }
  }
  // tollDetection: keep prior coverage if import did not stamp one yet
  if (out.tollDetection == null && existing.tollDetection != null) {
    out.tollDetection = existing.tollDetection;
  }
  return out;
}
