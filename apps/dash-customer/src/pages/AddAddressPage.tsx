import { FormEvent, useState } from 'react';
import { reverseGeocode } from '@roam/location';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { DeliveryPinMap } from '@/components/home/DeliveryPinMap';
import {
  getSavedAddressById,
  upsertSavedAddressAsync,
  type AddressLabel,
  type SavedAddress,
} from '@/lib/addressStorage';
import { checkDeliveryZoneAsync } from '@/lib/deliveryZones';
import {
  getRushCurrentPosition,
  requestRushGeolocationPermission,
} from '@/lib/rushGeolocation';
import { toast } from '@/lib/toast';

type Props = {
  addressId?: string;
  returnTo?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

const LABEL_OPTIONS: { id: AddressLabel; icon: string; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'work', icon: 'work', label: 'Work' },
  { id: 'other', icon: 'bookmark', label: 'Other' },
];

export default function AddAddressPage({ addressId, returnTo = 'saved-addresses', onNavigate }: Props) {
  const existing = addressId ? getSavedAddressById(addressId) : undefined;

  const [line1, setLine1] = useState(existing?.line1 ?? '');
  const [line2, setLine2] = useState(existing?.line2 ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [label, setLabel] = useState<AddressLabel>(existing?.label ?? 'home');
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({
    lat: existing?.lat,
    lng: existing?.lng,
  });
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  // Compact confirm UI only after successful GPS pin
  const [pinSuccess, setPinSuccess] = useState(false);

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const perm = await requestRushGeolocationPermission();
      if (perm !== 'granted') {
        toast.error('Allow location access so we can pin your exact spot for the courier.');
        return;
      }
      const { lat, lng } = await getRushCurrentPosition();
      setCoords({ lat, lng });

      // Jamaica house numbers often miss Places — GPS is the courier pin; label stays editable
      let guessed = `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      let resolvedCity = city;
      try {
        const geo = await reverseGeocode(lat, lng);
        guessed =
          geo.streetAddress || geo.formattedAddress || guessed;
        if (geo.city) {
          resolvedCity = geo.city;
          setCity(geo.city);
        }
      } catch {
        // keep coordinate label
      }
      setLine1(guessed);
      setPinSuccess(true);

      // Confirm coverage against live Ops zones while the pin is fresh
      const zone = await checkDeliveryZoneAsync({
        line1: guessed,
        city: resolvedCity || undefined,
        lat,
        lng,
      });
      if (!zone.inZone) {
        onNavigate('out-of-delivery', { returnTo: 'add-address', attemptedAddress: guessed });
        return;
      }
      toast.success('Location pinned — you’re in our delivery area');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not get current location');
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const zone = await checkDeliveryZoneAsync({
      line1,
      line2,
      city: city || undefined,
      lat: coords.lat,
      lng: coords.lng,
    });
    if (!zone.inZone) {
      onNavigate('out-of-delivery', { returnTo: 'add-address', attemptedAddress: line1 });
      return;
    }
    if (coords.lat == null || coords.lng == null) {
      toast.error('Tap “Use current location” so the courier gets your exact pin.');
      return;
    }
    const address: SavedAddress = {
      id: existing?.id ?? `addr-${Date.now()}`,
      label,
      line1,
      line2: line2 || undefined,
      instructions: instructions || undefined,
      city: city || undefined,
      lat: coords.lat,
      lng: coords.lng,
      isDefault: existing?.isDefault ?? !addressId,
    };
    setSaving(true);
    try {
      await upsertSavedAddressAsync(address);
      onNavigate(returnTo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save address');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-fullscreen-screen bg-background text-on-background antialiased">
      <header className="flex items-center justify-between px-4 py-2 w-full max-w-md mx-auto bg-surface shadow-sm sticky top-0 z-50 safe-t min-h-14 shrink-0">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => onNavigate(returnTo)}
          className="p-2 text-on-surface-variant rounded-full"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-sm font-bold text-primary absolute left-1/2 -translate-x-1/2">
          {addressId ? 'Edit Address' : 'Add Address'}
        </h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 flex flex-col relative max-w-md mx-auto w-full min-h-0 overflow-y-auto overscroll-contain">
        {!pinSuccess && (
          <div className="relative h-[309px] w-full bg-surface-container-highest overflow-hidden">
            <DeliveryPinMap
              lat={coords.lat}
              lng={coords.lng}
              className="absolute inset-0"
              emptyLabel="Use current location to drop an exact pin"
            />
            <button
              type="button"
              disabled={locating}
              onClick={() => void useCurrentLocation()}
              className="absolute bottom-8 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface px-5 py-3 text-primary shadow-[0px_10px_30px_rgba(0,0,0,0.12)] transition-transform active:scale-95 disabled:opacity-60"
            >
              <MaterialIcon name="my_location" className="text-[20px]" />
              <span className="text-sm font-semibold tracking-wide">
                {locating ? 'Locating…' : 'Use current location'}
              </span>
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16 map-gradient" />
          </div>
        )}
        {pinSuccess && (
          <div className="relative h-28 w-full overflow-hidden">
            <DeliveryPinMap lat={coords.lat} lng={coords.lng} className="absolute inset-0" />
          </div>
        )}

        <div
          className={`relative z-30 flex flex-1 flex-col gap-6 bg-surface px-4 py-6 ${
            pinSuccess ? 'pt-8' : '-mt-4 rounded-t-xl shadow-[0px_-4px_20px_rgba(0,0,0,0.04)]'
          }`}
        >
          <AddressAutocomplete
            value={line1}
            onChange={(v) => {
              setLine1(v);
              setPinSuccess(false);
            }}
            onSelect={(s) => {
              setLine1(s.line1);
              if (s.line2) setLine2(s.line2);
              setCoords({ lat: s.lat, lng: s.lng });
              setPinSuccess(false);
            }}
            placeholder="Search for your address"
          />

          {pinSuccess && (
            <p className="-mt-2 flex items-center gap-2 text-body-sm font-semibold text-primary">
              <MaterialIcon name="check_circle" className="text-[18px]" filled />
              PIN saved
            </p>
          )}

          {!pinSuccess && (
            <>
              <div className="h-px w-full bg-surface-container-high" />

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="line1"
                    className="ml-1 block text-label-md font-semibold text-on-surface-variant"
                  >
                    Address Line 1
                  </label>
                  <input
                    id="line1"
                    value={line1}
                    onChange={(e) => setLine1(e.target.value)}
                    className="form-input-soft"
                    placeholder="Street address, P.O. box, etc."
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="line2"
                    className="ml-1 block text-label-md font-semibold text-on-surface-variant"
                  >
                    Apt / Suite / Floor (Optional)
                  </label>
                  <input
                    id="line2"
                    value={line2}
                    onChange={(e) => setLine2(e.target.value)}
                    className="form-input-soft"
                    placeholder="e.g. Apt 4B"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="instructions"
                    className="ml-1 block text-label-md font-semibold text-on-surface-variant"
                  >
                    Delivery Instructions
                  </label>
                  <textarea
                    id="instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="form-input-soft resize-none"
                    placeholder="e.g. Leave at the front door, gate code 1234"
                    rows={2}
                  />
                </div>

                <div className="pt-2">
                  <label className="mb-2 ml-1 block text-label-md font-semibold text-on-surface-variant">
                    Save as
                  </label>
                  <div className="flex gap-2">
                    {LABEL_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setLabel(option.id)}
                        className={`label-chip ${label === option.id ? 'active' : ''}`}
                      >
                        <MaterialIcon
                          name={option.icon}
                          className="mr-2 text-[18px]"
                          filled={label === option.id}
                        />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-24" />
              </form>
            </>
          )}

          {pinSuccess && <div className="h-24" />}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 z-50 flex w-full justify-center border-t border-surface-container-low bg-surface/90 p-4 pb-safe shadow-[0px_-10px_30px_rgba(0,0,0,0.03)] backdrop-blur-md">
        <button
          type="button"
          onClick={(e) => void handleSubmit(e as unknown as FormEvent)}
          disabled={saving || !line1.trim()}
          className="w-full max-w-[1200px] rounded-lg bg-primary-container py-4 text-headline-sm font-semibold text-on-primary shadow-md transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Address'}
        </button>
      </div>
    </div>
  );
}
