import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  CircleDot,
  MapPin,
  Plus,
  Search,
  Smartphone,
  SlidersHorizontal,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { contactsCreate, contactsList, contactGroupsList } from '@/services/contactsEdge';
import { relationLabel } from '@/components/contacts/ContactRelationPicker';
import {
  buildGuestPhoneE164,
  formatGuestPhoneDisplay,
  isValidGuestPhone,
  persistBookForSomeoneTrip,
  persistGuestRecipientDraft,
  readBookForSomeoneTrip,
  readGuestRecipientDraft,
} from '@/lib/guestRecipientBooking';
import { DeviceContactsPickerSheet } from '@/components/contacts/DeviceContactsPickerSheet';
import {
  canUseBrowserContactPicker,
  canUseInAppDeviceContactPicker,
  importDeviceContactSelection,
  pickDeviceContactsFromBrowser,
} from '@/utils/deviceContactsImport';
import {
  getCurrentPositionWithAccuracy,
  resolveAddressFromCoordinates,
} from '@/services/locationService';
import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Step = 'locations' | 'recipient';

export default function BookForSomeonePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(() =>
    readBookForSomeoneTrip() && !readGuestRecipientDraft()?.fullName ? 'recipient' : 'locations',
  );

  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupLocLoading, setPickupLocLoading] = useState(false);

  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [groups, setGroups] = useState<RiderContactGroupRow[]>([]);
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saveToRoam, setSaveToRoam] = useState(true);
  const [selected, setSelected] = useState<RiderContactRow | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  useEffect(() => {
    const trip = readBookForSomeoneTrip();
    if (!trip) return;
    setPickupAddress(trip.pickupAddress);
    setPickup({ lat: trip.pickupLat, lng: trip.pickupLng });
    setDropoffAddress(trip.dropoffAddress);
    setDropoff({ lat: trip.dropoffLat, lng: trip.dropoffLng });
  }, []);

  const reloadContacts = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const [listRes, groupsRes] = await Promise.all([
        contactsList({ q: query.trim() || undefined }),
        contactGroupsList().catch(() => ({ groups: [] as RiderContactGroupRow[] })),
      ]);
      setContacts(listRes.contacts);
      setGroups(groupsRes.groups);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load Roam Contacts');
      return false;
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (step !== 'recipient') return;
    const t = setTimeout(() => void reloadContacts(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [reloadContacts, query, step]);

  const filtered = contacts.filter((c) => {
    if (groupFilterId && !c.groups?.some((g) => g.id === groupFilterId)) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.display_name.toLowerCase().includes(q) || c.phone_e164.includes(q);
  });

  const coordsReady = Boolean(pickup && dropoff);

  const handleUseMyLocationForPickup = async () => {
    setPickupLocLoading(true);
    try {
      const position = await getCurrentPositionWithAccuracy();
      const lat = position.lat;
      const lng = position.lng;
      const address = await resolveAddressFromCoordinates(lat, lng);
      setPickup({ lat, lng });
      setPickupAddress(address);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not get your location');
    } finally {
      setPickupLocLoading(false);
    }
  };

  const handleLocationsContinue = () => {
    if (!pickup || !dropoff || !pickupAddress.trim() || !dropoffAddress.trim()) {
      toast.error('Enter pickup and drop-off locations.');
      return;
    }
    persistBookForSomeoneTrip({
      pickupAddress: pickupAddress.trim(),
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress: dropoffAddress.trim(),
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
    });
    setStep('recipient');
  };

  const handleDeviceImportResult = useCallback(async (result: {
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    error?: string;
    contacts: RiderContactRow[];
  }) => {
    if (result.failed > 0) {
      toast.error(
        result.error?.includes('schema')
          ? 'Contacts could not be saved — Roam server needs an update. Try Add contact manually.'
          : result.error ?? 'Could not save contacts. Try Add contact manually.',
      );
      return;
    }

    const saved = result.imported + result.updated;
    const mergeImported = (prev: RiderContactRow[]) => {
      if (!result.contacts.length) return prev;
      const byId = new Map(prev.map((c) => [c.id, c]));
      for (const c of result.contacts) byId.set(c.id, c);
      return [...byId.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
    };

    if (saved > 0) {
      toast.success(`Added ${saved} contact${saved === 1 ? '' : 's'} to Roam Contacts.`);
      await reloadContacts();
      setContacts((prev) => mergeImported(prev));
      return;
    }
    if (result.skipped > 0) {
      toast.message('Could not add those contacts — check the name and phone number.');
      return;
    }
    toast.message('No contacts were added.');
  }, [reloadContacts]);

  const handleImportFromPhone = async () => {
    if (canUseInAppDeviceContactPicker()) {
      setDevicePickerOpen(true);
      return;
    }

    if (!canUseBrowserContactPicker()) {
      toast.error('Contact picker is not available here. Use Add contact instead.');
      return;
    }

    setImporting(true);
    try {
      const picked = await pickDeviceContactsFromBrowser();
      if (!picked.length) {
        toast.message('No contact selected.');
        return;
      }
      const result = await importDeviceContactSelection(picked);
      await handleDeviceImportResult(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not access phone contacts');
    } finally {
      setImporting(false);
    }
  };

  const handleFinish = async () => {
    let draftName = fullName.trim();
    let draftPhone = phone.replace(/\D/g, '');
    let contactId: string | undefined;
    let pickupPreset: { label: string; address: string; lat: number; lng: number } | undefined;
    let placeId: string | undefined;

    if (selected && !manual) {
      draftName = selected.display_name;
      draftPhone = selected.phone_e164.replace(/\D/g, '').slice(-10);
      contactId = selected.id;
      if (selectedPlaceId) {
        const place = selected.places?.find((p) => p.id === selectedPlaceId);
        const trip = readBookForSomeoneTrip();
        if (place && trip) {
          placeId = place.id;
          pickupPreset = {
            label: place.label,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
          };
          persistBookForSomeoneTrip({
            pickupAddress: place.address,
            pickupLat: place.lat,
            pickupLng: place.lng,
            dropoffAddress: trip.dropoffAddress,
            dropoffLat: trip.dropoffLat,
            dropoffLng: trip.dropoffLng,
          });
        }
      }
    }

    if (!draftName || !draftPhone) {
      toast.error('Select a contact or enter recipient details.');
      return;
    }
    if (!isValidGuestPhone(draftPhone)) {
      toast.error('Enter a valid 10-digit phone number.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Sign in to book a ride for someone else.');
      navigate('/login');
      return;
    }

    if (manual && saveToRoam && !contactId) {
      try {
        const { contact } = await contactsCreate({
          display_name: draftName,
          phone_e164: buildGuestPhoneE164('+1', draftPhone),
          relation: 'friend',
        });
        contactId = contact.id;
        toast.success(`${draftName} saved to Roam Contacts`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save contact');
        return;
      }
    }

    persistGuestRecipientDraft({
      fullName: draftName,
      phone: draftPhone.length > 10 ? draftPhone.slice(-10) : draftPhone,
      countryCode: '+1',
      contactId,
      selectedPlaceId: placeId,
      pickupPreset,
    });
    toast.success(`Ready to book for ${draftName}.`);
    navigate('/');
  };

  const handleBack = () => {
    if (step === 'recipient') {
      setStep('locations');
      return;
    }
    navigate('/services');
  };

  const tripSummary = readBookForSomeoneTrip();

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 items-center bg-[#f7f9fb] px-4 safe-t">
        <button type="button" onClick={handleBack} className="rounded-full p-2" style={{ color: PRIMARY }}>
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>Book for Someone Else</h1>
      </header>

      <div className="mx-auto flex w-full max-w-2xl gap-2 px-4 pt-2 safe-x">
        <div
          className="h-1 flex-1 rounded-full"
          style={{ backgroundColor: PRIMARY }}
          aria-hidden
        />
        <div
          className="h-1 flex-1 rounded-full"
          style={{ backgroundColor: step === 'recipient' ? PRIMARY : SURFACE_LOW }}
          aria-hidden
        />
      </div>
      <p className="mx-auto w-full max-w-2xl px-4 pt-2 text-xs font-semibold uppercase tracking-wide safe-x" style={{ color: ON_SURFACE_VARIANT }}>
        Step {step === 'locations' ? '1 of 2 · Trip' : '2 of 2 · Passenger'}
      </p>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-4 safe-x">
        {step === 'locations' ? (
          <>
            <section className="space-y-2">
              <h2 className="text-[30px] font-bold leading-tight">Where is the ride?</h2>
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Set pickup and drop-off first. You&apos;ll choose who is riding next.
              </p>
            </section>

            <div
              className="space-y-4 rounded-[24px] p-5"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <RoamPlaceField
                label={
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <CircleDot className="h-4 w-4" style={{ color: PRIMARY }} aria-hidden />
                    Pickup
                  </span>
                }
                value={pickupAddress}
                onChangeText={(text) => {
                  setPickupAddress(text);
                  if (!text.trim()) setPickup(null);
                }}
                onResolved={({ address, lat, lng }) => {
                  setPickupAddress(address);
                  setPickup({ lat, lng });
                }}
                placeholder="Where should we pick them up?"
                clearable
                showLocationButton
                onLocationClick={() => void handleUseMyLocationForPickup()}
                locationLoading={pickupLocLoading}
              />

              <RoamPlaceField
                label={
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4" style={{ color: SECONDARY }} aria-hidden />
                    Drop-off
                  </span>
                }
                value={dropoffAddress}
                onChangeText={(text) => {
                  setDropoffAddress(text);
                  if (!text.trim()) setDropoff(null);
                }}
                onResolved={({ address, lat, lng }) => {
                  setDropoffAddress(address);
                  setDropoff({ lat, lng });
                }}
                placeholder="Where are they going?"
                clearable
              />
            </div>

            <button
              type="button"
              onClick={handleLocationsContinue}
              disabled={!coordsReady}
              className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              Continue
              <ArrowRight className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
            {tripSummary ? (
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{ backgroundColor: 'rgba(0,74,198,0.06)', color: ON_SURFACE }}
              >
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                  Trip
                </p>
                <p className="mt-1 font-medium">{tripSummary.pickupAddress}</p>
                <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>to</p>
                <p className="font-medium">{tripSummary.dropoffAddress}</p>
                <button
                  type="button"
                  onClick={() => setStep('locations')}
                  className="mt-2 text-xs font-semibold"
                  style={{ color: PRIMARY }}
                >
                  Edit locations
                </button>
              </div>
            ) : null}

            <section className="space-y-2">
              <h2 className="text-[30px] font-bold leading-tight">Who is riding?</h2>
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Choose from Roam Contacts, import from your phone, or enter details manually.
              </p>
            </section>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void handleImportFromPhone()}
                disabled={importing}
                className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-semibold disabled:opacity-50"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: PRIMARY }}
              >
                <Smartphone className="h-5 w-5" aria-hidden />
                {importing ? 'Importing…' : 'From phone'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/account/contacts/new')}
                className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-semibold"
                style={{ backgroundColor: PRIMARY, color: '#fff' }}
              >
                <Plus className="h-5 w-5" aria-hidden />
                Add contact
              </button>
              <button
                type="button"
                onClick={() => navigate('/account/contacts')}
                className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-semibold"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: PRIMARY }}
              >
                <SlidersHorizontal className="h-5 w-5" aria-hidden />
                Organize
              </button>
            </div>

            {!manual ? (
              <>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: ON_SURFACE_VARIANT }} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Roam Contacts"
                    className="h-12 w-full rounded-2xl border-none pl-11 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]"
                    style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                  />
                </div>

                {groups.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setGroupFilterId(null)}
                      className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium"
                      style={{
                        backgroundColor: groupFilterId === null ? PRIMARY : SURFACE_LOW,
                        color: groupFilterId === null ? '#fff' : ON_SURFACE,
                      }}
                    >
                      All
                    </button>
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGroupFilterId(g.id)}
                        className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium"
                        style={{
                          backgroundColor: groupFilterId === g.id ? PRIMARY : SURFACE_LOW,
                          color: groupFilterId === g.id ? '#fff' : ON_SURFACE,
                        }}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                ) : null}

                {loading ? (
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Loading contacts…</p>
                ) : filtered.length === 0 ? (
                  <div
                    className="space-y-4 rounded-[24px] p-6 text-center"
                    style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                  >
                    <UserPlus className="mx-auto h-10 w-10" style={{ color: PRIMARY }} aria-hidden />
                    <p className="font-semibold">No Roam Contacts yet</p>
                    <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                      Import from your phone or add someone new.
                    </p>
                  </div>
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto">
                    {filtered.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(c);
                            setSelectedPlaceId(null);
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl p-4 text-left"
                          style={{
                            backgroundColor: SURFACE_LOWEST,
                            boxShadow: CARD_SHADOW,
                            borderWidth: 2,
                            borderStyle: 'solid',
                            borderColor: selected?.id === c.id ? PRIMARY : 'transparent',
                          }}
                        >
                          <div>
                            <p className="font-semibold">{c.display_name}</p>
                            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                              {relationLabel(c.relation, c.relation_custom)}
                              {c.groups?.length ? ` · ${c.groups.map((g) => g.name).join(', ')}` : ''}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {selected?.places?.length ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold tracking-wide" style={{ color: SECONDARY }}>
                      USE SAVED PICKUP INSTEAD
                    </p>
                    {selected.places.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlaceId(p.id)}
                        className="block w-full rounded-xl p-3 text-left text-sm"
                        style={{
                          backgroundColor: selectedPlaceId === p.id ? 'rgba(0,74,198,0.08)' : SURFACE_LOW,
                          borderWidth: 1,
                          borderColor: selectedPlaceId === p.id ? PRIMARY : 'transparent',
                        }}
                      >
                        <span className="font-semibold">{p.label}</span>
                        <span className="block" style={{ color: ON_SURFACE_VARIANT }}>{p.address}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <button type="button" onClick={() => setManual(true)} className="text-sm font-semibold" style={{ color: PRIMARY }}>
                  Enter details manually
                </button>
              </>
            ) : (
              <div className="space-y-4 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  className="h-14 w-full rounded-xl border-none px-4"
                  style={{ backgroundColor: SURFACE_LOW }}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatGuestPhoneDisplay(e.target.value))}
                  placeholder="(555) 000-0000"
                  className="h-14 w-full rounded-xl border-none px-4"
                  style={{ backgroundColor: SURFACE_LOW }}
                />
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={saveToRoam}
                    onChange={(e) => setSaveToRoam(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  Save to Roam Contacts for next time
                </label>
                <button type="button" onClick={() => setManual(false)} className="text-sm font-semibold" style={{ color: PRIMARY }}>
                  Back to Roam Contacts
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleFinish()}
              className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              Continue to ride options
              <ArrowRight className="h-5 w-5" />
            </button>
          </>
        )}
      </main>

      <DeviceContactsPickerSheet
        open={devicePickerOpen}
        onClose={() => setDevicePickerOpen(false)}
        onImported={(result) => void handleDeviceImportResult(result)}
      />
    </div>
  );
}
