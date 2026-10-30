// Stitch: dominion-redesign/s36f-map-pins
import { useEffect, useState } from 'react';
import { kindLabel, pointInJamaica, type MapPin } from './pinsApi';

const KINDS = ['town_centre', 'landmark', 'junction'] as const;

export function PinEditDrawer({
  pin,
  onChange,
  onSave,
}: {
  pin: MapPin;
  onChange: (next: MapPin) => void;
  onSave: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [latText, setLatText] = useState(String(pin.lat));
  const [lngText, setLngText] = useState(String(pin.lng));
  useEffect(() => {
    setLatText(String(pin.lat));
    setLngText(String(pin.lng));
  }, [pin.id, pin.lat, pin.lng]);
  const lat = Number(latText);
  const lng = Number(lngText);
  const inside = pointInJamaica(lat, lng);

  return (
    <div
      className="mt-2 bg-surface-container-low rounded-lg p-5 flex flex-col gap-4"
      data-stitch="latitude longitude active retired change reason * save pin"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-secondary">edit_location</span>
          <span className="text-xs font-headline font-bold text-on-surface">Edit Pin: {pin.name}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block text-[11px] font-label text-on-surface-variant mb-1 font-medium">
          Name
          <input className="mt-1 w-full px-3 py-1.5 bg-surface-container-lowest text-xs rounded-lg text-on-surface outline-none" value={pin.name} onChange={(event) => onChange({ ...pin, name: event.target.value })} />
        </label>
        <label className="block text-[11px] font-label text-on-surface-variant mb-1 font-medium">
          Kind
          <select className="mt-1 w-full px-3 py-1.5 bg-surface-container-lowest text-xs rounded-lg" value={pin.kind} onChange={(event) => onChange({ ...pin, kind: event.target.value })}>
            {KINDS.map((kind) => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block text-[11px] font-label text-on-surface-variant font-medium">
          Latitude
          <input className="mt-1 w-full px-3 py-1.5 bg-surface-container-lowest font-mono text-xs rounded-lg" value={latText} onChange={(event) => {
            setLatText(event.target.value);
            const next = Number(event.target.value);
            if (pointInJamaica(next, Number(lngText))) onChange({ ...pin, lat: next });
          }} />
        </label>
        <label className="block text-[11px] font-label text-on-surface-variant font-medium">
          Longitude
          <input className="mt-1 w-full px-3 py-1.5 bg-surface-container-lowest font-mono text-xs rounded-lg" value={lngText} onChange={(event) => {
            setLngText(event.target.value);
            const next = Number(event.target.value);
            if (pointInJamaica(Number(latText), next)) onChange({ ...pin, lng: next });
          }} />
        </label>
      </div>
      <div>
        <label className="block text-[11px] font-label text-on-surface-variant mb-1 font-medium">Status</label>
        <div className="flex items-center gap-1 bg-surface-container-highest p-1 rounded-lg w-max">
          <button type="button" className={pin.status !== 'retired' ? 'px-3 py-1 rounded text-xs font-semibold bg-surface-container-lowest text-on-surface' : 'px-3 py-1 rounded text-xs text-on-surface-variant'} onClick={() => onChange({ ...pin, status: 'active' })}>Active</button>
          <button type="button" className={pin.status === 'retired' ? 'px-3 py-1 rounded text-xs font-semibold bg-surface-container-lowest text-on-surface' : 'px-3 py-1 rounded text-xs text-on-surface-variant'} onClick={() => onChange({ ...pin, status: 'retired' })}>Retired</button>
        </div>
      </div>
      <label className="block text-[11px] font-label text-on-surface-variant font-medium">
        Change Reason <span className="text-error">*</span>
        <textarea className="mt-1 w-full px-3 py-2 bg-surface-container-lowest text-xs rounded-lg" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${inside ? 'bg-surface-container text-on-surface-variant' : 'bg-error-container/30 text-error'}`}>
        <span>{inside ? 'Spatial check: that point is inside Jamaica.' : 'That point is outside Jamaica.'}</span>
      </div>
      <div className="flex justify-end">
        <button type="button" className="px-4 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-semibold disabled:opacity-50" disabled={!reason.trim() || !inside} onClick={() => onSave(reason.trim())}>
          Save pin
        </button>
      </div>
    </div>
  );
}
