// Stitch: dominion-redesign/579778d10ceb40fbaa1da40705113cde
// Stitch: dominion-redesign/b3e2ccc77e0c4bb2ab51ff25d19e1b96
// Stitch: dominion-redesign/b49f74abedeb4478b1d20571a17c7348
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

function asVertices(points: unknown): DashZoneVertex[] {
  if (!Array.isArray(points)) return [];
  const ring: DashZoneVertex[] = [];
  for (const point of points) {
    if (!point || typeof point !== 'object') continue;
    const lat = Number((point as { lat?: unknown }).lat);
    const lng = Number((point as { lng?: unknown }).lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) ring.push({ lat, lng });
  }
  return ring;
}

function ringToGeoJson(ring: DashZoneVertex[]) {
  const coordinates = ring.map((point) => [point.lng, point.lat]);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) coordinates.push([...first]);
  return { type: 'Polygon', coordinates: [coordinates] };
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
        if (page === 'world-quality' || page === 'world-imports') {
          const [qualityBody, importBody] = await Promise.all([
            geoFetch(accessToken, '/geo/quality'),
            geoFetch(accessToken, '/geo/imports'),
          ]);
          if (!cancelled) {
            setIssues((qualityBody.issues as typeof issues) ?? []);
            setRuns((importBody.runs as ImportRun[]) ?? []);
          }
          return;
        }
        if (page === 'world-places') {
          const body = await geoFetch(accessToken, '/geo/places');
          if (!cancelled) setPins((body.places as Pin[]) ?? []);
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

  const title =
    level != null || page === 'world-jamaica'
      ? 'Jamaica map'
      : page === 'world-places'
        ? 'Places and pins'
        : page === 'world-imports' || page === 'world-quality'
          ? 'Map imports'
          : 'Places';
  const lede =
    level != null || page === 'world-jamaica'
      ? 'The published map of Jamaica, from the country down to communities.'
      : page === 'world-places'
        ? 'Named pins. These are points, not parish boundaries.'
        : page === 'world-imports' || page === 'world-quality'
          ? 'Dry run an import, then publish it.'
          : 'Dominion owns these borders. Publish sends one place to every app after you confirm.';

  const levelButtons: Array<{ id: string; label: string }> = [
    { id: 'world-jamaica', label: 'Country' },
    { id: 'world-parishes', label: 'Parishes' },
    { id: 'world-towns', label: 'Towns' },
    { id: 'world-communities', label: 'Communities' },
  ];

  return (
    <div className="min-h-[640px] flex-1 overflow-y-auto bg-white p-8 text-slate-900">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <div className="flex items-center justify-between text-xs">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-slate-500">
            <span>Dominion</span>
            <span className="text-slate-300">/</span>
            <span>Master data</span>
            <span className="text-slate-300">/</span>
            <span>Places and Maps</span>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-slate-900">{title}</span>
          </nav>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            <span>REGION: JM-KGN</span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{lede}</p>
        </div>

        {(level != null || page === 'world-jamaica') && (
          <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 text-xs font-medium text-slate-500">Map view level:</span>
              <div className="inline-flex rounded-lg border border-slate-200/80 bg-slate-100 p-1 text-xs">
                {levelButtons.map((btn) => {
                  const active = page === btn.id;
                  return (
                    <a
                      key={btn.id}
                      href={`?page=${btn.id}`}
                      className={`rounded-md px-3 py-1.5 transition-colors ${
                        active
                          ? 'border border-slate-200/60 bg-white font-semibold text-blue-600 shadow-sm'
                          : 'font-medium text-slate-600 hover:bg-white/50 hover:text-slate-900'
                      }`}
                    >
                      {btn.label}
                    </a>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-slate-400">
                PARTITION: {shown.length || places.length || '—'}
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search places..."
                className="w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
              />
            </div>
          </div>
        )}

        {page === 'world-places' ? (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
            <div className="relative w-80">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search places, landmarks, coordinates..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-4 text-xs shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>Total pins:</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono font-semibold text-slate-900">
                {pins.length}
              </span>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {page === 'world-quality' || page === 'world-imports' ? (
          <ImportPanel
            token={accessToken}
            canWrite={canWrite}
            runs={runs}
            onRuns={setRuns}
            issues={page === 'world-quality' || page === 'world-imports' ? issues : []}
            showQuality={page === 'world-quality' || page === 'world-imports'}
          />
        ) : null}

        {page === 'world-places' ? (
          <PinList token={accessToken} canWrite={canWrite} pins={pins} onChange={setPins} query={query} />
        ) : null}

        {page === 'world-jamaica' ? (
          <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm">
            <JamaicaOverviewMap
              parishes={parishes}
              shapes={townShapes}
              parishShapes={parishShapes}
              communityShapes={communityShapes}
              presentation="inline"
              onClose={() => undefined}
              onPick={setSelected}
            />
          </div>
        ) : null}

        {level != null ? (
          <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-12 overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm lg:col-span-4">
              <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Directory
              </div>
              <ul className="max-h-[40vh] space-y-1 overflow-auto p-3 lg:max-h-[70vh]">
                {shown.length === 0 ? (
                  <li className="px-2 py-6 text-center text-sm text-slate-500">The data is not in yet.</li>
                ) : (
                  shown.map((place) => (
                    <li key={place.pcode}>
                      <button
                        type="button"
                        onClick={() => setSelected(place.pcode)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selected === place.pcode ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <span className="font-medium">{place.name}</span>
                        <span className="mt-0.5 block font-mono text-xs text-slate-500">{place.pcode}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="col-span-12 overflow-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm lg:col-span-8">
              {selected ? (
                <PlacePanel token={accessToken} canWrite={canWrite} pcode={selected} />
              ) : (
                <p className="py-16 text-center text-sm text-slate-500">
                  Choose a place to see its border, versions, and publish preview.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {page === 'world-jamaica' && selected ? (
          <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm">
            <PlacePanel token={accessToken} canWrite={canWrite} pcode={selected} />
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-slate-100/70 px-4 py-3 text-xs text-slate-600">
          <span>The data is not in yet.</span>
          <span className="font-mono text-[11px] text-slate-400">LOC: KINGSTON / PARISH REGISTRY JMD</span>
        </div>
      </div>
    </div>
  );
}

function PlacePanel({ token, canWrite, pcode }: { token: string; canWrite: boolean; pcode: string }) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [liveRings, setLiveRings] = useState<DashZoneVertex[]>([]);
  const [editRing, setEditRing] = useState<DashZoneVertex[]>([]);
  const [chosenRings, setChosenRings] = useState<DashZoneVertex[]>([]);
  const [vertexCount, setVertexCount] = useState(0);
  const [placeName, setPlaceName] = useState(pcode);
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
        const shape = body.shape as { rings?: Ring[]; vertex_count?: number; edit_ring?: unknown };
        if (!cancelled) {
          setChosenRings(firstRing(shape?.rings));
          setVertexCount(Number(shape?.vertex_count ?? 0));
        }
        const live = versions.find((row) => row.status === 'published');
        if (live && live.id !== chosen) {
          const liveBody = await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${live.id}/shape`);
          const liveShape = liveBody.shape as { rings?: Ring[]; edit_ring?: unknown };
          if (!cancelled) {
            setLiveRings(firstRing(liveShape?.rings));
            setEditRing(asVertices(liveShape?.edit_ring));
          }
        } else if (!cancelled) {
          setLiveRings(firstRing(shape?.rings));
          setEditRing(asVertices(shape?.edit_ring));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this border');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, pcode, chosen, versions]);

  const reloadVersions = async (selectId?: string) => {
    const versionBody = await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions`);
    const rows = (versionBody.versions as VersionRow[]) ?? [];
    setVersions(rows);
    const next = selectId && rows.some((row) => row.id === selectId)
      ? selectId
      : (rows.find((row) => row.status === 'published') ?? rows[0])?.id ?? null;
    setChosen(next);
  };

  const preview = async () => {
    if (!chosen || !canWrite) return;
    setError('');
    setMessage('');
    try {
      const body = await geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${chosen}/impact`, {
        method: 'POST',
        body: '{}',
      });
      setImpact((body.impact as Impact) ?? null);
    } catch (e) {
      setImpact(null);
      setError(e instanceof Error ? e.message : 'Preview failed');
    }
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
      setConfirmName('');
      await reloadVersions(chosen);
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
    await reloadVersions(versionId || undefined);
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
                {version.status === 'retired' ? (
                  <span className="block text-emerald-700">Restore this version</span>
                ) : null}
                <span className="block text-slate-500">{version.source || 'map'} · {new Date(version.created_at).toLocaleDateString()}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-h-[280px]">
          {drawing ? (
            editRing.length >= 3 ? (
            <ZoneMapEditor
              zones={[]}
              uiMode="adjust"
              foundationScope={adminLevel === 1 ? 'parish' : 'town'}
              townIncludePolygons={[editRing]}
              initialPolygon={editRing}
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
              <p className="text-sm text-slate-500">Loading the live border…</p>
            )
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
      <p className="text-xs text-slate-500">The map line is simplified. Draw a replacement starts from the full live border.</p>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          {versions.find((version) => version.id === chosen)?.status === 'retired' ? (
            <p className="w-full text-xs text-slate-600">Preview, then confirm publish. That makes this older border the live one.</p>
          ) : null}
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

function PinList({
  token,
  canWrite,
  pins,
  onChange,
  query = '',
}: {
  token: string;
  canWrite: boolean;
  pins: Pin[];
  onChange: (pins: Pin[]) => void;
  query?: string;
}) {
  const [editing, setEditing] = useState<Pin | null>(null);
  const [error, setError] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = pins.filter(
    (pin) =>
      !needle ||
      pin.name.toLowerCase().includes(needle) ||
      String(pin.lat).includes(needle) ||
      String(pin.lng).includes(needle),
  );
  const save = async () => {
    if (!editing) return;
    setError('');
    try {
      const body = await geoFetch(token, `/geo/places/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editing.name, lat: editing.lat, lng: editing.lng, status: editing.status }),
      });
      const place = body.place as Pin;
      onChange(pins.map((pin) => (pin.id === editing.id ? { ...pin, ...place } : pin)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this pin');
    }
  };
  return (
    <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm">
      {error ? <p className="border-b border-slate-100 px-6 py-2 text-sm text-red-600">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Parish</th>
              <th className="px-6 py-3">Kind</th>
              <th className="px-6 py-3">Coordinates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-slate-500">
                  The data is not in yet.
                </td>
              </tr>
            ) : (
              shown.map((pin) => (
                <tr key={pin.id} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-6 py-3.5 font-medium text-slate-900">
                    <button type="button" className="text-left" onClick={() => canWrite && setEditing(pin)}>
                      {pin.name}
                    </button>
                  </td>
                  <td className="px-6 py-3.5 text-slate-700">{pin.pcode || '—'}</td>
                  <td className="px-6 py-3.5">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {pin.status || 'Pin'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs text-slate-600">
                    {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editing ? (
        <div className="grid gap-2 border-t border-slate-100 p-4 md:grid-cols-2">
          <input
            value={editing.name}
            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={editing.lat}
            onChange={(event) => setEditing({ ...editing, lat: Number(event.target.value) })}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={editing.lng}
            onChange={(event) => setEditing({ ...editing, lng: Number(event.target.value) })}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <select
            value={editing.status}
            onChange={(event) => setEditing({ ...editing, status: event.target.value })}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="retired">Retired</option>
          </select>
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
          >
            Save pin
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 p-4 text-xs text-slate-500">
        <span>The data is not in yet.</span>
        <span className="font-mono text-[11px] text-slate-400">LOC: KINGSTON / PARISH REGISTRY JMD</span>
      </div>
    </div>
  );
}

function ImportPanel({
  token,
  canWrite,
  runs,
  onRuns,
  issues = [],
  showQuality = true,
}: {
  token: string;
  canWrite: boolean;
  runs: ImportRun[];
  onRuns: (runs: ImportRun[]) => void;
  issues?: { pcode: string; name: string; issue: string }[];
  showQuality?: boolean;
}) {
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
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
    setReport(
      saveDrafts
        ? `Drafts saved: ${counts?.drafts_saved ?? 0}. Nothing was published.`
        : `Matched ${counts?.matched ?? 0}, unknown ${counts?.unknown ?? 0}, broken ${counts?.broken ?? 0}. Nothing was written.`,
    );
    const list = await geoFetch(token, '/geo/imports');
    onRuns((list.runs as ImportRun[]) ?? []);
  };
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Import versions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Check a GeoJSON file against the official map. Saving drafts does not publish.
          </p>
        </div>
        {canWrite ? (
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".geojson,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const saveDrafts = window.confirm(
                  'Save matching places as drafts? Cancel only checks the file (dry run).',
                );
                try {
                  await send(file, saveDrafts);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not check that file');
                } finally {
                  event.target.value = '';
                }
              }}
            />
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => {
                const input = fileRef.current;
                if (!input) return;
                input.dataset.mode = 'dry';
                input.click();
              }}
            >
              Dry run
            </button>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              onClick={() => {
                const input = fileRef.current;
                if (!input) return;
                input.click();
              }}
            >
              Publish
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Only the platform owner can check or save a file.</p>
        )}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {report ? <p className="text-sm text-emerald-700">{report}</p> : null}

      <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold tracking-wide text-slate-500">
              <th className="px-5 py-3">File</th>
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                  The data is not in yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className="transition-colors hover:bg-slate-50/40">
                  <td className="px-5 py-3.5 font-mono font-medium text-slate-800">
                    {run.file_name || 'Import'}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">
                    {new Date(run.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      {run.dry_run ? 'Dry run passed' : `Drafts ${run.counts?.drafts_saved ?? 0}`}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showQuality ? (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Map quality</h2>
            <p className="text-xs text-slate-500">Shape problems.</p>
          </div>
          <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold tracking-wide text-slate-500">
                  <th className="px-5 py-3">Shape</th>
                  <th className="px-5 py-3">Problem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {issues.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-5 py-8 text-center text-slate-500">
                      The data is not in yet.
                    </td>
                  </tr>
                ) : (
                  issues.map((issue) => (
                    <tr key={`${issue.pcode}-${issue.issue}`} className="transition-colors hover:bg-slate-50/40">
                      <td className="px-5 py-3.5 font-medium text-slate-800">
                        {issue.name} ({issue.pcode})
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                          {issue.issue}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
