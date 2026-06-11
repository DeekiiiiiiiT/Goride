import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, Copy, Loader2, Navigation, Tag, Users, X } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { RoamMode, TripIntentAudience, TripIntentRow, RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import { contactGroupsList, contactsList } from '@/services/contactsEdge';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { RoamModePicker } from '@/components/trip-intent/RoamModePicker';
import { RoamContactsPickerSheet } from '@/components/contacts/RoamContactsPickerSheet';
import { DeviceContactsPickerSheet } from '@/components/contacts/DeviceContactsPickerSheet';
import { RoamTagLookupSheet } from '@/components/contacts/RoamTagLookupSheet';
import type { RoamPassengerTagBookingLookupDto } from '@roam/types/roamPassengerTag';
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
  tripIntentBook,
  tripIntentPublish,
  tripIntentQuote,
  tripIntentUpdate,
  tripIntentWithdraw,
} from '@/services/tripIntentEdge';
import { ridesGetRequest } from '@/services/ridesEdge';
import { buildGuestPhoneE164, formatGuestPhoneDisplay, isValidGuestPhone } from '@/lib/guestRecipientBooking';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { formatFareMinor } from '@/services/tripIntentEdge';
import {
  getCurrentPositionWithAccuracy,
  resolveAddressFromCoordinates,
} from '@/services/locationService';
import { DEFAULT_VEHICLE_OPTION } from '@/types/vehicleTypes';
import {
  bookForMeDetail,
  bookForMeFooterAction,
  bookForMeFooterLabel,
  bookForMeHeadline,
  isLiveLinkedRideStatus,
  TERMINAL_LINKED_RIDE_STATUSES,
} from '@/lib/bookForMeIntentUi';
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

const ACTIVE_INTENT_UI_STATUSES = new Set<TripIntentRow['status']>([
  'draft',
  'published',
  'claimed',
  'booked',
]);

function TripIntentPayerRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-3.5 py-2.5"
      style={{ borderColor: 'rgba(0,74,198,0.12)', backgroundColor: 'rgba(0,74,198,0.04)' }}
    >
      <span
        className="shrink-0 text-xs font-bold uppercase tracking-wider"
        style={{ color: ON_SURFACE_VARIANT }}
      >
        Payer
      </span>
      {children}
    </div>
  );
}

function PayerTagChip({ tagName }: { tagName: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-sm ring-1 ring-[rgba(0,74,198,0.2)]"
      style={{ color: PRIMARY }}
    >
      <Tag className="h-3.5 w-3.5 shrink-0 opacity-75" strokeWidth={2.25} aria-hidden />
      {formatRoamTagDisplay(tagName)}
    </span>
  );
}

function PayerNameChip({ name }: { name: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-sm ring-1 ring-black/8"
      style={{ color: ON_SURFACE }}
    >
      {name}
    </span>
  );
}

