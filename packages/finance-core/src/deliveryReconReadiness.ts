/**
 * Delivery week reconciliation unlock (WEEK_RECONCILIATION_WIZARD_AUDIT.md §7).
 * All four inputs must be true before showing the Delivery wizard (not an empty $0 shell).
 */

export type DeliveryReconReadinessItemId =
  | 'rush_trip_projection'
  | 'courier_week_statement'
  | 'courier_vehicle_bridge'
  | 'rush_settlement_signoff';

export type DeliveryReconReadinessItem = {
  id: DeliveryReconReadinessItemId;
  label: string;
  ok: boolean;
  detail: string;
};

export type DeliveryReconReadinessInput = {
  rushTripProjectionOn: boolean;
  rushDeliveryTripCount: number;
  courierWeekStatementExists: boolean;
  courierVehicleBridgeExists: boolean;
  rushSettlementSignedOff: boolean;
};

export type DeliveryReconReadinessResult = {
  ready: boolean;
  items: DeliveryReconReadinessItem[];
};

export function evaluateDeliveryReconReadiness(
  input: DeliveryReconReadinessInput,
): DeliveryReconReadinessResult {
  const tripsOk = input.rushTripProjectionOn && input.rushDeliveryTripCount > 0;
  const items: DeliveryReconReadinessItem[] = [
    {
      id: 'rush_trip_projection',
      label: 'Rush trips projected into Fleet',
      ok: tripsOk,
      detail: tripsOk
        ? `${input.rushDeliveryTripCount} delivery trip(s) on record`
        : input.rushTripProjectionOn
          ? 'Projection is on but no rush_delivery trips yet'
          : 'Turn on Rush trip projection and complete deliveries',
    },
    {
      id: 'courier_week_statement',
      label: 'Courier week earnings statement',
      ok: input.courierWeekStatementExists,
      detail: input.courierWeekStatementExists
        ? 'Courier earnings statement exists for this week'
        : 'Publish courier_earnings week statements (Mon–Sun, not rolling 7-day)',
    },
    {
      id: 'courier_vehicle_bridge',
      label: 'Courier ↔ fleet vehicle link',
      ok: input.courierVehicleBridgeExists,
      detail: input.courierVehicleBridgeExists
        ? 'At least one courier vehicle maps to a fleet vehicle'
        : 'Link delivery.courier_vehicles to fleet.vehicles so fuel and tolls can be attributed',
    },
    {
      id: 'rush_settlement_signoff',
      label: 'Rush settlement sign-off',
      ok: input.rushSettlementSignedOff,
      detail: input.rushSettlementSignedOff
        ? 'rush_settlement enabled after reconciliation-week sign-off'
        : 'Complete the 5-day checklist in docs/rush-fleet-reconciliation-week.md, then enable rush_settlement',
    },
  ];

  const ready = items.every((i) => i.ok);
  return { ready, items };
}
