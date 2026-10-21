import { formatInFleetTz } from '../../../utils/timezoneDisplay';
import { formatJMD } from '../../../utils/formatJMD';

const LABELS: Record<string, string> = {
  zero_fare: 'Zero fare',
  zero_km: 'Zero km',
  long_distance: 'Very long',
  long_duration: 'Long duration',
  speed: 'Speed',
  fare_per_km: 'Fare/km',
  amount_floor: 'High fare',
  amount_p99: 'Outlier',
  missing_time: 'Time missing',
  missing_vehicle: 'No vehicle',
  gps_equal: 'Same pin',
  gps_vs_median: 'Distance outlier',
  duplicate: 'Duplicate',
};

export function TripAnalyticsTable({
  trips,
  total,
  page,
  pageSize,
  loading,
  onPage,
  onOpen,
  onExport,
  exporting,
}: {
  trips: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPage: (page: number) => void;
  onOpen: (trip: Record<string, unknown>) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Trips</h3>
        <button type="button" className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm text-white" disabled={exporting} onClick={onExport}>
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>
      <p className="text-sm text-slate-500">{total.toLocaleString()} trips match these filters. Export includes up to 10,000.</p>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="p-3">Time</th><th>Driver</th><th>Route</th><th>km</th><th>min</th><th>Fare</th><th>Payment</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <tr key={String(trip.id)} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => onOpen(trip)}>
                <td className="p-3">{timeLabel(trip)}</td>
                <td>{String(trip.driverName || trip.driverId || '—')}</td>
                <td>{routeLabel(trip)}</td>
                <td>{trip.distance == null ? '—' : Number(trip.distance).toFixed(1)}</td>
                <td>{trip.duration == null ? '—' : Math.round(Number(trip.duration))}</td>
                <td>{trip.amount == null ? '—' : formatJMD(Number(trip.amount), 2)}</td>
                <td>{String(trip.paymentMethod || '—')}</td>
                <td>
                  {String(trip.status || '—')}
                  {trip.cancelActor ? ` · ${String(trip.cancelActor)}` : ''}
                  <Flags flags={trip.anomalyFlags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {trips.map((trip) => (
          <button key={String(trip.id)} type="button" className="w-full rounded-xl border bg-white p-3 text-left" onClick={() => onOpen(trip)}>
            <p className="font-medium">{timeLabel(trip)}</p>
            <p className="text-sm text-slate-600">{String(trip.driverName || '—')} · {routeLabel(trip)}</p>
            <p className="text-sm">{trip.amount == null ? '—' : formatJMD(Number(trip.amount), 2)} · {String(trip.status || '')}</p>
            <Flags flags={trip.anomalyFlags} />
          </button>
        ))}
      </div>
      {loading ? <p className="text-sm text-slate-500">Loading trips…</p> : null}
      {!loading && trips.length === 0 ? <p className="text-sm text-slate-500">No trips match these filters.</p> : null}
      <div className="flex items-center gap-2">
        <button type="button" className="min-h-11 rounded-lg bg-slate-100 px-3" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="text-sm">Page {page} of {pages}</span>
        <button type="button" className="min-h-11 rounded-lg bg-slate-100 px-3" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </section>
  );
}

function timeLabel(trip: Record<string, unknown>): string {
  const raw = trip.requestTime || trip.date;
  if (!raw) return '—';
  return formatInFleetTz(String(raw), 'America/Jamaica', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function routeLabel(trip: Record<string, unknown>): string {
  const from = trip.pickupArea || trip.pickupAddress || '—';
  const to = trip.dropoffArea || trip.dropoffAddress || '—';
  return `${from} → ${to}`;
}

function Flags({ flags }: { flags: unknown }) {
  const list = Array.isArray(flags) ? flags.map(String) : [];
  if (!list.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {list.map((flag) => <span key={flag} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{LABELS[flag] || flag}</span>)}
    </span>
  );
}
