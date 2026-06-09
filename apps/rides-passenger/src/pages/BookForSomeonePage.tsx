import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CircleDot,
  Copy,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Smartphone,
  UserPlus,
  Users,
} from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { RiderContactGroupRow, RiderContactRow, TripIntentBookerViewDto } from '@roam/types/riderContacts';
import { TripIntentBookSheet } from '@/components/trip-intent/TripIntentBookSheet';
import { TRIP_INTENT_V2 } from '@/lib/tripIntentFlags';
import {
  contactLookupIntent,
  roamTagLookupIntent,
  tripIntentClaim,
  tripIntentGetBookerView,
  tripIntentReject,
} from '@/services/tripIntentEdge';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { contactsCreate, contactsList, contactGroupsList, createPassengerAuthorization, getPassengerAuthorizationById, lookupPassengerByPhone } from '@/services/contactsEdge';
import {
  buildGuestPhoneE164,
  clearBookForSomeoneTrip,
  isValidGuestPhone,
  persistBookForSomeoneTrip,
  persistGuestRecipientDraft,
  readGuestRecipientDraft,
  type BookForSomeoneTripDraft,
} from '@/lib/guestRecipientBooking';
import { DeviceContactsPickerSheet } from '@/components/contacts/DeviceContactsPickerSheet';
import { RoamContactsPickerSheet } from '@/components/contacts/RoamContactsPickerSheet';
import { ManualRecipientSheet } from '@/components/contacts/ManualRecipientSheet';
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
  formatRoamTagDisplay,
  lookupRoamPassengerTagForBooking,
  normalizeRoamTagInput,
  roamTagErrorMessage,
} from '@/services/roamTagEdge';
import type { RoamPassengerTagBookingLookupDto } from '@roam/types/roamPassengerTag';
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
  const location = useLocation();
  const [step, setStep] = useState<Step>('locations');

  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupLocLoading, setPickupLocLoading] = useState(false);
  const [tripDraft, setTripDraft] = useState<BookForSomeoneTripDraft | null>(null);

  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [groups, setGroups] = useState<RiderContactGroupRow[]>([]);
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saveToRoam, setSaveToRoam] = useState(true);
  const [selected, setSelected] = useState<RiderContactRow | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [roamTagInput, setRoamTagInput] = useState('');
  const [roamTagLoading, setRoamTagLoading] = useState(false);
  const [roamTagError, setRoamTagError] = useState<string | null>(null);
  const [roamTagMatch, setRoamTagMatch] = useState<RoamPassengerTagBookingLookupDto | null>(null);
  const [phoneProfileMatch, setPhoneProfileMatch] = useState<RoamPassengerTagBookingLookupDto | null>(null);
  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false);
  const [recipientStatus, setRecipientStatus] = useState<'linked' | 'pending_authorization'>('linked');
  const [passengerAuthorizationId, setPassengerAuthorizationId] = useState<string | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [waitingForName, setWaitingForName] = useState<string | null>(null);
  const [linkedPassengerUserId, setLinkedPassengerUserId] = useState<string | null>(null);
  const [intentSheetOpen, setIntentSheetOpen] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<TripIntentBookerViewDto | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [fulfilling, setFulfilling] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const openIntentSheet = (intent: TripIntentBookerViewDto | null | undefined): boolean => {
    const canCommit = intent?.can_commit ?? intent?.can_fulfill;
    if (!TRIP_INTENT_V2 || !canCommit) return false;
    setPendingIntent(intent);
    setIntentSheetOpen(true);
    return true;
  };

  const handleIntentCommit = async (intent: TripIntentBookerViewDto) => {
    setFulfilling(true);
    try {
      await tripIntentClaim(intent.intent_id);
      setIntentSheetOpen(false);
      setPendingIntent(null);
      toast.success('You agreed to pay for this trip');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not agree to pay');
    } finally {
      setFulfilling(false);
    }
  };

  const handleIntentReject = async (intent: TripIntentBookerViewDto) => {
    setRejecting(true);
    try {
      await tripIntentReject(intent.intent_id);
      setIntentSheetOpen(false);
      setPendingIntent(null);
      toast.message('Trip request declined');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not decline trip');
    } finally {
      setRejecting(false);
    }
  };

  useEffect(() => {
    const tripIntentId = (location.state as { tripIntentId?: string } | null)?.tripIntentId;
    if (!tripIntentId || !TRIP_INTENT_V2) return;

    let cancelled = false;
    setIntentLoading(true);
    void tripIntentGetBookerView(tripIntentId)
      .then((res) => {
        if (cancelled) return;
        if (openIntentSheet(res.trip_intent)) {
          navigate(location.pathname, { replace: true, state: null });
        } else {
          toast.error('This trip is no longer available to pay for.');
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load that trip request.');
      })
      .finally(() => {
        if (!cancelled) setIntentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.state, navigate]);

  const clearRecipientSelection = () => {
    setSelected(null);
    setSelectedPlaceId(null);
    setRoamTagMatch(null);
    setPhoneProfileMatch(null);
    setRoamTagInput('');
    setFullName('');
    setPhone('');
    setManual(false);
    setRecipientStatus('linked');
    setPassengerAuthorizationId(null);
    setAuthorizationUrl(null);
    setWaitingForName(null);
    setLinkedPassengerUserId(null);
  };

  const resolvePhoneRecipient = async (name: string, phoneDigits: string) => {
    const e164 = buildGuestPhoneE164('+1', phoneDigits);
    setPhoneLookupLoading(true);
    try {
      const result = await lookupPassengerByPhone(e164);
      if (result.found && result.profile) {
        setPhoneProfileMatch({
          user_id: result.profile.user_id,
          custom_tag_name: result.profile.custom_tag_name ?? '',
          display_name: result.profile.display_name,
          phone_e164: e164,
          avatar_url: result.profile.avatar_url,
        });
        setRecipientStatus('linked');
        setPassengerAuthorizationId(null);
        setAuthorizationUrl(null);
        setWaitingForName(null);
        return;
      }
      const { authorization } = await createPassengerAuthorization({
        recipient_name: name,
        phone_e164: e164,
        draft_trip_json: tripDraft ?? undefined,
      });
      setPhoneProfileMatch(null);
      setRecipientStatus('pending_authorization');
      setPassengerAuthorizationId(authorization.id);
      setAuthorizationUrl(authorization.url);
      setWaitingForName(name);
      toast.message(`Waiting for ${name} to authorize`, {
        description: 'Share the link so they can sign in and link their account.',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not resolve passenger');
    } finally {
      setPhoneLookupLoading(false);
    }
  };

  const lookupRoamTag = async (raw: string) => {
    const normalized = normalizeRoamTagInput(raw);
    if (normalized.length < 3) {
      setRoamTagMatch(null);
      return;
    }
    setRoamTagLoading(true);
    setRoamTagError(null);
    try {
      if (TRIP_INTENT_V2) {
        const lookup = await roamTagLookupIntent(normalized);
        if (lookup.intent && openIntentSheet(lookup.intent)) {
          setRoamTagMatch(null);
          return;
        }
      }
      const { tag } = await lookupRoamPassengerTagForBooking(normalized);
      setRoamTagMatch(tag);
      setSelected(null);
      setSelectedPlaceId(null);
      setManual(false);
    } catch (e) {
      setRoamTagMatch(null);
      const code = e instanceof Error ? e.message : 'lookup_failed';
      setRoamTagError(roamTagErrorMessage(code) || 'Could not find that Roam Tag.');
    } finally {
      setRoamTagLoading(false);
    }
  };

  useEffect(() => {
    if (!readGuestRecipientDraft()) {
      clearBookForSomeoneTrip();
    }
  }, []);

  const reloadContacts = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const [listRes, groupsRes] = await Promise.all([
        contactsList(),
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
  }, []);

  useEffect(() => {
    if (step !== 'recipient') return;
    void reloadContacts();
  }, [step, reloadContacts]);

  useEffect(() => {
    if (recipientStatus !== 'pending_authorization' || !passengerAuthorizationId) return;
    const interval = setInterval(() => {
      void getPassengerAuthorizationById(passengerAuthorizationId)
        .then(({ authorization }) => {
          if (authorization.status === 'claimed' && authorization.passenger_user_id) {
            setRecipientStatus('linked');
            setLinkedPassengerUserId(authorization.passenger_user_id);
            toast.success(`${waitingForName ?? 'Passenger'} is linked — you can continue.`);
          }
        })
        .catch(() => { /* ignore poll errors */ });
    }, 4000);
    return () => clearInterval(interval);
  }, [recipientStatus, passengerAuthorizationId, waitingForName]);

  const hasRecipient = Boolean(
    roamTagMatch ||
      phoneProfileMatch ||
      linkedPassengerUserId ||
      selected?.linked_user_id ||
      (manual && fullName.trim() && phone.replace(/\D/g, '').length >= 10),
  );

  const canContinue =
    hasRecipient &&
    recipientStatus === 'linked' &&
    !phoneLookupLoading;

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
    setTripDraft({
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
    if (!tripDraft) {
      toast.error('Set pickup and drop-off first.');
      setStep('locations');
      return;
    }

    let draftName = fullName.trim();
    let draftPhone = phone.replace(/\D/g, '');
    let contactId: string | undefined;
    let passengerUserId: string | undefined;
    let roamTagName: string | undefined;
    let pickupPreset: { label: string; address: string; lat: number; lng: number } | undefined;
    let placeId: string | undefined;
    let finalTrip = tripDraft;

    if (roamTagMatch) {
      draftName = roamTagMatch.display_name?.trim() || roamTagMatch.custom_tag_name;
      draftPhone = roamTagMatch.phone_e164!.replace(/\D/g, '').slice(-10);
      passengerUserId = roamTagMatch.user_id;
      roamTagName = roamTagMatch.custom_tag_name;
    } else if (phoneProfileMatch) {
      draftName = phoneProfileMatch.display_name?.trim() || phoneProfileMatch.custom_tag_name;
      draftPhone = phoneProfileMatch.phone_e164!.replace(/\D/g, '').slice(-10);
      passengerUserId = phoneProfileMatch.user_id;
      roamTagName = phoneProfileMatch.custom_tag_name;
    } else if (selected && !manual) {
      draftName = selected.display_name;
      draftPhone = selected.phone_e164.replace(/\D/g, '').slice(-10);
      contactId = selected.id;
      if (selected.linked_user_id) {
        passengerUserId = selected.linked_user_id;
      }
      if (selectedPlaceId) {
        const place = selected.places?.find((p) => p.id === selectedPlaceId);
        if (place) {
          placeId = place.id;
          pickupPreset = {
            label: place.label,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
          };
          finalTrip = {
            ...finalTrip,
            pickupAddress: place.address,
            pickupLat: place.lat,
            pickupLng: place.lng,
          };
        }
      }
    }

    if (!passengerUserId && linkedPassengerUserId) {
      passengerUserId = linkedPassengerUserId;
    }

    if (!draftName || !draftPhone) {
      toast.error('Select a contact or enter recipient details.');
      return;
    }
    if (!passengerUserId) {
      toast.error('The passenger must authorize before you can book.');
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
        });
        contactId = contact.id;
        toast.success(`${draftName} saved to Roam Contacts`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save contact');
        return;
      }
    }

    persistBookForSomeoneTrip(finalTrip);
    persistGuestRecipientDraft({
      fullName: draftName,
      phone: draftPhone.length > 10 ? draftPhone.slice(-10) : draftPhone,
      countryCode: '+1',
      contactId,
      selectedPlaceId: placeId,
      pickupPreset,
      passengerUserId,
      roamTagName,
      passengerAuthorizationId: passengerAuthorizationId ?? undefined,
      authorizationUrl: authorizationUrl ?? undefined,
      recipientStatus: passengerUserId ? 'linked' : recipientStatus,
    });
    toast.success(`Ready to book for ${draftName}.`);
    navigate('/');
  };

  const handleBack = () => {
    if (step === 'recipient') {
      setStep('locations');
      return;
    }
    clearBookForSomeoneTrip();
    setTripDraft(null);
    navigate('/services');
  };

  const tripSummary = tripDraft;

  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      style={{
        backgroundColor: PAGE_BG,
        color: ON_SURFACE,
        paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
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

      <main className="mx-auto w-full max-w-2xl min-h-0 flex-1 overflow-y-auto px-4 py-4 safe-x">
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
              <div className="space-y-2">
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
          <div className="space-y-5">
            {tripSummary ? (
              <button
                type="button"
                onClick={() => setStep('locations')}
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: PRIMARY }}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Edit address
              </button>
            ) : null}

            <section>
              <h2 className="text-[30px] font-bold leading-tight">Who is roaming?</h2>
            </section>

            <div
              className="space-y-3 rounded-[24px] p-4"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                Roam Tag
              </p>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <span
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold"
                    style={{ color: ON_SURFACE_VARIANT }}
                  >
                    @
                  </span>
                  <input
                    value={roamTagInput}
                    onChange={(e) => {
                      setRoamTagInput(normalizeRoamTagInput(e.target.value));
                      setRoamTagMatch(null);
                      setRoamTagError(null);
                    }}
                    onBlur={() => {
                      if (roamTagInput.length >= 3) void lookupRoamTag(roamTagInput);
                    }}
                    placeholder="theirname"
                    maxLength={24}
                    className="h-12 w-full rounded-xl pl-9 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
                    style={{ backgroundColor: SURFACE_LOW }}
                  />
                </div>
                <button
                  type="button"
                  disabled={roamTagLoading || roamTagInput.length < 3}
                  onClick={() => void lookupRoamTag(roamTagInput)}
                  className="shrink-0 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: PRIMARY, color: '#fff' }}
                >
                  {roamTagLoading ? '…' : 'Find'}
                </button>
              </div>
              {roamTagError ? (
                <div
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
                  style={{ backgroundColor: 'rgba(220,38,38,0.08)', color: '#b91c1c' }}
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{roamTagError}</span>
                </div>
              ) : null}
              {roamTagMatch ? (
                <div
                  className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{ backgroundColor: 'rgba(0,74,198,0.08)' }}
                >
                  {roamTagMatch.avatar_url ? (
                    <img
                      src={roamTagMatch.avatar_url}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: 'rgba(0,74,198,0.15)', color: PRIMARY }}
                    >
                      {(roamTagMatch.display_name ?? roamTagMatch.custom_tag_name).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {roamTagMatch.display_name ?? roamTagMatch.custom_tag_name}
                    </p>
                    <p className="text-sm font-medium" style={{ color: PRIMARY }}>
                      {formatRoamTagDisplay(roamTagMatch.custom_tag_name)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRoamTagMatch(null);
                      setRoamTagInput('');
                    }}
                    className="text-xs font-semibold"
                    style={{ color: ON_SURFACE_VARIANT }}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
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
                onClick={() => {
                  setSelected(null);
                  setSelectedPlaceId(null);
                  setRoamTagMatch(null);
                  setRoamTagInput('');
                  setFullName('');
                  setPhone('');
                  setManual(false);
                  setManualOpen(true);
                }}
                className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-semibold"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: PRIMARY }}
              >
                <UserPlus className="h-5 w-5" aria-hidden />
                Enter manually
              </button>
              <button
                type="button"
                onClick={() => setContactsOpen(true)}
                className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-semibold"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: PRIMARY }}
              >
                <Users className="h-5 w-5" aria-hidden />
                Roam Contacts
              </button>
            </div>

            {recipientStatus === 'pending_authorization' && authorizationUrl ? (
              <div
                className="space-y-3 rounded-2xl p-4"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                  >
                    {(waitingForName ?? 'Passenger').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: PRIMARY }}>
                      Waiting for {waitingForName ?? 'passenger'}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                      Share this link so they can sign in and authorize the ride.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (typeof navigator.share === 'function') {
                        await navigator.share({ title: 'Authorize your Roam ride', url: authorizationUrl });
                      } else {
                        await navigator.clipboard.writeText(authorizationUrl);
                        toast.success('Link copied');
                      }
                    } catch {
                      /* user cancelled share */
                    }
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
                  style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
                >
                  <Copy className="h-4 w-4" />
                  Copy authorization link
                </button>
                <button
                  type="button"
                  onClick={clearRecipientSelection}
                  className="w-full py-1 text-center text-xs font-semibold"
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  Change recipient
                </button>
              </div>
            ) : null}

            {phoneProfileMatch ? (
              <div
                className="flex items-center gap-3 rounded-2xl p-4"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                >
                  {(phoneProfileMatch.display_name ?? phoneProfileMatch.custom_tag_name).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {phoneProfileMatch.display_name ?? formatRoamTagDisplay(phoneProfileMatch.custom_tag_name)}
                  </p>
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    Roam member · {formatRoamTagDisplay(phoneProfileMatch.custom_tag_name)}
                  </p>
                </div>
              </div>
            ) : null}

            {phoneLookupLoading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking up phone…
              </div>
            ) : null}

            {manual && fullName.trim() && recipientStatus !== 'pending_authorization' ? (
              <div
                className="flex items-center gap-3 rounded-2xl p-4"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                >
                  {fullName.trim().slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{fullName.trim()}</p>
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    {phone || 'No phone'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setManualOpen(true)}
                  className="text-xs font-semibold"
                  style={{ color: PRIMARY }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManual(false);
                    setFullName('');
                    setPhone('');
                  }}
                  className="text-xs font-semibold"
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  Clear
                </button>
              </div>
            ) : null}

            {selected ? (
              <div
                className="flex items-center gap-3 rounded-2xl p-4"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                >
                  {selected.display_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{selected.display_name}</p>
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    {selected.phone_e164}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setSelectedPlaceId(null);
                  }}
                  className="text-xs font-semibold"
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  Clear
                </button>
              </div>
            ) : null}

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
          </div>
        )}
      </main>

      {step === 'recipient' ? (
        <footer
          className="shrink-0 border-t border-black/5 bg-[#f7f9fb] px-4 py-3 safe-x"
          style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.04)' }}
        >
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => void handleFinish()}
            className="mx-auto flex h-14 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl text-lg font-semibold disabled:opacity-50"
            style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY, boxShadow: CARD_SHADOW }}
          >
            Continue to ride options
            <ArrowRight className="h-5 w-5" />
          </button>
        </footer>
      ) : null}

      <ManualRecipientSheet
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        fullName={fullName}
        onFullNameChange={setFullName}
        phone={phone}
        onPhoneChange={setPhone}
        saveToRoam={saveToRoam}
        onSaveToRoamChange={setSaveToRoam}
        onConfirm={async () => {
          setManual(true);
          setManualOpen(false);
          setSelected(null);
          setRoamTagMatch(null);
          setPhoneProfileMatch(null);
          const digits = phone.replace(/\D/g, '');
          if (fullName.trim() && digits.length >= 10) {
            await resolvePhoneRecipient(fullName.trim(), digits);
          }
        }}
      />

      <RoamContactsPickerSheet
        open={contactsOpen}
        onClose={() => setContactsOpen(false)}
        contacts={contacts}
        groups={groups}
        loading={loading}
        query={query}
        onQueryChange={setQuery}
        groupFilterId={groupFilterId}
        onGroupFilterChange={setGroupFilterId}
        selectedId={selected?.id ?? null}
        onSelect={async (contact) => {
          setRoamTagMatch(null);
          setRoamTagInput('');
          setManual(false);
          setPhoneProfileMatch(null);
          if (TRIP_INTENT_V2 && contact.linked_user_id) {
            setIntentLoading(true);
            try {
              const { intent } = await contactLookupIntent(contact.id);
              if (openIntentSheet(intent ?? undefined)) {
                setSelected(contact);
                return;
              }
            } catch {
              /* fall through to standard flow */
            } finally {
              setIntentLoading(false);
            }
          }
          setSelected(contact);
          setSelectedPlaceId(null);
          if (contact.linked_user_id) {
            setRecipientStatus('linked');
            setPassengerAuthorizationId(null);
            setAuthorizationUrl(null);
            setLinkedPassengerUserId(contact.linked_user_id);
          } else {
            await resolvePhoneRecipient(
              contact.display_name,
              contact.phone_e164.replace(/\D/g, '').slice(-10),
            );
          }
        }}
      />

      <TripIntentBookSheet
        open={intentSheetOpen}
        intent={pendingIntent}
        accepting={fulfilling || intentLoading}
        rejecting={rejecting}
        onClose={() => {
          setIntentSheetOpen(false);
          setPendingIntent(null);
        }}
        onAccept={(intent) => void handleIntentCommit(intent)}
        onReject={(intent) => void handleIntentReject(intent)}
      />

      <DeviceContactsPickerSheet
        open={devicePickerOpen}
        onClose={() => setDevicePickerOpen(false)}
        onImported={(result) => void handleDeviceImportResult(result)}
      />
    </div>
  );
}
