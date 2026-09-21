/**
 * Fuel Management service-line UI labels (canonical backend: rideshare | rush_delivery).
 * Audit §6.4 — pure module (no React) so filters/tests can import safely.
 */
export function fuelServiceLineUiLabel(
  line: 'all' | 'rideshare' | 'rush_delivery' | 'delivery' | 'unattributed',
): string {
  switch (line) {
    case 'rush_delivery':
    case 'delivery':
      return 'Delivery';
    case 'rideshare':
      return 'Rideshare';
    case 'unattributed':
      return 'Unattributed';
    case 'all':
    default:
      return 'All';
  }
}
