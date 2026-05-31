/** Human-readable cancellation badge for rider-facing UI. */
export function formatCancelReasonBadge(
  reason: string | null | undefined,
  cancelledBy?: string | null,
): string {
  if (reason) {
    const known: Record<string, string> = {
      rider_no_show: 'Rider No-Show',
      rider_changed_plans: 'Rider Cancelled',
      driver_unavailable: 'Driver Unavailable',
      driver_cancelled: 'Driver Cancelled',
      no_drivers_available: 'No Drivers Available',
      system_timeout: 'Search Timed Out',
    };
    if (known[reason]) return known[reason];
    return reason
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (cancelledBy === 'driver') return 'Driver Cancelled';
  if (cancelledBy === 'rider') return 'Rider Cancelled';
  return 'Ride Cancelled';
}

export function formatRideDisplayId(rideId: string): string {
  const compact = rideId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `ROAM-${compact.slice(0, 4)}-${compact.slice(4, 6)}`;
}
