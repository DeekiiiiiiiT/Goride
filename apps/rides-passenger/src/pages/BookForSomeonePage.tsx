import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  ChevronDown,
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
  OUTLINE,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY,
  SURFACE_CONTAINER,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';
import '@/styles/book-for-someone.css';
import { PICKUP_LOCATION_REQUEST } from '@/lib/pickupLocationRequestFlags';
import { pickupLocationRequestCreatedToast } from '@/lib/pickupLocationRequestCopy';
import type { PickupLocationDeliveryChannel } from '@roam/types/pickupLocationRequest';
import type { RiderPickupTarget } from '@/lib/riderPickupTarget';
import { RiderPickupPickerSheet } from '@/components/pickup-location/RiderPickupPickerSheet';
import { PickupLocationActivityPanel } from '@/components/pickup-location/PickupLocationActivityPanel';
import {
  consumePickupLocationRequest,
  createPickupLocationRequest,
} from '@/services/pickupLocationRequestEdge';

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
  const [riderPickerOpen, setRiderPickerOpen] = useState(false);
  const [pickupRequestId, setPickupRequestId] = useState<string | null>(null);
  const [pickupRequestRider, setPickupRequestRider] = useState<RiderPickupTarget | null>(null);
  const [pickupRequestLoading, setPickupRequestLoading] = useState(false);
  const [pickupDeliveryChannel, setPickupDeliveryChannel] = useState<PickupLocationDeliveryChannel | null>(null);
  const [consumedPickupRequestId, setConsumedPickupRequestId] = useState<string | null>(null);
  const [pickupSharedViaRequest, setPickupSharedViaRequest] = useState(false);
  const [pickupSharedSummary, setPickupSharedSummary] = useState<{
    riderName: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  /** Rider chosen via "Get rider's location" — kept after the request panel clears. */
  const [pickupIdentifiedRider, setPickupIdentifiedRider] = useState<RiderPickupTarget | null>(null);
  const [locationsContinueLoading, setLocationsContinueLoading] = useState(false);

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

  const canSkipRecipientStep =
    PICKUP_LOCATION_REQUEST &&
    Boolean(pickupIdentifiedRider) &&
    pickupSharedViaRequest &&
    coordsReady;

  const clearRiderPickupFlow = () => {
    setPickupIdentifiedRider(null);
    setPickupSharedViaRequest(false);
  };

  const clearPickupLocationRequest = () => {
    setPickupRequestId(null);
    setPickupRequestRider(null);
    setPickupDeliveryChannel(null);
  };

  const openRiderPicker = () => {
    setRiderPickerOpen(true);
  };

  const handleRiderPickupTargetSelected = async (target: RiderPickupTarget) => {
    if (!target.phone_e164) {
      toast.error('This rider needs a phone number to receive the location request.');
      return;
    }
    setPickupRequestLoading(true);
    try {
      const { request, delivery_channel, sms_sent } = await createPickupLocationRequest({
        rider_name: target.name,
        rider_phone_e164: target.phone_e164,
        rider_source: target.source,
        rider_user_id: target.user_id ?? null,
        rider_contact_id: target.contact_id ?? null,
      });
      setPickupSharedSummary(null);
      setPickupRequestId(request.id);
      setPickupRequestRider(target);
      setPickupIdentifiedRider(target);
      setPickupDeliveryChannel(delivery_channel);
      toast.message(pickupLocationRequestCreatedToast(target.name, delivery_channel, sms_sent));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not request location';
      if (message.includes('pickup_location_request_disabled')) return;
      if (message.includes('rate_limited')) {
        toast.error('Too many requests — try again in a few minutes.');
      } else {
        toast.error(message);
      }
    } finally {
      setPickupRequestLoading(false);
    }
  };

  const handleUseMyLocationForPickup = async () => {
    clearRiderPickupFlow();
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

  const persistBookingDraftsAndNavigate = async (params: {
    finalTrip: BookForSomeoneTripDraft;
    draftName: string;
    draftPhone: string;
    passengerUserId: string;
    contactId?: string;
    roamTagName?: string;
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Sign in to book a ride for someone else.');
      navigate('/login');
      return false;
    }

    persistBookForSomeoneTrip(params.finalTrip);
    persistGuestRecipientDraft({
      fullName: params.draftName,
      phone: params.draftPhone.length > 10 ? params.draftPhone.slice(-10) : params.draftPhone,
      countryCode: '+1',
      contactId: params.contactId,
      passengerUserId: params.passengerUserId,
      roamTagName: params.roamTagName,
      recipientStatus: 'linked',
      pickupLocationRequestId: consumedPickupRequestId ?? undefined,
      pickupSharedViaRequest: pickupSharedViaRequest || undefined,
    });
    if (consumedPickupRequestId && PICKUP_LOCATION_REQUEST) {
      void consumePickupLocationRequest(consumedPickupRequestId).catch(() => undefined);
    }
    toast.success(`Ready to book for ${params.draftName}.`);
    navigate('/');
    return true;
  };

  const handleLocationsContinue = async () => {
    if (!pickup || !dropoff || !pickupAddress.trim() || !dropoffAddress.trim()) {
      toast.error('Enter pickup and drop-off locations.');
      return;
    }

    const trip: BookForSomeoneTripDraft = {
      pickupAddress: pickupAddress.trim(),
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress: dropoffAddress.trim(),
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
    };

    if (canSkipRecipientStep && pickupIdentifiedRider) {
      setLocationsContinueLoading(true);
      try {
        const rider = pickupIdentifiedRider;
        const draftPhone = rider.phone_e164.replace(/\D/g, '').slice(-10);
        if (!isValidGuestPhone(draftPhone)) {
          toast.error('This rider needs a valid phone number to book.');
          return;
        }

        let passengerUserId = rider.user_id ?? undefined;
        let roamTagName: string | undefined;

        if (!passengerUserId) {
          const result = await lookupPassengerByPhone(rider.phone_e164);
          if (result.found && result.profile) {
            passengerUserId = result.profile.user_id;
            roamTagName = result.profile.custom_tag_name ?? undefined;
          }
        }

        if (!passengerUserId) {
          setTripDraft(trip);
          setFullName(rider.name);
          setPhone(draftPhone);
          setManual(false);
          setSelected(null);
          setRoamTagMatch(null);
          setPhoneProfileMatch(null);
          setStep('recipient');
          void resolvePhoneRecipient(rider.name, draftPhone);
          toast.message(`Confirm details for ${rider.name} to continue.`);
          return;
        }

        setTripDraft(trip);
        await persistBookingDraftsAndNavigate({
          finalTrip: trip,
          draftName: rider.name,
          draftPhone,
          passengerUserId,
          contactId: rider.contact_id ?? undefined,
          roamTagName,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not continue to booking');
      } finally {
        setLocationsContinueLoading(false);
      }
      return;
    }

    setTripDraft(trip);
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
      pickupLocationRequestId: consumedPickupRequestId ?? undefined,
      pickupSharedViaRequest: pickupSharedViaRequest || undefined,
    });
    if (consumedPickupRequestId && PICKUP_LOCATION_REQUEST) {
      void consumePickupLocationRequest(consumedPickupRequestId).catch(() => undefined);
    }
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

  const placeFieldInputClass = 'book-for-someone-input w-full';
  const placeFieldSuggestionClass =
    'book-for-someone-suggestion flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm disabled:opacity-50';
  const placeFieldSuggestionsListClass = 'book-for-someone-suggestions';

  return (
    <div
      className={`flex min-h-[100dvh] flex-col ${
        step === 'locations' ? 'book-for-someone-page--locations' : 'book-for-someone-page--recipient'
      }`}
      style={{
        backgroundColor: PAGE_BG,
        color: ON_SURFACE,
        paddingBottom:
          step === 'recipient'
            ? 'calc(8.5rem + env(safe-area-inset-bottom, 0px))'
            : 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="book-for-someone-ambient" aria-hidden />

      <header className="book-for-someone-header sticky top-0 z-50 safe-t">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:scale-95"
          style={{ color: PRIMARY }}
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-1 flex-1 text-center text-xl font-bold" style={{ color: PRIMARY }}>
          Book for Someone Else
        </h1>
        <div className="w-10 shrink-0" aria-hidden />
      </header>

      <div
        className={`relative z-[1] mx-auto w-full max-w-2xl space-y-1.5 px-4 safe-x ${
          step === 'locations' ? 'book-for-someone-progress' : 'pt-3'
        }`}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ON_SURFACE_VARIANT }}>
          {step === 'locations' ? 'Step 1 of 2 · Trip' : 'Step 2 of 2 · Passenger'}
        </span>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: SURFACE_CONTAINER }}
          role="progressbar"
          aria-valuenow={step === 'locations' ? 50 : 100}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              step === 'locations' ? 'w-1/2' : 'w-full'
            }`}
            style={{ backgroundColor: PRIMARY_CONTAINER }}
          />
        </div>
      </div>

      <main
        className={
          step === 'locations'
            ? 'book-for-someone-locations-main relative z-[1] mx-auto w-full max-w-2xl min-h-0 flex-1 overflow-y-auto px-4 safe-x'
            : 'relative z-[1] mx-auto w-full max-w-2xl min-h-0 flex-1 overflow-y-auto space-y-6 px-4 py-5 safe-x'
        }
      >
        {step === 'locations' ? (
          <>
            <h2 className="book-for-someone-locations-title">Locate roamer!</h2>

            <div className="book-for-someone-glass book-for-someone-glass--compact">
              <section className="book-for-someone-section-block">
                <div className="book-for-someone-section-label">
                  <div className="book-for-someone-section-icon book-for-someone-section-icon--pickup">
                    <CircleDot className="h-4 w-4" aria-hidden />
                  </div>
                  <span
                    className="text-sm font-semibold uppercase tracking-widest"
                    style={{ color: OUTLINE }}
                  >
                    Pickup
                  </span>
                </div>

                <RoamPlaceField
                  label="Pickup"
                  hideLabel
                  value={pickupAddress}
                  onChangeText={(text) => {
                    clearRiderPickupFlow();
                    setPickupAddress(text);
                    if (!text.trim()) setPickup(null);
                  }}
                  onResolved={({ address, lat, lng }) => {
                    clearRiderPickupFlow();
                    setPickupAddress(address);
                    setPickup({ lat, lng });
                  }}
                  placeholder="Where should we pick them up?"
                  clearable
                  showLocationButton
                  onLocationClick={() => void handleUseMyLocationForPickup()}
                  locationLoading={pickupLocLoading}
                  inputClassName={placeFieldInputClass}
                  suggestionButtonClassName={placeFieldSuggestionClass}
                  suggestionsListClassName={placeFieldSuggestionsListClass}
                  portalSuggestions
                />

                <div className="book-for-someone-quick-actions">
                  {PICKUP_LOCATION_REQUEST ? (
                    <button
                      type="button"
                      disabled={pickupRequestLoading || Boolean(pickupRequestId)}
                      onClick={openRiderPicker}
                      className="book-for-someone-quick-action"
                    >
                      <div className="book-for-someone-quick-action__icon">
                        <UserPlus aria-hidden />
                      </div>
                      <span className="book-for-someone-quick-action__label" style={{ color: ON_SURFACE }}>
                        {pickupRequestLoading ? 'Sending…' : "Get rider's location"}
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pickupLocLoading}
                    onClick={() => void handleUseMyLocationForPickup()}
                    className={`book-for-someone-quick-action ${PICKUP_LOCATION_REQUEST ? '' : 'col-span-2'}`}
                    aria-label={pickupLocLoading ? 'Getting location' : 'Use my current location'}
                  >
                    <div className="book-for-someone-quick-action__icon">
                      <Navigation aria-hidden />
                    </div>
                    <span className="book-for-someone-quick-action__label" style={{ color: ON_SURFACE }}>
                      {pickupLocLoading ? 'Getting location…' : 'Use my current location'}
                    </span>
                  </button>
                </div>
              </section>

              <div className="book-for-someone-divider">
                <div className="book-for-someone-divider-badge">
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </div>
              </div>

              <section className="book-for-someone-section-block">
                <div className="book-for-someone-section-label">
                  <div className="book-for-someone-section-icon book-for-someone-section-icon--dropoff">
                    <MapPin className="h-4 w-4" aria-hidden />
                  </div>
                  <span
                    className="text-sm font-semibold uppercase tracking-widest"
                    style={{ color: OUTLINE }}
                  >
                    Drop-off
                  </span>
                </div>

                <RoamPlaceField
                  label="Drop-off"
                  hideLabel
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
                  inputClassName={placeFieldInputClass}
                  suggestionButtonClassName={placeFieldSuggestionClass}
                  suggestionsListClassName={placeFieldSuggestionsListClass}
                  portalSuggestions
                />
              </section>
            </div>

            <button
              type="button"
              onClick={() => void handleLocationsContinue()}
              disabled={!coordsReady || locationsContinueLoading}
              className="book-for-someone-continue"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              {locationsContinueLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </>
              )}
            </button>

            {PICKUP_LOCATION_REQUEST ? (
              <PickupLocationActivityPanel
                compact
                pendingRequestId={pickupRequestId}
                pendingRider={pickupRequestRider}
                sharedSummary={pickupSharedSummary}
                onShared={({ lat, lng, address }) => {
                  setPickup({ lat, lng });
                  setPickupAddress(address);
                  setPickupSharedViaRequest(true);
                  if (pickupRequestId) setConsumedPickupRequestId(pickupRequestId);
                  toast.success('Pickup location received');
                }}
                onPendingCleared={clearPickupLocationRequest}
                onSharedSummary={setPickupSharedSummary}
                onRestoreShared={({ lat, lng, address }) => {
                  setPickup({ lat, lng });
                  setPickupAddress(address);
                  setPickupSharedViaRequest(true);
                  toast.message('Pickup restored');
                }}
              />
            ) : null}
          </>
        ) : (
          <div className="space-y-6 pb-4">
            {tripSummary ? (
              <button
                type="button"
                onClick={() => setStep('locations')}
                className="book-for-someone-edit-address"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Edit address
              </button>
            ) : null}

            <section>
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight">Who is roaming?</h2>
            </section>

            <div className="book-for-someone-card space-y-4 p-6">
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: ON_SURFACE_VARIANT }}>
                Roam Tag
              </p>
              <div className="flex items-center gap-3">
                <div className="relative min-w-0 flex-1">
                  <span
                    className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-medium"
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
                    className="book-for-someone-roam-tag-input"
                  />
                </div>
                <button
                  type="button"
                  disabled={roamTagLoading || roamTagInput.length < 3}
                  onClick={() => void lookupRoamTag(roamTagInput)}
                  className="book-for-someone-find-btn"
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

            <div className="book-for-someone-action-grid">
              <button
                type="button"
                onClick={() => void handleImportFromPhone()}
                disabled={importing}
                className="book-for-someone-action-tile"
              >
                <div className="book-for-someone-action-tile__icon">
                  <Smartphone className="h-8 w-8" aria-hidden />
                </div>
                <span className="book-for-someone-action-tile__label">
                  {importing ? 'Importing…' : 'From phone'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/account/contacts/new')}
                className="book-for-someone-action-tile book-for-someone-action-tile--primary"
              >
                <div className="book-for-someone-action-tile__icon">
                  <Plus className="h-8 w-8" strokeWidth={2.5} aria-hidden />
                </div>
                <span className="book-for-someone-action-tile__label">Add contact</span>
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
                className="book-for-someone-action-tile"
              >
                <div className="book-for-someone-action-tile__icon">
                  <UserPlus className="h-8 w-8" aria-hidden />
                </div>
                <span className="book-for-someone-action-tile__label">Enter manually</span>
              </button>
              <button
                type="button"
                onClick={() => setContactsOpen(true)}
                className="book-for-someone-action-tile"
              >
                <div className="book-for-someone-action-tile__icon">
                  <Users className="h-8 w-8" aria-hidden />
                </div>
                <span className="book-for-someone-action-tile__label">Roam Contacts</span>
              </button>
            </div>

            {recipientStatus === 'pending_authorization' && authorizationUrl ? (
              <div className="book-for-someone-result-card space-y-3 p-4">
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
              <div className="book-for-someone-result-card flex items-center gap-3 p-4">
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
              <div className="book-for-someone-result-card flex items-center gap-3 p-4">
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
              <div className="book-for-someone-result-card flex items-center gap-3 p-4">
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
        <div className="book-for-someone-footer-cta safe-x">
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => void handleFinish()}
            className="book-for-someone-continue mx-auto max-w-2xl shadow-lg"
            style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
          >
            Continue to ride options
            <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
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

      <RiderPickupPickerSheet
        open={PICKUP_LOCATION_REQUEST && riderPickerOpen}
        onClose={() => setRiderPickerOpen(false)}
        onSelect={(target) => void handleRiderPickupTargetSelected(target)}
      />
    </div>
  );
}
