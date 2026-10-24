import { useEffect, useMemo, useState } from 'react';
import { API_ENDPOINTS } from '../../../services/apiConfig';

type Place = {
  pcode: string;
  admin_level: number;
  parent_pcode: string | null;
  name: string;
  slug: string;
  status: string;
  center_lat: number | null;
  center_lng: number | null;
};

type Shape = Place & {
  version?: number;
  source?: string;
  rings?: { kind?: string; polygon?: { lat: number; lng: number }[] }[];
};

const PAGE_LEVEL: Record<string, number | null> = {
  'world-jamaica': null,
  'world-parishes': 1,
  'world-towns': 2,
  'world-communities': 3,
  'world-places': null,
  'world-imports': null,
  'world-quality': null,
};

function JamaicaShapeMap({ shapes, onPick }: { shapes: Shape[]; onPick: (pcode: string) => void }) {
  const project = (lng: number, lat: number) => {
    const x = ((lng + 78.45) / 2.35) * 640;
    const y = ((18.58 - lat) / 0.95) * 360;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  return (
    <svg viewBox="0 0 640 360" className="h-[280px] w-full rounded-lg bg-sky-50 md:h-[420px]" role="img" aria-label="Jamaica map">
      {shapes.map((shape) =>
        (shape.rings ?? []).map((ring, index) => (
          <polygon
            key={`${shape.pcode}-${index}`}
            points={(ring.polygon ?? []).map((point) => project(point.lng, point.lat)).join(' ')}
            className="cursor-pointer fill-emerald-700/35 stroke-emerald-900 hover:fill-emerald-600/60"
            onClick={() => onPick(shape.pcode)}
          >
            <title>{shape.name}</title>
          </polygon>
        )),
      )}
    </svg>
  );
}

async function geoFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_ENDPOINTS.catalog}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: { message?: string; error?: string; [key: string]: unknown } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    const detail = body.message || (typeof body.error === 'string' ? body.error : '') || text.slice(0, 180);
    throw new Error(detail || 'Map request failed');
  }
  return body;
}

