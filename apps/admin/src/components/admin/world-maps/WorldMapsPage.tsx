import { useEffect, useMemo, useState } from 'react';
import { JamaicaOverviewMap, ZoneMapEditor } from '@roam/geo-ui';
import type { DashOverviewCommunityShape, DashOverviewParishShape, DashOverviewTownShape, DashParishRow, DashZoneVertex } from '@roam/dash-admin-client';
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
  current_version_id?: string | null;
};

type Ring = { kind?: string; polygon?: DashZoneVertex[] };
type Shape = Place & { version?: number; source?: string; rings?: Ring[] };
type VersionRow = { id: string; version: number; source?: string; notes?: string | null; status: string; created_at: string };
type MoveSummary = { merchant_name: string; from_market: string; to_market: string };
type Impact = {
  name?: string;
  already_live?: boolean;
  live_markets?: number;
  merchants_moving?: number;
  merchants_checked?: number;
  area_change_pct?: number;
  needs_typed_name?: boolean;
  zones_linked?: number;
  move_summaries?: MoveSummary[];
};
type Pin = { id: string; name: string; lat: number; lng: number; status: string; pcode: string | null };
type ImportRun = { id: string; file_name: string | null; counts: { matched?: number; unknown?: number; broken?: number; drafts_saved?: number }; dry_run: boolean; created_at: string };

const PAGE_LEVEL: Record<string, number | null> = {
  'world-jamaica': null,
  'world-parishes': 1,
  'world-towns': 2,
  'world-communities': 3,
  'world-places': null,
  'world-imports': null,
  'world-quality': null,
};

