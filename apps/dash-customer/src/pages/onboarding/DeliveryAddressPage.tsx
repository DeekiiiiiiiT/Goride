import React, { useEffect, useRef, useState } from 'react';
import { reverseGeocode } from '@roam/location';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { DeliveryPinMap } from '@/components/home/DeliveryPinMap';
import {
  getSavedAddresses,
  type SavedAddress,
} from '@/lib/addressStorage';
import { checkDeliveryZoneAsync } from '@/lib/deliveryZones';
import {
  getRushCurrentPosition,
  requestRushGeolocationPermission,
} from '@/lib/rushGeolocation';
import { toast } from '@/lib/toast';

export type AddressSelection = {
  line1: string;
  line2?: string;
  lat?: number;
  lng?: number;
};

type DeliveryAddressPageProps = {
  onBack: () => void;
  onConfirm: (address: AddressSelection) => void;
  onOutOfZone?: (address: AddressSelection) => void;
};

function labelIcon(label: SavedAddress['label']): string {
  if (label === 'home') return 'home';
  if (label === 'work') return 'work';
  return 'history';
}

function labelTitle(addr: SavedAddress): string {
  if (addr.label === 'home') return 'Home';
  if (addr.label === 'work') return 'Work';
  return addr.line1;
}

export function DeliveryAddressPage({ onBack, onConfirm, onOutOfZone }: DeliveryAddressPageProps) {
  const [line1, setLine1] = useState('');
  const [selected, setSelected] = useState<AddressSelection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [locating, setLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  useEffect(() => {
    setSaved(getSavedAddresses());
  }, []);

  const selectSaved = (item: SavedAddress) => {
    setSelectedId(item.id);
    setLine1(item.line1);
    setSelected({
      line1: item.line1,
      line2: item.line2,
      lat: item.lat,
      lng: item.lng,
    });
  };

  const handleConfirm = async () => {
    if (!selected?.line1.trim()) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      const zone = await checkDeliveryZoneAsync({
        line1: selected.line1,
        line2: selected.line2,
        lat: selected.lat,
        lng: selected.lng,
      });
      if (!zone.inZone) {
        onOutOfZone?.(selected);
        return;
      }
      onConfirm(selected);
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    let lat: number;
    let lng: number;
    try {
      const perm = await requestRushGeolocationPermission();
      if (perm === 'denied' || perm === 'unsupported') {
        toast.error('Location permission is required to use your current location.');
        return;
      }
      ({ lat, lng } = await getRushCurrentPosition());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not get current location');
      return;
    } finally {
      setLocating(false);
    }

    let line = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const next: AddressSelection = { line1: line, lat, lng };
    setSelectedId('current');
    setLine1(line);
    setSelected(next);

    try {
      const geo = await Promise.race([
        reverseGeocode(lat, lng),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('reverse geocode timeout')), 12_000);
        }),
      ]);
      line = geo.streetAddress || geo.formattedAddress || line;
      const resolved = { line1: line, lat, lng };
      setLine1(line);
      setSelected(resolved);

      const zone = await checkDeliveryZoneAsync({
        line1: resolved.line1,
        lat: resolved.lat,
        lng: resolved.lng,
      });
      if (!zone.inZone) {
        onOutOfZone?.(resolved);
        return;
      }
      toast.success('Location pinned — you’re in our delivery area');
    } catch {
      toast.success('Location pinned');
    }
  };

  return (
    <div className="app-fullscreen-screen bg-surface-container-lowest text-on-surface antialiased">
      <main className="w-full max-w-md h-full flex flex-col relative bg-surface-container-lowest mx-auto pt-safe">
        <header className="flex items-center justify-between px-4 min-h-16 w-full shrink-0 z-10">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-surface-variant transition-colors flex items-center justify-center text-on-surface"
          >
            <MaterialIcon name="arrow_back" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-[100px] flex flex-col gap-6 scrollbar-hide">
          <section>
            <h1 className="text-[28px] leading-[34px] font-bold text-on-surface tracking-tight">
              Where should we deliver?
            </h1>
          </section>

          <section className="relative w-full h-[220px] min-h-[180px] rounded-[24px] overflow-hidden shadow-sm border border-surface-variant shrink-0">
            <DeliveryPinMap
              lat={selected?.lat}
              lng={selected?.lng}
              className="absolute inset-0"
              emptyLabel="Use current location to drop your delivery pin"
            />
            <button
              type="button"
              disabled={locating}
              onClick={() => void useCurrentLocation()}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-surface-container-lowest text-primary px-5 py-3 rounded-full shadow-[0px_10px_30px_rgba(0,0,0,0.08)] flex items-center gap-2 active:scale-95 transition-transform duration-200 disabled:opacity-60"
            >
              <MaterialIcon name="my_location" className="text-[20px]" />
              <span className="text-sm font-semibold tracking-wide">
                {locating ? 'Locating…' : 'Use current location'}
              </span>
            </button>
          </section>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-surface-variant" />
            <span className="text-xs font-medium text-outline uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-surface-variant" />
          </div>

          <section>
            <AddressAutocomplete
              value={line1}
              onChange={(v) => {
                setLine1(v);
                setSelectedId('search');
                setSelected(v.trim() ? { line1: v.trim(), lat: selected?.lat, lng: selected?.lng } : null);
              }}
              onSelect={(s) => {
                setLine1(s.line1);
                setSelectedId(s.id);
                setSelected({
                  line1: s.line1,
                  line2: s.line2,
                  lat: s.lat,
                  lng: s.lng,
                });
              }}
              placeholder="Search for your address"
            />
          </section>

          {saved.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-medium text-outline-variant uppercase tracking-wider mb-2">
                Recent &amp; Saved
              </h2>
              <ul className="flex flex-col">
                {saved.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => selectSaved(item)}
                      className={`w-full flex items-center gap-4 py-3 active:bg-surface-variant transition-colors rounded-lg -mx-2 px-2 border-b border-surface-variant/50 last:border-0 text-left ${
                        selectedId === item.id ? 'bg-surface-container-low' : ''
                      }`}
                    >
                      <div className="bg-surface-container-high p-2 rounded-full flex items-center justify-center text-outline">
                        <MaterialIcon name={labelIcon(item.label)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold tracking-wide text-on-surface">
                          {labelTitle(item)}
                        </p>
                        <p className="text-sm text-outline mt-0.5 truncate">{item.line1}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="absolute bottom-0 left-0 w-full bg-surface-container-lowest/90 backdrop-blur-md px-4 py-4 pb-safe shadow-[0px_-10px_30px_rgba(0,0,0,0.03)] z-50">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selected?.line1.trim() || isSubmitting}
            className="w-full bg-primary text-on-primary text-sm font-semibold tracking-wide py-4 rounded-xl shadow-md active:scale-[0.98] transition-transform duration-200 flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Checking…' : 'Confirm Address'}
          </button>
        </div>
      </main>
    </div>
  );
}
