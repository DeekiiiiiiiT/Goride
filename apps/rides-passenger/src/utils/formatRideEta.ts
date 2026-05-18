const JAMAICA_TZ = 'America/Jamaica';

export function formatPickupEta(minutes: number): string {
  const n = Math.max(1, Math.round(minutes));
  return `${n} min${n === 1 ? '' : 's'} away`;
}

export function formatArrivalTime(iso: string): string {
  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function formatVehicleEtaLine(
  quote: {
    drivers_available?: boolean;
    pickup_eta_minutes_estimate?: number;
    eta_arrival_at?: string;
  } | null,
): string | null {
  if (!quote) return null;
  if (!quote.drivers_available) return 'No drivers nearby';
  if (
    quote.pickup_eta_minutes_estimate == null ||
    !quote.eta_arrival_at
  ) {
    return null;
  }
  return `${formatPickupEta(quote.pickup_eta_minutes_estimate)} · ${formatArrivalTime(quote.eta_arrival_at)}`;
}
