// Stitch: dominion-redesign/s36d-border-editor
import { useEffect, useMemo, useRef, useState } from 'react';
import { ZoneMapEditor } from '@roam/geo-ui';
import type { DashZoneVertex } from '@roam/dash-admin-client';
import { isOldTemplate, OLD_TEMPLATE_CONFIRM, sortBoundaryVersions } from '../boundaryVersions';
import { discardDraft, fetchImpact, fetchShape, fetchShapes, fetchVersions, publishVersion, saveDraft } from './levelsApi';
import { levelWord, simplifyRing, uploadRefusal, type DraftChecks, type ImpactView, type VersionRow } from './levelsFormat';
import { PublishDialog } from './PublishDialog';
import { VersionList } from './VersionList';

type Ring = { kind?: string; polygon?: DashZoneVertex[] };

export function BorderEditor({
  token,
  pcode,
  level,
  name,
  parentName,
  canWrite,
  onBack,
}: {
  token: string;
  pcode: string;
  level: number;
  name: string;
  parentName: string | null;
  canWrite: boolean;
  onBack: () => void;
}) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [ring, setRing] = useState<DashZoneVertex[]>([]);
  const [liveRing, setLiveRing] = useState<DashZoneVertex[]>([]);
  const [context, setContext] = useState<Array<{ id: string; name: string; polygon: DashZoneVertex[]; isActive: boolean; role?: 'parent' | 'sibling' }>>([]);
  const [detail, setDetail] = useState<'full' | 'medium' | 'light'>('medium');
  const [view, setView] = useState<'live' | 'draft' | 'both'>('both');
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapCardRef = useRef<HTMLDivElement | null>(null);
  const [impact, setImpact] = useState<ImpactView | null>(null);
  const [impactLoaded, setImpactLoaded] = useState(false);

  async function reloadVersions(prefer?: string) {
    const rows = sortBoundaryVersions(await fetchVersions(token, pcode));
    setVersions(rows);
    const next = rows.find((row) => row.id === prefer) || rows.find((row) => row.status === 'draft') || rows.find((row) => row.status === 'published') || rows[0];
    setChosen(next?.id ?? null);
    return rows;
  }

  useEffect(() => {
    let cancelled = false;
    void reloadVersions().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load versions');
    });
    return () => {
      cancelled = true;
    };
    // reload when the area changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pcode]);

  const selected = versions.find((row) => row.id === chosen) || null;
  const live = versions.find((row) => row.status === 'published') || null;
  const checks = (selected?.checks ?? null) as DraftChecks | null;

  useEffect(() => {
    if (!chosen) return;
    let cancelled = false;
    void fetchShape(token, pcode, chosen).then((body) => {
      if (cancelled) return;
      const shape = body.shape as { edit_ring?: DashZoneVertex[]; rings?: Ring[] } | undefined;
      const points = asVertices(shape?.edit_ring) ;
      const fromRings = points.length >= 3 ? points : firstRing(shape?.rings);
      setRing(fromRings);
    }).catch(() => {
      if (!cancelled) setRing([]);
    });
    return () => {
      cancelled = true;
    };
  }, [token, pcode, chosen]);

  useEffect(() => {
    if (!live?.id || live.id === chosen) {
      setLiveRing(ring);
      return;
    }
    let cancelled = false;
    void fetchShape(token, pcode, live.id).then((body) => {
      if (cancelled) return;
      const shape = body.shape as { edit_ring?: DashZoneVertex[]; rings?: Ring[] } | undefined;
      setLiveRing(asVertices(shape?.edit_ring).length ? asVertices(shape?.edit_ring) : firstRing(shape?.rings));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, pcode, live?.id, chosen, ring]);

  useEffect(() => {
    if (ring.length < 3) return;
    const lats = ring.map((point) => point.lat);
    const lngs = ring.map((point) => point.lng);
    const bbox = `${Math.min(...lngs)},${Math.min(...lats)},${Math.max(...lngs)},${Math.max(...lats)}`;
    let cancelled = false;
    void fetchShapes(token, level, bbox).then((body) => {
      if (cancelled) return;
      const shapes = (body.shapes as Array<{ pcode: string; name: string; parent_pcode?: string; rings?: Ring[] }>) || [];
      const parentCode = shapes.find((row) => row.pcode === pcode)?.parent_pcode;
      const drawn = shapes
        .filter((shape) => shape.pcode !== pcode)
        .map((shape) => ({
          id: shape.pcode,
          name: shape.name,
          polygon: firstRing(shape.rings),
          isActive: false,
          role: shape.pcode === parentCode ? 'parent' as const : 'sibling' as const,
        }))
        .filter((shape) => shape.polygon.length >= 3);
      const parent = drawn.find((shape) => shape.role === 'parent');
      const siblings = drawn.filter((shape) => shape.role !== 'parent').slice(0, parent ? 11 : 12);
      setContext(parent ? [parent, ...siblings] : siblings);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, level, pcode, ring]);

  const shown = useMemo(() => {
    if (view === 'live') return liveRing.length ? liveRing : ring;
    return simplifyRing(ring, drawing ? detail : 'full');
  }, [view, liveRing, ring, drawing, detail]);

  const scope = level === 1 ? 'parish' : level === 3 ? 'community' : 'town';

  async function store(geojson: unknown, notes: string) {
    const body = await saveDraft(token, pcode, geojson, notes);
    setDrawing(false);
    await reloadVersions(String(body.version_id || ''));
  }

  async function onUpload(file: File) {
    const parsed = JSON.parse(await file.text()) as { type?: string; features?: Array<{ geometry?: { type?: string } }>; geometry?: { type?: string } };
    const features = parsed.type === 'FeatureCollection' ? parsed.features ?? [] : [parsed];
    const geometry = features[0]?.geometry || (parsed.geometry ? parsed.geometry : null);
    const refusal = uploadRefusal(features.length, geometry?.type ?? null);
    if (refusal || !geometry) {
      setError(refusal || 'This file has no area shape.');
      return;
    }
    await store(geometry, `Uploaded ${file.name}. Detail: ${detail}`);
  }

  async function openPublish() {
    if (!selected) return;
    if (isOldTemplate(selected.notes) && !window.confirm(OLD_TEMPLATE_CONFIRM)) return;
    setImpact(null);
    setImpactLoaded(false);
    setPublishing(true);
    try {
      const body = await fetchImpact(token, pcode, selected.id);
      setImpact(body);
      setImpactLoaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not preview the impact');
      setPublishing(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
      data-stitch="border editor — half way tree live draft both full medium light remove fit_screen fullscreen half way tree more_vert discard draft preview and publish… arrow_forward draw replacement upload geojson"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-semibold">S36d</span>
          <h2 className="text-base font-headline font-bold text-on-surface tracking-tight">Border Editor — {name}</h2>
          {selected?.status === 'draft' ? <span className="text-xs font-mono text-secondary bg-secondary-container px-2 py-0.5 rounded font-medium">Draft active</span> : null}
        </div>
        <div className="text-xs font-mono text-outline">Vector Geometry Workspace</div>
      </div>
      {error ? <p className="text-xs text-error">{error}</p> : null}
      <div className="grid grid-cols-12 gap-6 items-start">
        <div ref={mapCardRef} className="col-span-12 xl:col-span-8 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col relative">
          <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="pointer-events-auto bg-surface-container-lowest/95 backdrop-blur shadow-md p-1 rounded-lg flex items-center gap-1 text-xs">
              {(['live', 'draft', 'both'] as const).map((item) => (
                <button key={item} type="button" className={view === item ? 'px-3 py-1 rounded bg-secondary text-on-secondary font-semibold shadow-sm' : 'px-3 py-1 rounded text-on-surface-variant hover:text-on-surface transition-colors font-medium'} onClick={() => setView(item)}>
                  {item === 'live' ? 'Live' : item === 'draft' ? 'Draft' : 'Both'}
                </button>
              ))}
            </div>
            <div className="pointer-events-auto bg-surface-container-lowest/95 backdrop-blur shadow-md p-1 rounded-lg flex items-center gap-1 text-xs">
              <span className="text-[11px] font-label text-outline px-2">Detail:</span>
              {(['full', 'medium', 'light'] as const).map((item) => (
                <button key={item} type="button" className={detail === item ? 'px-2.5 py-1 rounded bg-surface-container text-on-surface font-semibold' : 'px-2.5 py-1 rounded text-on-surface-variant font-medium'} onClick={() => setDetail(item)}>
                  {item === 'full' ? 'Full' : item === 'medium' ? 'Medium' : 'Light'}
                </button>
              ))}
            </div>
            <div className="pointer-events-auto bg-surface-container-lowest/95 backdrop-blur shadow-md p-1 rounded-lg flex items-center gap-0.5 text-on-surface-variant">
              <button type="button" className="w-7 h-7 flex items-center justify-center hover:bg-surface-container rounded transition-colors" title="Zoom in" onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 13) + 1)}>
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
              <button type="button" className="w-7 h-7 flex items-center justify-center hover:bg-surface-container rounded transition-colors" title="Zoom out" onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 13) - 1)}>
                <span className="material-symbols-outlined text-[18px]">remove</span>
              </button>
              <div className="w-px h-3.5 bg-surface-container-highest mx-0.5" />
              <button type="button" className="w-7 h-7 flex items-center justify-center hover:bg-surface-container rounded transition-colors" title="Fit extent" onClick={() => fitMap(mapRef.current, shown)}>
                <span className="material-symbols-outlined text-[18px]">fit_screen</span>
              </button>
              <button type="button" className="w-7 h-7 flex items-center justify-center hover:bg-surface-container rounded transition-colors" title="Fullscreen" onClick={() => {
                const node = mapCardRef.current;
                if (!node) return;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void node.requestFullscreen();
              }}>
                <span className="material-symbols-outlined text-[18px]">fullscreen</span>
              </button>
            </div>
          </div>
          <div className="relative w-full h-[540px] bg-slate-100 overflow-hidden">
            {shown.length >= 3 ? (
              <ZoneMapEditor
                key={`${chosen}-${detail}-${drawing ? 'draw' : 'view'}-${view}`}
                zones={view !== 'draft' && liveRing.length >= 3 ? [{ id: 'live', name: 'Live border', kind: 'include', polygon: liveRing }] : []}
                uiMode={drawing ? 'adjust' : 'view'}
                foundationScope={scope}
                detail={detail}
                townIncludePolygons={[shown]}
                contextTownPolygons={context}
                initialPolygon={shown}
                mapToolsPlacement="none"
                bare
                mapHeight={540}
                onMapReady={(map) => { mapRef.current = map; }}
                onCancel={() => setDrawing(false)}
                onSave={(payload) => {
                  void store(ringToGeoJson(payload.polygon), `Drawn in Dominion. Detail: ${detail}`).catch((reason) => {
                    setError(reason instanceof Error ? reason.message : 'Could not save the drawing');
                  });
                }}
              />
            ) : (
              <p className="p-6 text-xs text-on-surface-variant">Loading the map…</p>
            )}
          </div>
          <div className="absolute bottom-4 left-4 z-20 bg-surface-container-lowest/95 backdrop-blur shadow-md p-2.5 rounded-lg flex flex-col gap-1.5 text-[11px] font-mono">
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-secondary" />
              <span className="text-on-surface">Live border (v{live?.version ?? 1})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 border-b-2 border-dashed border-amber-600" />
              <span className="text-amber-900 font-semibold">Draft border</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-slate-400" />
              <span className="text-on-surface-variant">Neighbours</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 border-b border-dashed border-primary" />
              <span className="text-on-surface-variant">{parentName || 'Parent'} parent</span>
            </div>
          </div>
        </div>
        <div className="col-span-12 xl:col-span-4 bg-surface-container-lowest rounded-xl shadow-sm p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-secondary" onClick={onBack}>
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              {level === 1 ? 'Parishes' : level === 2 ? 'Towns' : 'Communities'}
            </button>
            <div className="flex items-start justify-between mt-1">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-headline font-bold text-on-surface tracking-tight">{name}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-label font-semibold bg-surface-container text-on-surface-variant">{levelWord(level)}</span>
                </div>
                <div className="text-xs font-mono font-medium text-secondary mt-0.5">{pcode}</div>
              </div>
              <button type="button" className="w-7 h-7 rounded flex items-center justify-center text-outline hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-[18px]">more_vert</span>
              </button>
            </div>
            <div className="text-xs text-on-surface-variant font-mono">{!parentName || parentName === 'Jamaica' ? 'Jamaica' : `Jamaica › ${parentName}`}</div>
          </div>
          <VersionList
            rows={versions}
            chosen={chosen}
            canWrite={canWrite}
            onChoose={setChosen}
            onDiscard={(id) => {
              void discardDraft(token, pcode, id).then(() => reloadVersions()).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not discard'));
            }}
          />
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-label uppercase tracking-wider text-outline font-semibold">Draft checks</span>
            <div className="bg-surface-container-low rounded-lg p-3 flex flex-col gap-2 text-xs">
              <Check label="Valid shape" value={checks ? 'Pass' : '—'} icon="check_circle" ok />
              <Check label="Outside parent" value={checks?.outside_parent_pct != null ? `${checks.outside_parent_pct}%` : '—'} icon="warning" warn={(checks?.outside_parent_pct ?? 0) > 2} />
              <Check label={checks?.overlap_with ? `Overlaps ${checks.overlap_with}` : 'Overlap'} value={checks?.overlap_pct != null ? `${checks.overlap_pct}%` : '—'} icon="warning" warn={(checks?.overlap_pct ?? 0) > 1} />
              <div className="h-px bg-surface-container-highest my-0.5" />
              <Check label="Area change" value={checks?.area_change_pct != null ? `${checks.area_change_pct}%` : '—'} />
              <Check label="Points" value={checks?.vertex_count != null ? String(checks.vertex_count) : String(ring.length)} />
            </div>
          </div>
          {canWrite ? (
            <div className="flex flex-col gap-2">
              <button type="button" className="w-full py-2.5 px-4 rounded-lg bg-secondary text-on-secondary font-headline font-semibold text-xs shadow" onClick={() => void openPublish()}>
                Preview and publish… <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="py-2 px-3 rounded-lg bg-surface-container text-on-surface font-medium text-xs" onClick={() => setDrawing(true)}>Draw replacement</button>
                <label className="py-2 px-3 rounded-lg bg-surface-container text-on-surface font-medium text-xs text-center cursor-pointer">
                  Upload GeoJSON
                  <input
                    className="hidden"
                    type="file"
                    accept=".geojson,.json,application/geo+json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onUpload(file).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not read the file'));
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="text-[11px] text-outline text-center">One area per file. For more, use Imports.</p>
            </div>
          ) : null}
        </div>
      </div>
      {publishing && selected ? (
        <PublishDialog
          name={name}
          version={selected.version}
          checks={checks}
          impact={impact}
          impactLoaded={impactLoaded}
          onCancel={() => setPublishing(false)}
          onConfirm={(typed) => {
            void publishVersion(token, pcode, selected.id, typed).then(() => reloadVersions()).then(() => setPublishing(false)).catch((reason) => {
              setError(reason instanceof Error ? reason.message : 'Publish failed');
            });
          }}
        />
      ) : null}
    </div>
  );
}

function fitMap(map: google.maps.Map | null, ring: Array<{ lat: number; lng: number }>) {
  if (!map || ring.length < 3) return;
  const bounds = new google.maps.LatLngBounds();
  ring.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds);
}

function Check({ label, value, icon, ok, warn }: { label: string; value: string; icon?: string; ok?: boolean; warn?: boolean }) {
  const tone = ok ? 'text-tertiary font-medium' : warn ? 'text-amber-700 font-medium' : 'text-on-surface-variant font-mono text-[11px]';
  return (
    <div className={`flex items-center justify-between ${tone}`}>
      <div className="flex items-center gap-1.5">
        {icon ? <span className="material-symbols-outlined text-[16px]">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <span className="font-mono text-[11px] font-semibold text-on-surface">{value}</span>
    </div>
  );
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

function firstRing(rings: Ring[] | undefined): DashZoneVertex[] {
  const include = (rings ?? []).find((ring) => ring.kind !== 'exclude') ?? rings?.[0];
  return asVertices(include?.polygon);
}

function ringToGeoJson(ring: DashZoneVertex[]) {
  const coordinates = ring.map((point) => [point.lng, point.lat]);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) coordinates.push([...first]);
  return { type: 'Polygon', coordinates: [coordinates] };
}
