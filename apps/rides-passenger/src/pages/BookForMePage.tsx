import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, Copy, Loader2, Navigation, Tag, Users, X } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { RoamMode, TripIntentAudience, TripIntentRow, RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import { contactGroupsList, contactsList } from '@/services/contactsEdge';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { RoamModePicker } from '@/components/trip-intent/RoamModePicker';
import { RoamContactsPickerSheet } from '@/components/contacts/RoamContactsPickerSheet';
import { DeviceContactsPickerSheet } from '@/components/contacts/DeviceContactsPickerSheet';
import { useRoamPassengerTag } from '@/hooks/useRoamPassengerTag';
import { useRidesVehicleTypes } from '@/hooks/useRidesVehicleTypes';
import {
  formatRoamTagDisplay,
  normalizeRoamTagInput,
  roamTagErrorMessage,
} from '@/services/roamTagEdge';
import {
  tripIntentCreate,
  tripIntentGetMyActive,
  tripIntentPublish,
  tripIntentQuote,
  tripIntentUpdate,
  tripIntentWithdraw,
} from '@/services/tripIntentEdge';
import { buildGuestPhoneE164, formatGuestPhoneDisplay, isValidGuestPhone } from '@/lib/guestRecipientBooking';
import { formatFareMinor } from '@/services/tripIntentEdge';
import {
  getCurrentPositionWithAccuracy,
  resolveAddressFromCoordinates,
} from '@/services/locationService';
import { DEFAULT_VEHICLE_OPTION } from '@/types/vehicleTypes';
import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Step = 'mode' | 'trip' | 'payer' | 'published';

export default function BookForMePage() {
  const navigate = useNavigate();
  const { tag, loading: tagLoading, saveCustomName, refresh } = useRoamPassengerTag({ ensureOnMount: true });
  const { active: services } = useRidesVehicleTypes();

  const [step, setStep] = useState<Step>('mode');
  const [tagOverlayOpen, setTagOverlayOpen] = useState(false);
  const [pickupLocLoading, setPickupLocLoading] = useState(false);
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [savingTag, setSavingTag] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roamMode, setRoamMode] = useState<RoamMode>('open_roam');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [vehicleOption, setVehicleOption] = useState(DEFAULT_VEHICLE_OPTION);
  const [audience, setAudience] = useState<TripIntentAudience>('any_booker');
  const [targetContact, setTargetContact] = useState<RiderContactRow | null>(null);
  const [targetPhone, setTargetPhone] = useState('');
  const [intent, setIntent] = useState<TripIntentRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [roamPickerOpen, setRoamPickerOpen] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [groups, setGroups] = useState<RiderContactGroupRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);

  const tagLocked = Boolean(tag?.has_custom_tag);
  const displayTag = formatRoamTagDisplay(tag?.custom_tag_name ?? customInput) ?? null;

  useEffect(() => {
    if (tag?.custom_tag_name) setCustomInput(tag.custom_tag_name);
  }, [tag?.custom_tag_name]);

  useEffect(() => {
    if (tagLoading) return;
    if (!tagLocked) setTagOverlayOpen(true);
  }, [tagLoading, tagLocked]);

  useEffect(() => {
    if (services.length > 0 && !services.some((s) => s.slug === vehicleOption)) {
      setVehicleOption(services[0].slug);
    }
  }, [services, vehicleOption]);

  useEffect(() => {
    setContactsLoading(true);
    void Promise.all([contactsList(), contactGroupsList()])
      .then(([c, g]) => {
        setContacts(c.contacts);
        setGroups(g.groups);
      })
      .catch(() => undefined)
      .finally(() => setContactsLoading(false));
  }, []);

  useEffect(() => {
    void tripIntentGetMyActive().then((r) => {
      if (r.trip_intent && ['draft', 'published', 'claimed'].includes(r.trip_intent.status)) {
        setIntent(r.trip_intent);
        if (r.trip_intent.status === 'published' || r.trip_intent.status === 'claimed') {
          setStep('published');
        }
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const meta = user.user_metadata ?? {};
      const displayName =
        (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta.name === 'string' && meta.name.trim()) ||
        '';
      if (displayName && !name) setName(displayName);
      const rawPhone = user.phone || (typeof meta.phone === 'string' ? meta.phone : '');
      if (rawPhone && !phone) {
        const digits = rawPhone.replace(/\D/g, '').slice(-10);
        if (digits.length >= 10) setPhone(formatGuestPhoneDisplay(digits));
      }
    });
  }, [name, phone]);

  const handleSaveTag = async () => {
    const normalized = normalizeRoamTagInput(customInput);
    if (normalized.length < 3) {
      toast.error('Use at least 3 characters.');
      return;
    }
    setSavingTag(true);
    try {
      await saveCustomName(normalized);
      toast.success(`Your tag is ${formatRoamTagDisplay(normalized)}`);
      setTagOverlayOpen(false);
    } catch (e) {
      toast.error(roamTagErrorMessage(e instanceof Error ? e.message : '') || 'Could not save tag');
    } finally {
      setSavingTag(false);
    }
  };

  const ensureDraftIntent = async (): Promise<TripIntentRow> => {
    if (intent?.id) return intent;
    if (!name.trim() || !isValidGuestPhone(phone)) {
      throw new Error('Enter your name and phone.');
    }
    const res = await tripIntentCreate({
      requester_name: name.trim(),
      requester_phone: buildGuestPhoneE164('+1', phone),
      roam_mode: roamMode,
    });
    setIntent(res.trip_intent);
    return res.trip_intent;
  };

  const handlePublish = async () => {
    setLoading(true);
    try {
      await refresh(true);
      let row = await ensureDraftIntent();
      row = (await tripIntentUpdate(row.id, {
        roam_mode: roamMode,
        audience,
        target_booker_user_id: audience === 'targeted' && targetContact?.linked_user_id
          ? targetContact.linked_user_id
          : null,
        target_booker_phone_e164: audience === 'targeted' && targetPhone
          ? buildGuestPhoneE164('+1', targetPhone)
          : null,
        pickup_lat: pickup?.lat,
        pickup_lng: pickup?.lng,
        pickup_address: pickupAddress || undefined,
        dropoff_lat: dropoff?.lat,
        dropoff_lng: dropoff?.lng,
        dropoff_address: dropoffAddress || undefined,
        vehicle_option: vehicleOption,
      })).trip_intent;

      if (pickup && dropoff) {
        await tripIntentQuote(row.id);
      }

      const published = (await tripIntentPublish(row.id)).trip_intent;
      setIntent(published);
      setStep('published');
      toast.success('Your trip is live on your tag');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not publish');
    } finally {
      setLoading(false);
    }
  };

  const handleUseMyLocationForPickup = async () => {
    setPickupLocLoading(true);
    try {
      const position = await getCurrentPositionWithAccuracy();
      const address = await resolveAddressFromCoordinates(position.lat, position.lng);
      setPickup({ lat: position.lat, lng: position.lng });
      setPickupAddress(address);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not get your location');
    } finally {
      setPickupLocLoading(false);
    }
  };

  const selectedVehicleLabel =
    services.find((s) => s.slug === vehicleOption)?.label ?? 'Choose vehicle';

  const copyTag = async () => {
    if (!displayTag) return;
    try {
      await navigator.clipboard.writeText(displayTag);
      toast.success('Tag copied');
    } catch {
      toast.message(displayTag);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 items-center bg-[#f7f9fb] px-4 safe-t">
        <button type="button" onClick={() => navigate('/services/book-for-others')} className="rounded-full p-2" style={{ color: PRIMARY }}>
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>Book for me</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 safe-x">
        {step === 'published' && intent ? (
          <div className="space-y-4 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <p className="font-semibold">Your trip is waiting for a booker</p>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Tell them to search <strong>{displayTag}</strong> in Roam
            </p>
            {intent.fare_estimate_minor ? (
              <p className="text-lg font-bold">{formatFareMinor(intent.fare_estimate_minor, intent.currency ?? 'JMD')}</p>
            ) : null}
            <button type="button" onClick={() => void copyTag()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold" style={{ backgroundColor: PRIMARY, color: '#fff' }}>
              <Copy className="h-4 w-4" /> Copy tag
            </button>
            <button
              type="button"
              onClick={() => void tripIntentWithdraw(intent.id).then(() => { setIntent(null); setStep('mode'); toast.message('Trip withdrawn'); })}
              className="w-full text-sm font-medium"
              style={{ color: ON_SURFACE_VARIANT }}
            >
              Withdraw trip
            </button>
          </div>
        ) : null}

        {tagLoading && !tagLocked ? (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: ON_SURFACE_VARIANT }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading your tag…
          </div>
        ) : null}

        {step === 'mode' && (tagLocked || !tagLoading) ? (
          <div className="space-y-4">
            {tagLocked && displayTag ? (
              <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Publishing on <strong style={{ color: PRIMARY }}>{displayTag}</strong>
              </p>
            ) : null}
            <RoamModePicker value={roamMode} onChange={setRoamMode} />
            <button
              type="button"
              disabled={!tagLocked}
              onClick={() => setStep('trip')}
              className="h-12 w-full rounded-2xl font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              Continue
            </button>
          </div>
        ) : null}

        {step === 'trip' ? (
          <div className="space-y-3 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <div className="space-y-2">
              <RoamPlaceField
                label="Pickup"
                value={pickupAddress}
                onChangeText={setPickupAddress}
                onResolved={({ address, lat, lng }) => {
                  setPickupAddress(address);
                  setPickup({ lat, lng });
                }}
                showLocationButton
                onLocationClick={() => void handleUseMyLocationForPickup()}
                locationLoading={pickupLocLoading}
              />
              <button
                type="button"
                disabled={pickupLocLoading}
                onClick={() => void handleUseMyLocationForPickup()}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ color: PRIMARY, backgroundColor: SURFACE_LOW }}
              >
                <Navigation className="h-4 w-4 shrink-0" aria-hidden />
                {pickupLocLoading ? 'Getting your location…' : 'Use my current location'}
              </button>
            </div>
            <RoamPlaceField
              label="Destination"
              value={dropoffAddress}
              onChangeText={setDropoffAddress}
              onResolved={({ address, lat, lng }) => {
                setDropoffAddress(address);
                setDropoff({ lat, lng });
              }}
            />
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                Vehicle
              </p>
              <button
                type="button"
                onClick={() => setVehicleSheetOpen(true)}
                className="flex h-12 w-full items-center justify-between rounded-xl px-4 text-left"
                style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
              >
                <span className="font-medium">{selectedVehicleLabel}</span>
                <ChevronDown className="h-5 w-5 shrink-0" style={{ color: ON_SURFACE_VARIANT }} aria-hidden />
              </button>
            </div>
            <button type="button" onClick={() => setStep('payer')} disabled={roamMode === 'shadow_roam' && (!pickup || !dropoff)} className="h-12 w-full rounded-2xl font-semibold disabled:opacity-50" style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 'payer' ? (
          <div className="space-y-3 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <p className="font-semibold">Who should pay?</p>
            {(['any_booker', 'targeted'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left"
                style={{ borderColor: audience === a ? PRIMARY : 'rgba(0,0,0,0.08)' }}
              >
                <Users className="h-5 w-5" style={{ color: PRIMARY }} />
                <span>{a === 'any_booker' ? 'Anyone with my tag' : 'Specific person'}</span>
              </button>
            ))}
            {audience === 'targeted' ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => setRoamPickerOpen(true)} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}>
                  Roam contact
                </button>
                <button type="button" onClick={() => setDevicePickerOpen(true)} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}>
                  Phone contact
                </button>
              </div>
            ) : null}
            {targetContact ? (
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Selected: {targetContact.display_name}</p>
            ) : null}
            <button type="button" disabled={loading} onClick={() => void handlePublish()} className="h-14 w-full rounded-2xl font-semibold disabled:opacity-50" style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}>
              {loading ? 'Publishing…' : 'Publish on my tag'}
            </button>
          </div>
        ) : null}
      </main>

      <RoamContactsPickerSheet
        open={roamPickerOpen}
        onClose={() => setRoamPickerOpen(false)}
        contacts={contacts}
        groups={groups}
        loading={contactsLoading}
        query={contactQuery}
        onQueryChange={setContactQuery}
        groupFilterId={groupFilterId}
        onGroupFilterChange={setGroupFilterId}
        selectedId={targetContact?.id ?? null}
        onSelect={(c) => {
          setTargetContact(c);
          setRoamPickerOpen(false);
        }}
      />
      <DeviceContactsPickerSheet
        open={devicePickerOpen}
        onClose={() => setDevicePickerOpen(false)}
        onImported={(result) => {
          const first = result.contacts[0];
          if (first?.phone_e164) {
            setTargetPhone(first.phone_e164.replace(/\D/g, '').slice(-10));
          }
          setDevicePickerOpen(false);
        }}
      />

      {tagOverlayOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 safe-x" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0" aria-label="Close" onClick={() => navigate(-1)} />
          <div
            className="relative w-full max-w-lg rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl"
            style={{ backgroundColor: SURFACE_LOWEST }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5" style={{ color: PRIMARY }} />
                <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>Create your Roam tag</h2>
              </div>
              <button type="button" onClick={() => navigate(-1)} className="rounded-full p-2" aria-label="Close">
                <X className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />
              </button>
            </div>
            <p className="mb-4 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Bookers find your trip by searching this tag in Roam.
            </p>
            <div className="relative mb-4">
              <span
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold"
                style={{ color: ON_SURFACE_VARIANT }}
              >
                @
              </span>
              <input
                value={customInput}
                onChange={(e) => setCustomInput(normalizeRoamTagInput(e.target.value))}
                placeholder="yourname"
                maxLength={24}
                className="h-12 w-full rounded-xl pl-9 pr-4 outline-none"
                style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
              />
            </div>
            <button
              type="button"
              disabled={savingTag || customInput.length < 3}
              onClick={() => void handleSaveTag()}
              className="flex h-12 w-full items-center justify-center rounded-2xl font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
            >
              {savingTag ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        </div>
      ) : null}

      {vehicleSheetOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 safe-x" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0" aria-label="Close" onClick={() => setVehicleSheetOpen(false)} />
          <div
            className="relative w-full max-w-lg rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl"
            style={{ backgroundColor: SURFACE_LOWEST }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>Choose vehicle</h2>
              <button type="button" onClick={() => setVehicleSheetOpen(false)} className="rounded-full p-2" aria-label="Close">
                <X className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />
              </button>
            </div>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {services.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6" style={{ color: ON_SURFACE_VARIANT }}>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading options…
                </div>
              ) : (
                services.map((s) => {
                  const active = vehicleOption === s.slug;
                  return (
                    <button
                      key={s.slug}
                      type="button"
                      onClick={() => {
                        setVehicleOption(s.slug);
                        setVehicleSheetOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left"
                      style={{
                        borderColor: active ? PRIMARY : 'rgba(0,0,0,0.08)',
                        backgroundColor: active ? 'rgba(0, 74, 198, 0.06)' : SURFACE_LOW,
                        color: ON_SURFACE,
                      }}
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                        style={{ borderColor: active ? PRIMARY : ON_SURFACE_VARIANT }}
                        aria-hidden
                      >
                        {active ? (
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRIMARY }} />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{s.label}</span>
                        {s.description ? (
                          <span className="block text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                            {s.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
