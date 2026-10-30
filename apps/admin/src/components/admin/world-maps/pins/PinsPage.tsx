// Stitch: dominion-redesign/s36f-map-pins
import { useEffect, useMemo, useState } from 'react';
import { JamaicaSectionShell } from '../JamaicaSectionShell';
import { geoFetch } from '../geoClient';
import { PinEditDrawer } from './PinEditDrawer';
import { PinMap } from './PinMap';
import { PinTable } from './PinTable';
import { fetchPins, savePin, type MapPin } from './pinsApi';

export function PinsPage({
  accessToken,
  canWrite,
  onNavigate,
}: {
  accessToken: string;
  canWrite: boolean;
  onNavigate: (pageId: string) => void;
}) {
  const [pins, setPins] = useState<MapPin[]>([]);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [draft, setDraft] = useState<MapPin | null>(null);
  const [error, setError] = useState('');

  async function load() {
    const list = await fetchPins(accessToken);
    const named = await Promise.all(list.map(async (pin) => {
      if (!pin.pcode) return pin;
      try {
        const body = await geoFetch(accessToken, `/geo/boundaries/${encodeURIComponent(pin.pcode)}`);
        const path = (body.path as Array<{ name: string }> | undefined)?.map((node) => node.name).filter((name) => name !== 'Jamaica').join(' › ');
        return { ...pin, area: path || pin.pcode };
      } catch {
        return pin;
      }
    }));
    setPins(named);
    setPaths(Object.fromEntries(named.map((pin) => [pin.id, pin.area || ''])));
    setSelected((current) => current || named[0]?.id || null);
  }

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load pins'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const shown = useMemo(() => pins.filter((pin) => {
    const q = query.trim().toLowerCase();
    if (q && !pin.name.toLowerCase().includes(q) && !(pin.pcode || '').toLowerCase().includes(q)) return false;
    if (kind !== 'all' && pin.kind !== kind) return false;
    if (status !== 'all' && pin.status !== status) return false;
    return true;
  }).map((pin) => ({ ...pin, area: paths[pin.id] || pin.area })), [pins, query, kind, status, paths]);

  const current = pins.find((pin) => pin.id === selected) || null;

  return (
    <JamaicaSectionShell page="world-places" accessToken={accessToken} onNavigate={onNavigate}>
      {() => (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6" data-stitch="map pins + add pin name kind area status coordinates">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5">
            <div>
              <h2 className="text-lg font-headline font-bold text-on-surface tracking-tight">Map pins</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Points on the map, such as town centres. Business places live in the{' '}
                <button type="button" className="text-secondary font-medium hover:underline" onClick={() => onNavigate('places-register')}>Places register</button>.
              </p>
            </div>
            {canWrite ? (
              <button type="button" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-semibold" onClick={() => setDraft({ id: 'new', name: '', kind: 'town_centre', lat: 18.0, lng: -76.8, pcode: null, status: 'active' })}>
                <span className="material-symbols-outlined text-[16px]">add_location</span>
                + Add pin
              </button>
            ) : null}
          </div>
          {error ? <p className="text-xs text-error mb-3">{error}</p> : null}
          <div className="grid grid-cols-12 gap-6 mt-2">
            <div className="col-span-12 lg:col-span-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-outline">search</span>
                  <input className="w-full pl-8 pr-3 py-1.5 bg-surface-container-low text-xs rounded-lg outline-none font-body text-on-surface placeholder:text-outline" placeholder="Search pins…" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-label text-on-surface-variant">Kind:</span>
                  <select className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-container text-on-surface" value={kind} onChange={(event) => setKind(event.target.value)}>
                    <option value="all">All</option>
                    <option value="town_centre">Town centre</option>
                    <option value="landmark">Landmark</option>
                    <option value="junction">Junction</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-label text-on-surface-variant">Status:</span>
                  <select className="px-2.5 py-1 text-xs font-medium rounded-lg bg-surface-container text-on-surface" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
              </div>
              <PinTable rows={shown} selected={selected} onSelect={setSelected} />
              {draft && canWrite ? (
                <PinEditDrawer
                  pin={draft}
                  onChange={setDraft}
                  onSave={(reason) => {
                    void savePin(accessToken, { name: draft.name, kind: draft.kind, lat: draft.lat, lng: draft.lng, status: draft.status, reason }).then(() => { setDraft(null); return load(); }).catch((reasonError) => setError(reasonError instanceof Error ? reasonError.message : 'Could not add the pin'));
                  }}
                />
              ) : null}
              {current && !draft ? (
                <PinEditDrawer
                  pin={current}
                  onChange={(next) => setPins((list) => list.map((pin) => pin.id === next.id ? next : pin))}
                  onSave={(reason) => {
                    void savePin(accessToken, { ...current, reason }, current.id).then(() => load()).catch((reasonError) => setError(reasonError instanceof Error ? reasonError.message : 'Could not save the pin'));
                  }}
                />
              ) : null}
            </div>
            <div className="col-span-12 lg:col-span-6">
              <PinMap
                pins={shown}
                selectedId={selected}
                draggable={canWrite}
                onSelect={setSelected}
                onDragEnd={(id, lat, lng) => setPins((list) => list.map((pin) => pin.id === id ? { ...pin, lat, lng } : pin))}
              />
            </div>
          </div>
        </div>
      )}
    </JamaicaSectionShell>
  );
}