export function WorldMapsPage({
  page,
  accessToken,
  canWrite,
}: {
  page: string;
  accessToken: string;
  canWrite: boolean;
}) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [issues, setIssues] = useState<{ pcode: string; name: string; issue: string }[]>([]);
  const [placesPins, setPlacesPins] = useState<{ id: string; name: string; lat: number; lng: number; status: string; pcode: string | null }[]>([]);
  const [runs, setRuns] = useState<{ id: string; file_name: string | null; counts: { created?: number; unchanged?: number }; dry_run: boolean; created_at: string }[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<string>('');
  const [impact, setImpact] = useState<string>('');
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');
  const level = PAGE_LEVEL[page];

  useEffect(() => {
    let cancelled = false;
    setError('');
    void (async () => {
      try {
        if (page === 'world-quality') {
          const body = await geoFetch(accessToken, '/geo/quality');
          if (!cancelled) setIssues(body.issues ?? []);
          return;
        }
        if (page === 'world-places') {
          const body = await geoFetch(accessToken, '/geo/places');
          if (!cancelled) setPlacesPins(body.places ?? []);
          return;
        }
        if (page === 'world-imports') {
          const body = await geoFetch(accessToken, '/geo/imports');
          if (!cancelled) setRuns(body.runs ?? []);
          return;
        }
        const levelQuery = level == null ? '' : `?level=${level}`;
        const body = await geoFetch(accessToken, `/geo/boundaries${levelQuery}`);
        if (!cancelled) setPlaces(body.boundaries ?? []);
        const shapeLevels = page === 'world-jamaica' ? '1,2' : String(level ?? 1);
        const shapeBody = await geoFetch(accessToken, `/geo/shapes?levels=${shapeLevels}`);
        if (!cancelled) setShapes(shapeBody.shapes ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load World Maps');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, page, level]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => !q || p.name.toLowerCase().includes(q) || p.pcode.toLowerCase().includes(q));
  }, [places, query]);

  const openPlace = async (pcode: string) => {
    setSelected(pcode);
    setImpact('');
    const body = await geoFetch(accessToken, `/geo/boundaries/${encodeURIComponent(pcode)}`);
    const used = body.used_by;
    setDetail(
      `${body.place?.name ?? pcode} · ${body.version?.source ?? 'COD-AB'} v${body.version?.version ?? 1}. Used by Rush: ${used?.rush_live_markets ?? 0} live markets.`,
    );
  };

  const publish = async () => {
    if (!selected || !canWrite) return;
    const versions = await geoFetch(accessToken, `/geo/boundaries/${encodeURIComponent(selected)}/versions`);
    const current = (versions.versions ?? []).find((v: { status: string }) => v.status === 'published') ?? versions.versions?.[0];
    if (!current) return;
    const preview = await geoFetch(
      accessToken,
      `/geo/boundaries/${encodeURIComponent(selected)}/versions/${current.id}/impact`,
      { method: 'POST', body: '{}' },
    );
    const card = preview.impact;
    setImpact(
      `Rush: ${card?.live_markets ?? 0} live markets, ${card?.merchants_moving ?? 0} merchants would move, ${card?.area_change_pct ?? 0}% area change.`,
    );
    if (card?.needs_typed_name && confirmName.trim().toLowerCase() !== String(card.name || '').toLowerCase()) {
      setError(`Type ${card.name} to publish.`);
      return;
    }
    await geoFetch(
      accessToken,
      `/geo/boundaries/${encodeURIComponent(selected)}/versions/${current.id}/publish`,
      { method: 'POST', body: JSON.stringify({ confirm_name: confirmName }) },
    );
    setImpact('Published to all apps.');
  };

  return (
    <div className="min-h-[640px] bg-white p-4 text-slate-900 md:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">World Maps</h2>
          <p className="text-sm text-slate-500">Parish, town, and community borders. Publish sends the change to every app.</p>
        </div>
        {level != null && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:w-64"
          />
        )}
      </div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {page === 'world-quality' ? (
        <ul className="space-y-2">
          {issues.length === 0 ? <li className="text-sm text-slate-500">No shape problems.</li> : null}
          {issues.map((issue) => (
            <li key={`${issue.pcode}-${issue.issue}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {issue.name} ({issue.pcode}) · {issue.issue}
            </li>
          ))}
        </ul>
      ) : null}
      {page === 'world-places' ? (
        <ul className="grid gap-2 md:grid-cols-2">
          {placesPins.map((pin) => (
            <li key={pin.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="font-medium">{pin.name}</span>
              <span className="ml-2 text-slate-500">{pin.status} · {pin.lat.toFixed(3)}, {pin.lng.toFixed(3)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {page === 'world-imports' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Upload a GeoJSON file to dry-run it against the official map. Nothing is overwritten until you publish.</p>
          {canWrite ? (
            <input
              type="file"
              accept=".geojson,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                const parsed = JSON.parse(text);
                const features = Array.isArray(parsed.features) ? parsed.features.map((f: { properties?: Record<string, string> }) => ({
                  pcode: f.properties?.pcode || f.properties?.PCODE,
                  name: f.properties?.name || f.properties?.NAME,
                })) : [];
                const body = await geoFetch(accessToken, '/geo/import', {
                  method: 'POST',
                  body: JSON.stringify({ dry_run: true, file_name: file.name, features }),
                });
                setRuns((rows) => [{ id: crypto.randomUUID(), file_name: file.name, counts: body.report, dry_run: true, created_at: new Date().toISOString() }, ...rows]);
              }}
            />
          ) : <p className="text-sm text-slate-500">Only the platform owner can import.</p>}
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {run.file_name || 'Import'} · {run.dry_run ? 'dry run' : 'saved'} · unchanged {run.counts?.unchanged ?? 0}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {page !== 'world-quality' && page !== 'world-places' && page !== 'world-imports' ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <ul className="order-2 max-h-[40vh] space-y-2 overflow-auto lg:order-1 lg:max-h-[70vh]">
            {shown.map((place) => (
              <li key={place.pcode}>
                <button
                  type="button"
                  onClick={() => void openPlace(place.pcode)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium">{place.name}</span>
                  <span className="ml-2 text-slate-500">{place.pcode}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="order-1 min-h-[280px] rounded-xl border border-slate-200 p-4 lg:order-2">
            <JamaicaShapeMap shapes={shapes} onPick={(pcode) => void openPlace(pcode)} />
            <p className="mt-2 text-sm text-slate-600">{shapes.length} shapes on this layer.</p>
            {detail ? <p className="mt-3 text-sm">{detail}</p> : <p className="mt-3 text-sm text-slate-500">Select a place.</p>}
            {impact ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm">{impact}</p> : null}
            {canWrite && selected ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder="Type the place name if asked"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => void publish()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                  Publish to all apps
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
