import { useState } from 'react';
import { api } from '../../../services/api';
import { usePermissions } from '../../../hooks/usePermissions';

const LABELS: Record<string, string> = {
  zero_fare: 'Zero fare',
  zero_km: 'Zero distance',
  long_distance: 'Very long',
  long_duration: 'Very long duration',
  speed: 'Too fast or too slow',
  fare_per_km: 'Fare per km too high',
  fare_outlier: 'Fare far above the usual',
  zero_distance: 'Zero distance',
  speed_high: 'Too fast',
  speed_low: 'Too slow',
  amount_floor: 'Fare above J$5,000',
  amount_p99: 'Fare above the platform’s usual high',
  missing_time: 'Time missing',
  missing_vehicle: 'Vehicle missing',
  gps_equal: 'Pickup and dropoff are the same pin',
  gps_vs_median: 'Distance far from the usual',
  duplicate: 'Possible duplicate',
};

export function TripAnalyticsAnomalies({
  data,
  onOpen,
  onChanged,
  openingId,
}: {
  data?: {
    counts?: Record<string, number>;
    cards?: { rule: string; count: number }[];
    feed?: { tripId: string; rule: string; detail: Record<string, unknown> }[];
    thresholds?: Record<string, number>;
  };
  onOpen: (tripId: string) => void;
  onChanged: () => void;
  openingId?: string | null;
}) {
  const { can } = usePermissions();
  const canEdit = can('transactions.edit');
  const [reason, setReason] = useState('Checked, not a problem');
  const [error, setError] = useState('');
  const cards = data?.cards || Object.entries(data?.counts || {}).map(([rule, count]) => ({ rule, count: Number(count) }));
  const feed = data?.feed || [];

  async function review(tripId: string, rule: string, action: 'dismiss' | 'keep') {
    setError('');
    try {
      await api.reviewTripAnomaly({ tripId, rule, action, reason });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the review');
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-900">Anomalies</h3>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.rule} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm text-slate-500">{LABELS[card.rule] || card.rule}</p>
            <p className="text-xl font-bold">{card.count}</p>
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="space-y-2">
        {feed.map((row) => (
          <div key={`${row.tripId}-${row.rule}`} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="font-medium">{LABELS[row.rule] || row.rule}</p>
            <p className="text-sm text-slate-500">{row.tripId}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="min-h-11 rounded-lg bg-indigo-600 px-3 text-sm text-white" onClick={() => onOpen(row.tripId)} disabled={openingId === row.tripId}>
                {openingId === row.tripId ? 'Opening…' : 'Review'}
              </button>
              {canEdit ? (
                <button type="button" className="min-h-11 rounded-lg bg-slate-100 px-3 text-sm" onClick={() => review(row.tripId, row.rule, 'dismiss')}>Dismiss</button>
              ) : null}
            </div>
          </div>
        ))}
        {feed.length === 0 ? <p className="text-sm text-slate-500">No open anomalies for this filter.</p> : null}
      </div>
      {canEdit ? (
        <>
          <label className="block text-sm text-slate-600">
            Dismiss reason
            <input className="mt-1 min-h-11 w-full rounded-lg border px-3" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <AnomalySettings thresholds={data?.thresholds} onSaved={onChanged} />
        </>
      ) : null}
    </section>
  );
}

function AnomalySettings({
  thresholds,
  onSaved,
}: {
  thresholds?: Record<string, number>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fareFloor: thresholds?.fareFloor ?? 5000,
    farePerKmMax: thresholds?.farePerKmMax ?? 500,
    longDistanceKm: thresholds?.longDistanceKm ?? 100,
    longDurationMin: thresholds?.longDurationMin ?? 180,
    speedHigh: thresholds?.speedHigh ?? 120,
    speedLow: thresholds?.speedLow ?? 3,
  });

  async function save() {
    setError('');
    try {
      await api.saveTripAnalyticsSettings(form);
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save thresholds');
    }
  }

  return (
    <div>
      <button type="button" className="min-h-11 text-sm text-indigo-700" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide thresholds' : 'Thresholds'}
      </button>
      {open ? (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border bg-white p-3 md:grid-cols-3">
          {([
            ['fareFloor', 'Fare floor (J$)'],
            ['farePerKmMax', 'Fare per km max'],
            ['longDistanceKm', 'Long trip (km)'],
            ['longDurationMin', 'Long trip (min)'],
            ['speedHigh', 'Too fast (km/h)'],
            ['speedLow', 'Too slow (km/h)'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-xs text-slate-600">
              {label}
              <input
                className="mt-1 min-h-11 w-full rounded-lg border px-2"
                type="number"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <button type="button" className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm text-white" onClick={save}>Save</button>
          {error ? <p className="col-span-2 text-sm text-rose-700">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
