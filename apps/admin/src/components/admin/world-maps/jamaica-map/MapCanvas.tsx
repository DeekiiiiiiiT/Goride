// Stitch: dominion-redesign/dfbd91b2308242d0bbbd33b83de0389e
// Stitch: dominion-redesign/7b43269438a14b948cbbba113e6f4e42
import { useEffect, useMemo, useRef, useState } from 'react';
import { JamaicaOverviewMap } from '@roam/geo-ui';
import type { DashOverviewCommunityShape, DashOverviewParishShape, DashOverviewTownShape, DashParishRow } from '@roam/dash-admin-client';
import { fetchPins, fetchSearch, fetchShapes, type MapShape, type SearchHit } from './jamaicaMapApi';
import { levelLabel, shapeRequests } from './jamaicaMapFormat';

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ''}`}>{name}</span>;
}

function firstRing(shape: MapShape) {
  const include = (shape.rings ?? []).find((ring) => ring.kind !== 'exclude') ?? shape.rings?.[0];
  return (include?.polygon ?? []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

export function MapCanvas({
  token,
  selected,
  selectedName,
  parentPcode,
  hoverPcode,
  onSelect,
}: {
  token: string;
  selected: string | null;
  selectedName: string | null;
  parentPcode: string | null;
  hoverPcode: string | null;
  onSelect: (pcode: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [zoom, setZoom] = useState(8);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [basemap, setBasemap] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [layers, setLayers] = useState({ parishes: true, towns: true, communities: false, pins: false });
  const [layersOpen, setLayersOpen] = useState(false);
  const [shapes, setShapes] = useState<MapShape[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(0);
  const [pins, setPins] = useState<Array<{ lat: number; lng: number; name: string }>>([]);
  const pinMarkers = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetchSearch(token, q)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, token]);

  useEffect(() => {
    if (!layers.pins) return;
    void fetchPins(token).then((rows) => {
      setPins(rows.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)).map((row) => ({
        lat: row.lat,
        lng: row.lng,
        name: row.name,
      })));
    }).catch(() => setPins([]));
  }, [layers.pins, token]);

  useEffect(() => {
    let cancelled = false;
    const requests = shapeRequests(zoom, bbox, layers);
    if (requests.length === 0) return;
    setLoading(true);
    void Promise.all(requests.map((request) => fetchShapes(token, request)))
      .then((groups) => {
        if (cancelled) return;
        const byCode = new Map<string, MapShape>();
        for (const group of groups) {
          for (const shape of group) byCode.set(shape.pcode, shape);
        }
        setShapes([...byCode.values()]);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the map.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, zoom, bbox, layers.parishes, layers.towns, layers.communities, attempt]);

  useEffect(() => {
    const map = mapRef.current;
    for (const marker of pinMarkers.current) marker.setMap(null);
    pinMarkers.current = [];
    if (!map || !layers.pins) return;
    pinMarkers.current = pins.map((pin) => new google.maps.Marker({
      map,
      position: { lat: pin.lat, lng: pin.lng },
      title: pin.name,
      clickable: false,
    }));
  }, [pins, layers.pins, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMapTypeId(basemap);
  }, [basemap]);

  const parishes = useMemo<DashParishRow[]>(() => {
    return shapes.filter((shape) => shape.admin_level === 1).map((shape) => ({
      id: shape.pcode,
      name: shape.name,
      slug: shape.slug,
      pcode: shape.pcode,
      center_lat: shape.center_lat,
      center_lng: shape.center_lng,
      foundation_polygon: firstRing(shape),
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

  function readView(map: google.maps.Map) {
    const z = map.getZoom();
    if (typeof z === 'number') setZoom((prev) => (prev === z ? prev : z));
    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const next: [number, number, number, number] = [
      Number(sw.lng().toFixed(3)),
      Number(sw.lat().toFixed(3)),
      Number(ne.lng().toFixed(3)),
      Number(ne.lat().toFixed(3)),
    ];
    setBbox((prev) => (prev && prev.every((value, index) => value === next[index]) ? prev : next));
  }

  function fitShape(pcode: string) {
    const map = mapRef.current;
    const shape = shapes.find((row) => row.pcode === pcode);
    if (!map || !shape) return;
    const ring = firstRing(shape);
    if (ring.length < 3) {
      if (shape.center_lat != null && shape.center_lng != null) {
        map.panTo({ lat: shape.center_lat, lng: shape.center_lng });
        map.setZoom(shape.admin_level >= 3 ? 14 : shape.admin_level === 2 ? 12 : 10);
      }
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const point of ring) bounds.extend(point);
    map.fitBounds(bounds, 48);
  }

  function fitJamaica() {
    const map = mapRef.current;
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    let any = false;
    for (const parish of parishes) {
      for (const point of parish.foundation_polygon ?? []) {
        bounds.extend(point);
        any = true;
      }
    }
    if (any) map.fitBounds(bounds, 32);
    else {
      map.setCenter({ lat: 18.15, lng: -77.3 });
      map.setZoom(8);
    }
  }

  const emptySearch = query.trim().length >= 2 && !searching && hits.length === 0;
  const showTowns = layers.towns && zoom >= 10;
  const showCommunities = layers.communities && zoom >= 12;
  const selectedShape = shapes.find((shape) => shape.pcode === selected);
  const communityCount = selected
    ? shapes.filter((shape) => shape.admin_level === 3 && shape.pcode.startsWith(selected)).length
    : 0;
  const selectedKind = selectedShape?.admin_level === 2
    ? 'Town (Active)'
    : selectedShape?.admin_level === 3
      ? 'Community'
      : 'Parish';

  return (
    <div ref={cardRef} className="lg:col-span-8 relative bg-[#e3ecf5] rounded-2xl shadow-sm overflow-hidden flex flex-col h-[340px] sm:h-[520px] lg:h-full select-none">
      <div className="absolute inset-0">
        {error ? (
          <div className="h-full bg-surface-container-low rounded-lg flex flex-col items-center justify-center p-4 text-center">
            <span className="text-xs font-bold text-on-surface">Could not load the map.</span>
            <span className="text-[11px] text-on-surface-variant mt-0.5">Nothing was changed.</span>
            <button
              className="mt-3 px-3 py-1 bg-surface-container text-xs font-semibold text-on-surface rounded-lg"
              type="button"
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <JamaicaOverviewMap
            parishes={parishes}
            parishShapes={parishShapes}
            shapes={showTowns ? townShapes : []}
            communityShapes={showCommunities ? communityShapes : []}
            showParishes={layers.parishes}
            showTowns={showTowns}
            presentation="inline"
            variant="master"
            chrome="none"
            autoFit={false}
            selectedPcode={selected}
            parentPcode={parentPcode}
            hoverPcode={hoverPcode}
            onClose={() => undefined}
            onPick={onSelect}
            onMapReady={(map) => {
              mapRef.current = map;
              map.addListener('idle', () => readView(map));
              readView(map);
              setMapReady((n) => n + 1);
            }}
          />
        )}
        {loading && shapes.length === 0 && !error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium text-on-surface-variant">Loading the map…</span>
          </div>
        ) : null}
      </div>

      <div className="absolute top-4 left-4 z-20 w-80 max-w-[calc(100%-5.5rem)]">
        <div className="bg-surface-container-lowest rounded-xl shadow-lg p-2.5 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1 bg-surface-container rounded-lg">
            <Icon name="search" className="text-outline text-[18px]" />
            <input
              className="bg-transparent text-xs text-on-surface outline-none w-full font-body placeholder:text-outline"
              placeholder="Search a parish, town, community or code"
              aria-label="Search map locations"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="text-outline hover:text-on-surface" type="button" title="Clear search" onClick={() => { setQuery(''); setHits([]); }}>
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
          {hits.length > 0 ? (
            <div className="space-y-0.5 pt-1">
              {hits.map((hit) => (
                <button
                  key={hit.pcode}
                  type="button"
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-surface-container transition-colors cursor-pointer group flex flex-col text-left"
                  onClick={() => {
                    setQuery(hit.name);
                    setHits([]);
                    onSelect(hit.pcode);
                    window.setTimeout(() => fitShape(hit.pcode), 50);
                  }}
                >
                  <span className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold text-on-surface group-hover:text-secondary">{hit.name}</span>
                    <span className="font-mono text-[10px] text-outline">{hit.pcode}</span>
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {levelLabel(hit.admin_level)}{hit.parent_name ? ` · ${hit.parent_name}` : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {emptySearch ? (
            <div className="px-2 py-3 text-center">
              <span className="text-xs font-bold text-on-surface">No area matches '{query.trim()}'</span>
              <span className="block text-[11px] text-on-surface-variant mt-1">Try a parish, town, community or code.</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-3">
        <div className="bg-surface-container-lowest p-1 rounded-xl shadow-md flex items-center gap-1">
          <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${basemap === 'roadmap' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'}`} type="button" onClick={() => setBasemap('roadmap')}>Map</button>
          <button className={`px-2.5 py-1 rounded-lg text-xs font-medium ${basemap === 'hybrid' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'}`} type="button" onClick={() => setBasemap('hybrid')}>Satellite</button>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-md p-1 flex flex-col gap-1">
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface hover:bg-surface-container" title="Zoom in" type="button" onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 8) + 1)}>
            <Icon name="add" className="text-[18px]" />
          </button>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface hover:bg-surface-container" title="Zoom out" type="button" onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 8) - 1)}>
            <Icon name="remove" className="text-[18px]" />
          </button>
          <div className="w-full h-px bg-surface-container-highest my-0.5" />
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface hover:bg-surface-container" title={selected ? 'Fit area' : 'Fit Jamaica'} type="button" onClick={() => (selected ? fitShape(selected) : fitJamaica())}>
            <Icon name="crop_free" className="text-[18px]" />
          </button>
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface hover:bg-surface-container" title="Fullscreen" type="button" onClick={() => { void cardRef.current?.requestFullscreen(); }}>
            <Icon name="fullscreen" className="text-[18px]" />
          </button>
        </div>
      </div>

      {selected && selectedName ? (
        <div className="absolute top-[18%] left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-surface-container-lowest text-on-surface px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-xs font-bold font-headline text-on-surface">{selectedName}</span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-surface-container text-secondary font-semibold">{selected}</span>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="absolute bottom-4 left-4 z-20 bg-surface-container-lowest/95 backdrop-blur-md p-2.5 rounded-xl shadow-md flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />
            <span className="text-[11px] font-medium text-on-surface">Parish</span>
          </div>
          <span className="text-outline-variant">•</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
            <span className="text-[11px] font-semibold text-secondary">{selectedKind}</span>
          </div>
          <span className="text-outline-variant">•</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-outline-variant" />
            <span className="text-[11px] font-medium text-on-surface-variant">
              {communityCount > 0 ? `Communities (${communityCount})` : 'Communities'}
            </span>
          </div>
        </div>
      ) : null}
      <button className={`${selected ? 'bottom-16' : 'bottom-4 md:hidden'} absolute left-4 z-30 bg-surface-container-lowest rounded-xl shadow-md px-3 py-2 text-xs font-semibold`} type="button" onClick={() => setLayersOpen((open) => !open)}>
        Layers
      </button>
      <div className={`${layersOpen ? 'block' : 'hidden'} ${selected ? '' : 'md:block'} absolute ${selected ? 'bottom-16' : 'bottom-4'} left-4 z-20 w-64 bg-surface-container-lowest rounded-xl shadow-lg p-3 space-y-3`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-on-surface uppercase tracking-wider font-label">Layers</span>
          <Icon name="layers" className="text-[16px] text-outline" />
        </div>
        <div className="space-y-1.5 text-xs font-body">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input checked={layers.parishes} className="rounded text-secondary w-3.5 h-3.5 accent-secondary" type="checkbox" onChange={(event) => setLayers((prev) => ({ ...prev, parishes: event.target.checked }))} />
            <span className="text-on-surface font-medium">Parishes</span>
          </label>
          <label className="flex items-center justify-between cursor-pointer select-none" aria-label="Towns zoom in">
            <span className="flex items-center gap-2">
              <input checked={layers.towns} className="rounded text-secondary w-3.5 h-3.5 accent-secondary" type="checkbox" onChange={(event) => setLayers((prev) => ({ ...prev, towns: event.target.checked }))} />
              <span className="text-on-surface font-medium">Towns</span>
            </span>
            {zoom < 10 ? <span className="text-[10px] text-outline font-body">zoom in</span> : null}
          </label>
          <label className="flex items-center justify-between cursor-pointer select-none" aria-label="Communities zoom in more">
            <span className="flex items-center gap-2">
              <input checked={layers.communities} className="rounded text-secondary w-3.5 h-3.5 accent-secondary" type="checkbox" onChange={(event) => setLayers((prev) => ({ ...prev, communities: event.target.checked }))} />
              <span className="text-on-surface">Communities</span>
            </span>
            {zoom < 12 ? <span className="text-[10px] text-outline font-body">zoom in more</span> : null}
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none" aria-label="Pins">
            <input checked={layers.pins} className="rounded text-secondary w-3.5 h-3.5 accent-secondary" type="checkbox" onChange={(event) => setLayers((prev) => ({ ...prev, pins: event.target.checked }))} />
            <span className="text-on-surface">Pins</span>
          </label>
        </div>
        <div className="h-px bg-surface-container-highest" />
        <div className="space-y-1.5 pt-0.5">
          <Legend swatch="w-4 h-0.5 bg-slate-700" label="Parish border" />
          <Legend swatch="w-4 h-[1.5px] bg-slate-400" label="Town border" />
          <Legend swatch="w-4 h-[1px] border-b border-dashed border-slate-300" label="Community border" />
          <Legend swatch="w-2 h-2 rounded-full bg-secondary" label="Pin" />
        </div>
        {pins.length > 0 && layers.pins ? <p className="text-[10px] text-outline">{pins.length} pins</p> : null}
      </div>

      {selected && zoom < 12 ? (
        <div className="absolute bottom-4 right-4 z-20">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-highest/90 text-on-surface-variant text-[11px] font-medium shadow-sm">
            <Icon name="zoom_in" className="text-[15px] text-outline" />
            <span>Zoom in to see communities</span>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-3 right-4 z-10 flex items-center gap-3 bg-surface-container-lowest/80 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-mono text-outline">
          <span>Dominion Cartography · COD-AB</span>
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-on-surface-variant font-body">
      <span className={`${swatch} inline-block`} />
      <span>{label}</span>
    </div>
  );
}
