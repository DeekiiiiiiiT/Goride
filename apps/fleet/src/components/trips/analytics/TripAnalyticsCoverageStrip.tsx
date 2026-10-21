export function TripAnalyticsCoverageStrip({
  coverage,
  open,
  onToggle,
}: {
  coverage?: {
    total?: number;
    delivery?: number;
    timeUnknown?: number;
    gpsTrips?: number;
    completed?: number;
    byPlatform?: { platform: string; trips: number; withGps?: number }[];
    parity?: { ok?: boolean };
  };
  open: boolean;
  onToggle: () => void;
}) {
  if (!coverage) return null;
  const platforms = coverage.byPlatform || [];
  const gps = coverage.gpsTrips ?? 0;
  const completed = coverage.completed ?? coverage.total ?? 0;
  const gpsPct = completed > 0 ? Math.round((gps / completed) * 100) : 0;
  return (
    <div className="text-sm text-slate-500">
      <button type="button" className="min-h-11 text-left" onClick={onToggle}>
        {(coverage.total ?? 0).toLocaleString()} trips
        {platforms.map((p) => ` · ${p.platform} ${p.trips}`).join('')}
        {` · GPS on ${gpsPct}% · time missing on ${coverage.timeUnknown ?? 0}`}
        {coverage.delivery ? ` · ${coverage.delivery} delivery set aside` : ''}
        {coverage.parity && coverage.parity.ok === false ? ' · totals are out of date, refresh' : ''}
      </button>
      {open ? (
        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
          {platforms.map((p) => (
            <p key={p.platform}>{p.platform}: {p.trips} trips, GPS on {p.withGps ?? 0}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