export function canWriteWorldMapsFromUser(user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  const roles: string[] = [];
  const perms: string[] = [];
  for (const bag of [user?.user_metadata, user?.app_metadata]) {
    if (!bag) continue;
    if (bag.role) roles.push(String(bag.role).toLowerCase());
    if (Array.isArray(bag.roles)) roles.push(...bag.roles.map((role) => String(role).toLowerCase()));
    if (Array.isArray(bag.permissions)) perms.push(...bag.permissions.map(String));
  }
  return roles.includes('platform_owner') || roles.includes('superadmin') || perms.includes('platform.geo.write');
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

function firstRing(rings: Ring[] | undefined): DashZoneVertex[] {
  const include = (rings ?? []).find((ring) => ring.kind !== 'exclude') ?? rings?.[0];
  return (include?.polygon ?? []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function ringToGeoJson(ring: DashZoneVertex[]) {
  const coordinates = ring.map((point) => [point.lng, point.lat]);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) coordinates.push([...first]);
  return { type: 'Polygon', coordinates: [coordinates] };
}

function seedTriangle(lat: number, lng: number): DashZoneVertex[] {
  const d = 0.02;
  return [
    { lat: lat + d, lng: lng - d },
    { lat: lat + d, lng: lng + d },
    { lat: lat - d, lng },
  ];
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
  const [pins, setPins] = useState<Pin[]>([]);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const level = PAGE_LEVEL[page];

  useEffect(() => {
    let cancelled = false;
    setError('');
    setSelected(null);
    void (async () => {
      try {
        if (page === 'world-quality') {
          const body = await geoFetch(accessToken, '/geo/quality');
          if (!cancelled) setIssues((body.issues as typeof issues) ?? []);
          return;
        }
        if (page === 'world-places') {
          const body = await geoFetch(accessToken, '/geo/places');
          if (!cancelled) setPins((body.places as Pin[]) ?? []);
          return;
        }
        if (page === 'world-imports') {
          const body = await geoFetch(accessToken, '/geo/imports');
          if (!cancelled) setRuns((body.runs as ImportRun[]) ?? []);
          return;
        }
        const levelQuery = level == null ? '' : `?level=${level}`;
        const body = await geoFetch(accessToken, `/geo/boundaries${levelQuery}`);
        if (!cancelled) setPlaces((body.boundaries as Place[]) ?? []);
        const shapeLevels = page === 'world-jamaica' ? '1,2,3' : String(level ?? 1);
        const shapeBody = await geoFetch(accessToken, `/geo/shapes?levels=${shapeLevels}`);
        if (!cancelled) setShapes((shapeBody.shapes as Shape[]) ?? []);
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
    return places.filter((place) => !q || place.name.toLowerCase().includes(q) || place.pcode.toLowerCase().includes(q));
  }, [places, query]);

  const parishes = useMemo<DashParishRow[]>(() => {
    return shapes.filter((shape) => shape.admin_level === 1).map((shape) => ({
      id: shape.pcode,
      name: shape.name,
      slug: shape.slug,
      pcode: shape.pcode,
      center_lat: shape.center_lat,
      center_lng: shape.center_lng,
      foundation_polygon: firstRing(shape.rings),
    }));
  }, [shapes]);

  const parishShapes = useMemo<DashOverviewParishShape[]>(() => {
    return shapes.filter((shape) => shape.admin_level === 1).map((shape) => ({
      parish_id: shape.pcode,
      name: shape.name,
      rings: (shape.rings ?? []) as DashOverviewParishShape['rings'],
    }));
  }, [shapes]);

  const townShapes = useMemo<DashOverviewTownShape[]>(() => {
    return shapes.filter((shape) => shape.admin_level === 2).map((shape) => ({
      market_id: shape.pcode,
      name: shape.name,
      pcode: shape.pcode,
      parish_id: shape.parent_pcode,
      is_active: true,
      center_lat: shape.center_lat,
      center_lng: shape.center_lng,
      rings: (shape.rings ?? []) as DashOverviewTownShape['rings'],
    }));
  }, [shapes]);

  const communityShapes = useMemo<DashOverviewCommunityShape[]>(() => {
    return shapes.filter((shape) => shape.admin_level === 3).map((shape) => ({
      pcode: shape.pcode,
      name: shape.name,
      parent_pcode: shape.parent_pcode,
      center_lat: shape.center_lat,
      center_lng: shape.center_lng,
      rings: (shape.rings ?? []) as DashOverviewCommunityShape['rings'],
    }));
  }, [shapes]);

  return (
    <div className="min-h-[640px] bg-white p-4 text-slate-900 md:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">World Maps</h2>
          <p className="text-sm text-slate-500">Dominion owns these borders. Publish sends one place to every app after you confirm.</p>
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
        <PinList token={accessToken} canWrite={canWrite} pins={pins} onChange={setPins} />
      ) : null}
      {page === 'world-imports' ? (
        <ImportPanel token={accessToken} canWrite={canWrite} runs={runs} onRuns={setRuns} />
      ) : null}
      {page === 'world-jamaica' ? (
        <JamaicaOverviewMap
          parishes={parishes}
          shapes={townShapes}
          parishShapes={parishShapes}
          communityShapes={communityShapes}
          presentation="inline"
          onClose={() => undefined}
          onPick={setSelected}
        />
      ) : null}
      {level != null ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <ul className="max-h-[40vh] space-y-2 overflow-auto lg:max-h-[70vh]">
            {shown.map((place) => (
              <li key={place.pcode}>
                <button
                  type="button"
                  onClick={() => setSelected(place.pcode)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selected === place.pcode ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}
                >
                  <span className="font-medium">{place.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{place.pcode}</span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <PlacePanel token={accessToken} canWrite={canWrite} pcode={selected} />
          ) : (
            <p className="text-sm text-slate-500">Choose a place to see its border, versions, and publish preview.</p>
          )}
        </div>
      ) : null}
      {page === 'world-jamaica' && selected ? (
        <div className="mt-4">
          <PlacePanel token={accessToken} canWrite={canWrite} pcode={selected} />
        </div>
      ) : null}
    </div>
  );
}

function PlacePanel({ token, canWrite, pcode }: { token: string; canWrite: boolean; pcode: string }) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [liveRings, setLiveRings] = useState<DashZoneVertex[]>([]);
  const [chosenRings, setChosenRings] = useState<DashZoneVertex[]>([]);
  const [vertexCount, setVertexCount] = useState(0);
  const [placeName, setPlaceName] = useState(pcode);
  const [center, setCenter] = useState({ lat: 18.1, lng: -77.3 });
  const [adminLevel, setAdminLevel] = useState(1);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setImpact(null);
    setDrawing(false);
    setMessage('');
    setError('');
    void (async () => {
      try {
        const [detail, versionBody] = await Promise.all([
          geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}`),
          geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions`),
        ]);
        const place = detail.place as Place | undefined;
        const rows = (versionBody.versions as VersionRow[]) ?? [];
        const current = rows.find((row) => row.status === 'published') ?? rows[0];
        if (cancelled) return;
        setPlaceName(place?.name ?? pcode);
        setAdminLevel(Number(place?.admin_level ?? 1));
        if (place?.center_lat != null && place.center_lng != null) {
          setCenter({ lat: place.center_lat, lng: place.center_lng });
        }
        setVersions(rows);
        setChosen(current?.id ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this place');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, pcode]);

  useEffect(() => {
    if (!chosen) return;
    let cancelled = false;
    void (async () => {
      try {
        const body = await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${chosen}/shape`);
        const shape = body.shape as { rings?: Ring[]; vertex_count?: number };
        if (!cancelled) {
          setChosenRings(firstRing(shape?.rings));
          setVertexCount(Number(shape?.vertex_count ?? 0));
        }
        const live = versions.find((row) => row.status === 'published');
        if (live && live.id !== chosen) {
          const liveBody = await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${live.id}/shape`);
          const liveShape = liveBody.shape as { rings?: Ring[] };
          if (!cancelled) setLiveRings(firstRing(liveShape?.rings));
        } else if (!cancelled) {
          setLiveRings(firstRing(shape?.rings));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this border');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, pcode, chosen, versions]);

  const preview = async () => {
    if (!chosen || !canWrite) return;
    setError('');
    setMessage('');
    const body = await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${chosen}/impact`, {
      method: 'POST',
      body: '{}',
    });
    setImpact((body.impact as Impact) ?? null);
  };

  const publish = async () => {
    if (!chosen || !canWrite || !impact || impact.already_live) return;
    setError('');
    try {
      await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${chosen}/publish`, {
        method: 'POST',
        body: JSON.stringify({ confirm_name: confirmName }),
      });
      setMessage('Published to all apps.');
      setImpact(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    }
  };

  const saveDraft = async (geojson: unknown, notes: string) => {
    setError('');
    const body = await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions`, {
      method: 'POST',
      body: JSON.stringify({ geojson, notes }),
    });
    const versionId = String(body.version_id ?? '');
    const versionBody = await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions`);
    setVersions((versionBody.versions as VersionRow[]) ?? []);
    if (versionId) setChosen(versionId);
    setDrawing(false);
    setImpact(null);
    setMessage('Draft saved. Preview it, then confirm publish. Nothing is live yet.');
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold">{placeName}</h3>
        <p className="text-xs text-slate-500">{pcode} · official border has {vertexCount || '—'} points and is view-only</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <div className="grid gap-3 md:grid-cols-[220px_1fr]">
        <ul className="max-h-64 space-y-1 overflow-auto">
          {versions.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => {
                  setChosen(version.id);
                  setImpact(null);
                }}
                className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs ${chosen === version.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}
              >
                v{version.version} · {version.status}
                <span className="block text-slate-500">{version.source || 'map'} · {new Date(version.created_at).toLocaleDateString()}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-h-[280px]">
          {drawing ? (
            <ZoneMapEditor
              zones={[]}
              uiMode="adjust"
              foundationScope={adminLevel === 1 ? 'parish' : 'town'}
              townIncludePolygons={[seedTriangle(center.lat, center.lng)]}
              initialPolygon={seedTriangle(center.lat, center.lng)}
              mapToolsPlacement="none"
              mapHeight={360}
              onCancel={() => setDrawing(false)}
              onSave={(payload) => {
                void saveDraft(ringToGeoJson(payload.polygon), 'Drawn in World Maps').catch((e) => {
                  setError(e instanceof Error ? e.message : 'Could not save the drawing');
                });
              }}
            />
          ) : (
            <ZoneMapEditor
              zones={liveRings.length >= 3 ? [{
                id: adminLevel === 1 ? 'parish-foundation' : 'live',
                name: 'Live border',
                kind: 'include',
                polygon: liveRings,
              }] : []}
              uiMode="view"
              foundationScope={adminLevel === 1 ? 'parish' : 'town'}
              townIncludePolygons={chosenRings.length >= 3 ? [chosenRings] : []}
              initialPolygon={chosenRings}
              mapToolsPlacement="none"
              mapHeight={360}
              onCancel={() => undefined}
              onSave={() => undefined}
            />
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">The map line is simplified so it can be drawn. Replacing a border uses an uploaded file or a new drawing. It never saves this simplified line back.</p>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void preview()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Preview</button>
          <button type="button" onClick={() => setDrawing(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Draw a replacement</button>
          <label className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Upload GeoJSON
            <input
              type="file"
              accept=".geojson,.json"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const parsed = JSON.parse(await file.text());
                  const geometry = parsed.type === 'Feature' ? parsed.geometry : parsed.type === 'FeatureCollection' ? parsed.features?.[0]?.geometry : parsed;
                  await saveDraft(geometry, `Uploaded ${file.name}`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not read that file');
                }
              }}
            />
          </label>
        </div>
      ) : <p className="text-sm text-slate-500">Only the platform owner can change borders.</p>}
      {impact ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          {impact.already_live ? (
            <p>This border is already live. Publish does nothing.</p>
          ) : (
            <>
              <p>{impact.live_markets ?? 0} live markets · {impact.merchants_checked ?? 0} merchants checked · {impact.merchants_moving ?? 0} would move · {impact.area_change_pct ?? 0}% area change.</p>
              <ul className="mt-2 space-y-1">
                {(impact.move_summaries ?? []).map((move) => (
                  <li key={`${move.merchant_name}-${move.to_market}`}>{move.merchant_name}: {move.from_market} → {move.to_market}</li>
                ))}
              </ul>
              {impact.needs_typed_name ? (
                <input
                  value={confirmName}
                  onChange={(event) => setConfirmName(event.target.value)}
                  placeholder={`Type ${impact.name} to confirm`}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              ) : null}
              <button type="button" onClick={() => void publish()} className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white">Confirm publish</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PinList({ token, canWrite, pins, onChange }: { token: string; canWrite: boolean; pins: Pin[]; onChange: (pins: Pin[]) => void }) {
  const [editing, setEditing] = useState<Pin | null>(null);
  const [error, setError] = useState('');
  const save = async () => {
    if (!editing) return;
    setError('');
    try {
      const body = await geoFetch(token, `/geo/places/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editing.name, lat: editing.lat, lng: editing.lng, status: editing.status }),
      });
      const place = body.place as Pin;
      onChange(pins.map((pin) => pin.id === editing.id ? { ...pin, ...place } : pin));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this pin');
    }
  };
  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="grid gap-2 md:grid-cols-2">
        {pins.map((pin) => (
          <li key={pin.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <button type="button" className="text-left" onClick={() => canWrite && setEditing(pin)}>
              <span className="font-medium">{pin.name}</span>
              <span className="ml-2 text-slate-500">{pin.status} · {pin.lat.toFixed(3)}, {pin.lng.toFixed(3)}</span>
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
          <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
          <input value={editing.lat} onChange={(event) => setEditing({ ...editing, lat: Number(event.target.value) })} className="rounded-lg border px-3 py-2 text-sm" />
          <input value={editing.lng} onChange={(event) => setEditing({ ...editing, lng: Number(event.target.value) })} className="rounded-lg border px-3 py-2 text-sm" />
          <select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })} className="rounded-lg border px-3 py-2 text-sm">
            <option value="active">Active</option>
            <option value="retired">Retired</option>
          </select>
          <button type="button" onClick={() => void save()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Save pin</button>
        </div>
      ) : null}
    </div>
  );
}

function ImportPanel({ token, canWrite, runs, onRuns }: { token: string; canWrite: boolean; runs: ImportRun[]; onRuns: (runs: ImportRun[]) => void }) {
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const send = async (file: File, saveDrafts: boolean) => {
    setError('');
    setReport('');
    const parsed = JSON.parse(await file.text());
    const raw = Array.isArray(parsed.features) ? parsed.features : [];
    const features = raw.map((feature: { properties?: Record<string, string>; geometry?: unknown }) => ({
      pcode: feature.properties?.pcode || feature.properties?.PCODE,
      name: feature.properties?.name || feature.properties?.NAME,
      geometry: feature.geometry,
    }));
    const body = await geoFetch(token, '/geo/import', {
      method: 'POST',
      body: JSON.stringify({
        dry_run: !saveDrafts,
        save_drafts: saveDrafts,
        file_name: file.name,
        features,
      }),
    });
    const counts = body.report as ImportRun['counts'];
    setReport(saveDrafts
      ? `Drafts saved: ${counts?.drafts_saved ?? 0}. Nothing was published.`
      : `Matched ${counts?.matched ?? 0}, unknown ${counts?.unknown ?? 0}, broken ${counts?.broken ?? 0}. Nothing was written.`);
    const list = await geoFetch(token, '/geo/imports');
    onRuns((list.runs as ImportRun[]) ?? []);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Check a GeoJSON file against the official map. Saving drafts does not publish. Open each place to preview and confirm.</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {report ? <p className="text-sm text-emerald-700">{report}</p> : null}
      {canWrite ? (
        <input
          type="file"
          accept=".geojson,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const saveDrafts = window.confirm('Save matching places as drafts? Cancel only checks the file.');
            try {
              await send(file, saveDrafts);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not check that file');
            }
          }}
        />
      ) : <p className="text-sm text-slate-500">Only the platform owner can check or save a file.</p>}
      <ul className="space-y-2">
        {runs.map((run) => (
          <li key={run.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {run.file_name || 'Import'} · {run.dry_run ? 'file check' : 'drafts'} · matched {run.counts?.matched ?? 0} · drafts {run.counts?.drafts_saved ?? 0}
          </li>
        ))}
      </ul>
    </div>
  );
}