export default function BookForMePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [audience, setAudience] = useState<TripIntentAudience>('targeted');
  const [targetContact, setTargetContact] = useState<RiderContactRow | null>(null);
  const [targetPhone, setTargetPhone] = useState('');
  const [targetTag, setTargetTag] = useState<RoamPassengerTagBookingLookupDto | null>(null);
  const [intent, setIntent] = useState<TripIntentRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [countdownTick, setCountdownTick] = useState(0);
  const [roamPickerOpen, setRoamPickerOpen] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [groups, setGroups] = useState<RiderContactGroupRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const intentStatusRef = useRef<string | null>(null);

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

  const reloadContacts = () => {
    setContactsLoading(true);
    void Promise.all([contactsList(), contactGroupsList()])
      .then(([c, g]) => {
        setContacts(c.contacts);
        setGroups(g.groups);
      })
      .catch(() => undefined)
      .finally(() => setContactsLoading(false));
  };

  useEffect(() => {
    reloadContacts();
  }, []);

  useEffect(() => {
    if (step === 'payer') reloadContacts();
  }, [step]);

  const clearActiveIntent = useCallback(() => {
    setIntent(null);
    setStep('mode');
    void queryClient.invalidateQueries({ queryKey: ['book-for-others', 'activity'] });
  }, [queryClient]);

  const applyActiveIntent = useCallback(
    (trip: TripIntentRow | null) => {
      if (!trip) {
        clearActiveIntent();
        return;
      }

      const linked = trip.linked_ride_status ?? null;
      if (linked && TERMINAL_LINKED_RIDE_STATUSES.has(linked)) {
        setIntent(trip);
        setStep('published');
        return;
      }

      if (!ACTIVE_INTENT_UI_STATUSES.has(trip.status)) {
        clearActiveIntent();
        return;
      }

      setIntent(trip);
      if (trip.status !== 'draft') {
        setStep('published');
      }
    },
    [clearActiveIntent],
  );

  const refreshActiveIntent = useCallback(async () => {
    try {
      const prevStatus = intentStatusRef.current;
      const r = await tripIntentGetMyActive();
      let trip = r.trip_intent;
      const hadLiveIntent = prevStatus === 'booked' || prevStatus === 'claimed' || prevStatus === 'published';

      if (
        trip?.status === 'booked'
        && trip.ride_request_id
        && (!trip.linked_ride_status || !TERMINAL_LINKED_RIDE_STATUSES.has(trip.linked_ride_status))
      ) {
        try {
          const rideRes = await ridesGetRequest(trip.ride_request_id);
          const rideStatus = rideRes.ride.status;
          if (TERMINAL_LINKED_RIDE_STATUSES.has(rideStatus)) {
            applyActiveIntent({ ...trip, linked_ride_status: rideStatus });
            intentStatusRef.current = 'booked';
            return;
          }
          trip = { ...trip, linked_ride_status: rideStatus };
        } catch {
          /* keep server intent */
        }
      }

      applyActiveIntent(trip);
      if (trip?.status === 'claimed' && prevStatus === 'published') {
        toast.success('Your payer agreed — book your ride now');
      }
      intentStatusRef.current = trip?.status ?? null;
      if (!trip && hadLiveIntent) {
        toast.message('Your previous trip ended. You can start a new one.');
      }
    } catch {
      /* ignore */
    }
  }, [applyActiveIntent]);

  useEffect(() => {
    void refreshActiveIntent();
  }, [refreshActiveIntent]);

  useEffect(() => {
    if (intent) {
      intentStatusRef.current = intent.status;
    }
  }, [intent?.id, intent?.status]);

  useEffect(() => {
    if (!intent) return;
    if (!['published', 'claimed', 'booked'].includes(intent.status)) return;

    void refreshActiveIntent();
    const intervalMs = intent.status === 'published' ? 5_000 : 8_000;
    const poll = window.setInterval(() => {
      void refreshActiveIntent();
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshActiveIntent();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intent?.id, intent?.status, refreshActiveIntent]);

  const bookCountdown = (() => {
    if (!intent?.book_by_at) return null;
    const ms = new Date(intent.book_by_at).getTime() - Date.now();
    if (ms <= 0) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  })();
  void countdownTick;

  const handleWithdrawTrip = async () => {
    if (!intent?.id) return;
    setWithdrawing(true);
    try {
      await tripIntentWithdraw(intent.id);
      clearActiveIntent();
      toast.message('Trip cancelled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel trip');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDismissTrip = async () => {
    if (!intent?.id) {
      clearActiveIntent();
      navigate('/');
      return;
    }
    setWithdrawing(true);
    try {
      try {
        await tripIntentWithdraw(intent.id);
      } catch (e) {
        // Terminal rides may already be closed server-side; still clear local UI.
        const message = e instanceof Error ? e.message : '';
        if (!message.includes('already ended') && !message.includes('no longer be cancelled')) {
          throw e;
        }
      }
      clearActiveIntent();
      toast.message(
        intent.linked_ride_status === 'completed'
          ? 'Trip complete — thanks for riding with Roam'
          : 'Trip cleared',
      );
      navigate('/');
    } catch {
      try {
        await tripIntentGetMyActive();
      } catch {
        /* best-effort reconcile */
      }
      clearActiveIntent();
      navigate('/');
    } finally {
      setWithdrawing(false);
    }
  };

  useEffect(() => {
    if (intent?.status !== 'claimed' || !intent.book_by_at) return;
    const id = window.setInterval(() => setCountdownTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [intent?.status, intent?.book_by_at]);

  const handleBookTrip = async () => {
    if (!intent?.id) return;
    setBooking(true);
    try {
      const res = await tripIntentBook(intent.id);
      setIntent(res.trip_intent ?? { ...intent, status: 'booked', ride_request_id: res.ride.id });
      await queryClient.invalidateQueries({ queryKey: ['book-for-others', 'activity'] });
      toast.success('Ride booked — finding a driver');
      navigate(`/ride/${res.ride.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not book ride';
      toast.error(message);
      if (message.includes('publish again') || message.includes('Booking window')) {
        setIntent(null);
        setStep('mode');
        await queryClient.invalidateQueries({ queryKey: ['book-for-others', 'activity'] });
      }
    } finally {
      setBooking(false);
    }
  };

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
    const editable = (row: TripIntentRow) => row.status === 'draft' || row.status === 'published';
    if (intent?.id && editable(intent)) return intent;

    const active = await tripIntentGetMyActive();
    const serverTrip = active.trip_intent;
    if (serverTrip) {
      if (serverTrip.status === 'claimed' || serverTrip.status === 'booked') {
        let resolved = serverTrip;
        if (serverTrip.status === 'booked' && serverTrip.ride_request_id) {
          try {
            const rideRes = await ridesGetRequest(serverTrip.ride_request_id);
            if (TERMINAL_LINKED_RIDE_STATUSES.has(rideRes.ride.status)) {
              resolved = { ...serverTrip, linked_ride_status: rideRes.ride.status };
            }
          } catch {
            /* use server intent */
          }
        }
        applyActiveIntent(resolved);
        if (TERMINAL_LINKED_RIDE_STATUSES.has(resolved.linked_ride_status ?? '')) {
          throw new Error('Your last trip has ended. Tap Back to home below, then start a new one.');
        }
        throw new Error('You already have a live trip. Finish or cancel it below before starting a new one.');
      }
      if (editable(serverTrip)) {
        setIntent(serverTrip);
        return serverTrip;
      }
    }

    if (!name.trim() || !isValidGuestPhone(phone)) {
      throw new Error('Enter your name and phone.');
    }
    const res = await tripIntentCreate({
      requester_name: name.trim(),
      requester_phone: buildGuestPhoneE164('+1', phone),
      roam_mode: roamMode,
    });
    if (res.trip_intent.status === 'claimed' || res.trip_intent.status === 'booked') {
      applyActiveIntent(res.trip_intent);
      throw new Error('You already have a live trip. Cancel it below before starting a new one.');
    }
    setIntent(res.trip_intent);
    return res.trip_intent;
  };

  const hasTargetPayer = Boolean(targetContact || targetPhone || targetTag);
  /** A selected payer always wins — avoids publishing as any_booker while a tag is still shown. */
  const effectiveAudience: TripIntentAudience = hasTargetPayer ? 'targeted' : audience;

  const handlePublish = async () => {
    setLoading(true);
    try {
      await refresh(true);
      let row = await ensureDraftIntent();
      if (effectiveAudience === 'targeted' && !hasTargetPayer) {
        throw new Error('Choose who should pay — pick a contact, search a Roam tag, or enter a phone.');
      }

      row = (await tripIntentUpdate(row.id, {
        roam_mode: roamMode,
        audience: effectiveAudience,
        target_contact_id: effectiveAudience === 'targeted' && targetContact ? targetContact.id : null,
        target_booker_user_id: effectiveAudience === 'targeted'
          ? targetTag?.user_id ?? (targetContact?.linked_user_id ?? null)
          : null,
        target_booker_phone_e164: effectiveAudience === 'targeted'
          ? targetContact?.phone_e164
            ?? (targetPhone ? buildGuestPhoneE164('+1', targetPhone) : null)
            ?? targetTag?.phone_e164
            ?? null
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
      setAudience(published.audience ?? effectiveAudience);
      setStep('published');
      await queryClient.invalidateQueries({ queryKey: ['book-for-others', 'activity'] });
      toast.success(
        effectiveAudience === 'targeted'
          ? 'Trip sent — your payer will see it in Active trips'
          : 'Your trip is live on your tag',
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not publish';
      toast.error(message);
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

  const intentFooterAction = intent ? bookForMeFooterAction(intent) : 'none';

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
            <p className="font-semibold">{bookForMeHeadline(intent)}</p>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {intent.status === 'published' ? (
                intent.audience === 'targeted' ? (
                  targetTag ? (
                    <>
                      <strong>{formatRoamTagDisplay(targetTag.custom_tag_name)}</strong> will see this under{' '}
                      <strong>Book for others → Active trips → For someone</strong>.
                    </>
                  ) : (
                    <>Your payer will see this under <strong>Active trips → For someone</strong>.</>
                  )
                ) : (
                  <>Tell them to search <strong>{displayTag}</strong> in Roam</>
                )
              ) : intent.status === 'claimed' || intent.status === 'booked' ? (
                bookForMeDetail(intent, { bookCountdown })
              ) : null}
            </p>
            {intent.fare_estimate_minor ? (
              <p className="text-lg font-bold">{formatFareMinor(intent.fare_estimate_minor, intent.currency ?? 'JMD')}</p>
            ) : null}
            {intent.status === 'claimed' && intent.pickup_address ? (
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {formatShortAddress(intent.pickup_address)}
                {intent.dropoff_address ? ` → ${formatShortAddress(intent.dropoff_address)}` : ''}
              </p>
            ) : null}
            {intent.status === 'published' && intent.audience !== 'targeted' ? (
              <button type="button" onClick={() => void copyTag()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold" style={{ backgroundColor: PRIMARY, color: '#fff' }}>
                <Copy className="h-4 w-4" /> Copy tag
              </button>
            ) : null}
            {intent.status === 'claimed' && (intent.can_book !== false) ? (
              <>
                <button
                  type="button"
                  disabled={booking || bookCountdown === '0:00'}
                  onClick={() => void handleBookTrip()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-50"
                  style={{ backgroundColor: PRIMARY, color: '#fff' }}
                >
                  {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {booking ? 'Booking…' : 'Book ride'}
                </button>
                <button
                  type="button"
                  disabled={withdrawing}
                  onClick={() => void handleWithdrawTrip()}
                  className="w-full text-sm font-medium disabled:opacity-50"
                  style={{ color: '#b42318' }}
                >
                  {withdrawing ? 'Cancelling…' : 'Cancel trip'}
                </button>
              </>
            ) : null}
            {intent.status === 'booked'
            && intent.ride_request_id
            && (!intent.linked_ride_status || isLiveLinkedRideStatus(intent.linked_ride_status)) ? (
              <button
                type="button"
                onClick={() => navigate(`/ride/${intent.ride_request_id}`)}
                className="flex h-12 w-full items-center justify-center rounded-xl font-semibold"
                style={{ backgroundColor: PRIMARY, color: '#fff' }}
              >
                View live trip
              </button>
            ) : null}
            {intentFooterAction !== 'none' ? (
              intentFooterAction === 'dismiss' ? (
                <button
                  type="button"
                  disabled={withdrawing}
                  onClick={() => void handleDismissTrip()}
                  className="flex h-12 w-full items-center justify-center rounded-xl font-semibold disabled:opacity-50"
                  style={{ backgroundColor: PRIMARY, color: '#fff' }}
                >
                  {bookForMeFooterLabel(intentFooterAction, withdrawing)}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={withdrawing}
                  onClick={() => void handleWithdrawTrip()}
                  className="w-full text-sm font-medium disabled:opacity-50"
                  style={{ color: '#b42318' }}
                >
                  {bookForMeFooterLabel(intentFooterAction, withdrawing)}
                </button>
              )
            ) : null}
          </div>
        ) : null}

        {tagLoading && !tagLocked ? (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: ON_SURFACE_VARIANT }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading your tag…
          </div>
        ) : null}

        {step === 'mode' && (tagLocked || !tagLoading) && intent?.status !== 'claimed' && intent?.status !== 'booked' ? (
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

        {step === 'trip' && intent?.status !== 'claimed' && intent?.status !== 'booked' ? (
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

        {step === 'payer' && intent?.status !== 'claimed' && intent?.status !== 'booked' ? (
          <div className="space-y-3 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <p className="font-semibold">Who should pay?</p>
            {(['targeted', 'any_booker'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAudience(a);
                  if (a === 'any_booker') {
                    setTargetContact(null);
                    setTargetPhone('');
                    setTargetTag(null);
                  }
                }}
                className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left"
                style={{ borderColor: audience === a ? PRIMARY : 'rgba(0,0,0,0.08)' }}
              >
                <Users className="h-5 w-5" style={{ color: PRIMARY }} />
                <span>{a === 'any_booker' ? 'Anyone with my tag' : 'Specific person'}</span>
              </button>
            ))}
            {audience === 'targeted' ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRoamPickerOpen(true)}
                  className="rounded-xl px-2 py-3 text-xs font-semibold sm:text-sm"
                  style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
                >
                  Roam contact
                </button>
                <button
                  type="button"
                  onClick={() => setDevicePickerOpen(true)}
                  className="rounded-xl px-2 py-3 text-xs font-semibold sm:text-sm"
                  style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
                >
                  Phone contact
                </button>
                <button
                  type="button"
                  onClick={() => setTagPickerOpen(true)}
                  className="rounded-xl px-2 py-3 text-xs font-semibold sm:text-sm"
                  style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
                >
                  Roam tag
                </button>
              </div>
            ) : null}
            {audience === 'targeted' && targetTag ? (
              <TripIntentPayerRow>
                <PayerTagChip tagName={targetTag.custom_tag_name} />
              </TripIntentPayerRow>
            ) : null}
            {audience === 'targeted' && !targetTag && targetContact ? (
              <TripIntentPayerRow>
                <PayerNameChip name={targetContact.display_name} />
              </TripIntentPayerRow>
            ) : null}
            {audience === 'targeted' && !targetTag && !targetContact && targetPhone ? (
              <TripIntentPayerRow>
                <PayerNameChip name={formatGuestPhoneDisplay(targetPhone)} />
              </TripIntentPayerRow>
            ) : null}
            <button type="button" disabled={loading} onClick={() => void handlePublish()} className="h-14 w-full rounded-2xl font-semibold disabled:opacity-50" style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}>
              {loading
                ? 'Publishing…'
                : effectiveAudience === 'targeted' && targetTag
                  ? `Send to ${formatRoamTagDisplay(targetTag.custom_tag_name)}`
                  : effectiveAudience === 'targeted'
                    ? 'Send to payer'
                    : 'Publish on my tag'}
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
          setTargetPhone('');
          setTargetTag(null);
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
          setTargetContact(null);
          setTargetTag(null);
          setDevicePickerOpen(false);
        }}
      />
      <RoamTagLookupSheet
        open={tagPickerOpen}
        onClose={() => setTagPickerOpen(false)}
        title="Who should pay?"
        description="Search for the person who will pay using their Roam tag."
        confirmLabel="Select payer"
        onSelect={(tag) => {
          setAudience('targeted');
          setTargetTag(tag);
          setTargetContact(null);
          setTargetPhone('');
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
