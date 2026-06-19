/**
 * Client-side vehicle resolution (secondary to server enrichment).
 * Source of truth remains vehicle.currentDriverId on the fleet server.
 */
export function resolveVehicleIdForDriver(
  driverRecord: Record<string, unknown> | null | undefined,
  vehicles: Array<Record<string, unknown>>,
  userId?: string,
): string | undefined {
  if (!driverRecord && !userId) return undefined;

  const fromRecord =
    (driverRecord?.assignedVehicleId as string | undefined) ||
    (driverRecord?.vehicleId as string | undefined) ||
    (driverRecord?.vehicle as string | undefined);
  if (fromRecord) return fromRecord;

  const driverIds = [
    userId,
    driverRecord?.id as string | undefined,
    driverRecord?.driverId as string | undefined,
  ].filter(Boolean) as string[];

  const match = vehicles.find(
    (v) =>
      v.currentDriverId &&
      driverIds.some((id) => String(v.currentDriverId) === String(id)),
  );
  return match?.id as string | undefined;
}
