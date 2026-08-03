import { FormEvent, useMemo, useState } from 'react';
import {
  useCreateServiceZone,
  useDeleteServiceZone,
  useServiceZones,
} from '@/app/hooks/useLogistics';

/** Simple Kingston-area default rectangle as GeoJSON Polygon (lng,lat). */
function defaultPolygon(): Record<string, unknown> {
  return {
    type: 'Polygon',
    coordinates: [[
      [-76.95, 17.95],
      [-76.7, 17.95],
      [-76.7, 18.1],
      [-76.95, 18.1],
      [-76.95, 17.95],
    ]],
  };
}

function parseGeoJsonInput(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.type === 'Feature') {
      return (parsed.geometry as Record<string, unknown>) || null;
    }
    if (parsed.type === 'Polygon' || parsed.type === 'MultiPolygon') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function ServiceZonesPage() {
  const { data, isLoading, error } = useServiceZones();
  const create = useCreateServiceZone();
  const del = useDeleteServiceZone();
  const [formError, setFormError] = useState<string | null>(null);
  const [geoText, setGeoText] = useState(() => JSON.stringify(defaultPolygon(), null, 2));
  const zones = data?.zones ?? [];

  const previewHint = useMemo(() => {
    const g = parseGeoJsonInput(geoText);
    return g ? 'GeoJSON looks valid' : 'Paste a Polygon / MultiPolygon (or Feature)';
  }, [geoText]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const geojson = parseGeoJsonInput(geoText);
    if (!geojson) {
      setFormError('Invalid GeoJSON polygon');
      return;
    }
    try {
      await create.mutateAsync({
        name: String(fd.get('name') || ''),
        kind: String(fd.get('kind') || 'service') as 'service' | 'pricing',
        geojson,
        active: true,
      });
      e.currentTarget.reset();
      setGeoText(JSON.stringify(defaultPolygon(), null, 2));
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Service zones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Active service zones block bookings outside the area. Pricing zones feed zone rate cards.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            required
            placeholder="Zone name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select name="kind" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="service">Service (booking gate)</option>
            <option value="pricing">Pricing</option>
          </select>
        </div>
        <label className="block text-sm text-slate-600">
          GeoJSON polygon
          <textarea
            value={geoText}
            onChange={(e) => setGeoText(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <p className="text-xs text-slate-500">{previewHint}</p>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"
        >
          Save zone
        </button>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </form>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {!isLoading && zones.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No zones yet — bookings stay unrestricted until you add an active service zone.
        </p>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {zones.map((z) => (
          <li key={String(z.id)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{String(z.name)}</p>
              <p className="text-slate-500">
                {String(z.kind)} · {z.active ? 'active' : 'inactive'}
              </p>
            </div>
            <button
              type="button"
              disabled={del.isPending}
              onClick={() => void del.mutateAsync(String(z.id))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
