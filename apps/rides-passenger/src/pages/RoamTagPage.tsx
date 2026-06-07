import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Share2, Tag } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { BookingRequestRow } from '@roam/types/riderContacts';
import { createBookingRequest, getActiveBookingRequest } from '@/services/contactsEdge';
import {
  formatRoamTagDisplay,
  normalizeRoamTagInput,
  roamTagErrorMessage,
} from '@/services/roamTagEdge';
import { useRoamPassengerTag } from '@/hooks/useRoamPassengerTag';
import { buildGuestPhoneE164, formatGuestPhoneDisplay, isValidGuestPhone } from '@/lib/guestRecipientBooking';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { openSystemShareSheet } from '@/utils/systemShare';
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

function isBookingLinkActive(request: BookingRequestRow | null): boolean {
  if (!request) return false;
  if (request.status !== 'pending' && request.status !== 'claimed') return false;
  return new Date(request.expires_at) > new Date();
}

export default function RoamTagPage() {
  const navigate = useNavigate();
  const { tag, loading: tagLoading, saveCustomName, refresh } = useRoamPassengerTag({ ensureOnMount: true });

  const [customInput, setCustomInput] = useState('');
  const [savingTag, setSavingTag] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [activeRequest, setActiveRequest] = useState<BookingRequestRow | null>(null);
  const [loadingActive, setLoadingActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [hadLinkBefore, setHadLinkBefore] = useState(false);

  const tagLocked = Boolean(tag?.has_custom_tag);
  const hasActiveLink = isBookingLinkActive(activeRequest) && Boolean(shareUrl);
  const displayTag = formatRoamTagDisplay(tag?.custom_tag_name ?? customInput) ?? null;

  useEffect(() => {
    if (tag?.custom_tag_name) setCustomInput(tag.custom_tag_name);
  }, [tag?.custom_tag_name]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoadingActive(false);
        return;
      }
      void getActiveBookingRequest()
        .then((res) => {
          if (res.booking_request && res.url && isBookingLinkActive(res.booking_request)) {
            setActiveRequest(res.booking_request);
            setShareUrl(res.url);
            setHadLinkBefore(true);
            if (res.booking_request.requester_name) setName(res.booking_request.requester_name);
          }
        })
        .catch(() => {
          /* no active link */
        })
        .finally(() => setLoadingActive(false));
    });
  }, []);

  useEffect(() => {
    if (!activeRequest?.expires_at || !hasActiveLink) return;
    const check = () => {
      if (!isBookingLinkActive(activeRequest)) {
        setHadLinkBefore(true);
        setActiveRequest(null);
        setShareUrl(null);
      }
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, [activeRequest, hasActiveLink]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const meta = user.user_metadata ?? {};
      const displayName =
        (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta.name === 'string' && meta.name.trim()) ||
        '';
      if (displayName && !name) setName(displayName);
      const rawPhone =
        (typeof user.phone === 'string' && user.phone) ||
        (typeof meta.phone === 'string' && meta.phone) ||
        '';
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
      toast.success(`Your Roam Tag is ${formatRoamTagDisplay(normalized)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save tag';
      toast.error(roamTagErrorMessage(msg) || msg);
    } finally {
      setSavingTag(false);
    }
  };

  const applyActiveResponse = (res: { booking_request: BookingRequestRow; url: string }) => {
    setHadLinkBefore(true);
    setActiveRequest(res.booking_request);
    setShareUrl(res.url);
  };

  const handleCreateRequest = async () => {
    if (!tagLocked) {
      toast.error('Choose your Roam Tag name first.');
      return;
    }
    if (!name.trim() || !phone.trim()) {
      toast.error('Enter your name and phone.');
      return;
    }
    if (!isValidGuestPhone(phone)) {
      toast.error('Enter a valid phone number.');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/login?return=%2Fservices%2Froam-tag');
      return;
    }

    setLoading(true);
    try {
      await refresh(true);
      const res = await createBookingRequest({
        requester_name: name.trim(),
        requester_phone: buildGuestPhoneE164('+1', phone),
        pickup_lat: pickup?.lat,
        pickup_lng: pickup?.lng,
        pickup_address: pickupAddress || undefined,
        dropoff_lat: dropoff?.lat,
        dropoff_lng: dropoff?.lng,
        dropoff_address: dropoffAddress || undefined,
      });
      applyActiveResponse(res);
      if (!res.reused) toast.success('Your booking link is ready.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create request');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.message(text);
    }
  };

  const shareBooking = async () => {
    if (!shareUrl) return;
    const message = displayTag
      ? `${name.trim()} (${displayTag}) asked you to book a Roam ride.`
      : `${name.trim()} asked you to book a Roam ride.`;
    try {
      const shared = await openSystemShareSheet({
        title: 'Book my Roam ride',
        message,
        url: shareUrl,
      });
      if (!shared) {
        toast.message('Sharing is not available on this device. Use Copy link instead.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open share');
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 items-center bg-[#f7f9fb] px-4 safe-t">
        <button type="button" onClick={() => navigate('/services')} className="rounded-full p-2" style={{ color: PRIMARY }}>
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>Roam Tag</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 safe-x">
        <div
          className="rounded-[24px] p-5"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <div className="mb-4 flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'rgba(0, 74, 198, 0.1)', color: PRIMARY }}
            >
              <Tag className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold" style={{ color: ON_SURFACE }}>Your Roam Tag</h2>
          </div>

          {tagLoading ? (
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Setting up your tag…</p>
          ) : tagLocked ? (
            <div
              className="flex h-12 items-center gap-2 rounded-xl px-4"
              style={{ backgroundColor: SURFACE_LOW }}
            >
              <span className="text-lg font-semibold" style={{ color: ON_SURFACE_VARIANT }}>@</span>
              <span className="min-w-0 flex-1 truncate text-lg font-semibold" style={{ color: ON_SURFACE }}>
                {customInput}
              </span>
              {displayTag ? (
                <button
                  type="button"
                  onClick={() => void copyText(displayTag, 'Roam Tag')}
                  className="shrink-0 rounded-lg p-2 transition-colors active:scale-95"
                  style={{ color: PRIMARY }}
                  aria-label="Copy Roam Tag"
                >
                  <Copy className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold"
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  @
                </span>
                <input
                  value={customInput}
                  onChange={(e) => setCustomInput(normalizeRoamTagInput(e.target.value))}
                  placeholder="yourname"
                  maxLength={24}
                  className="h-12 w-full rounded-xl pl-9 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
                  style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
                />
              </div>
              <button
                type="button"
                disabled={savingTag || customInput.length < 3}
                onClick={() => void handleSaveTag()}
                className="h-12 w-full rounded-2xl font-semibold disabled:opacity-50"
                style={{ backgroundColor: PRIMARY, color: '#fff' }}
              >
                {savingTag ? 'Saving…' : 'Save Roam Tag'}
              </button>
            </div>
          )}
        </div>

        <div
          className="space-y-4 rounded-[24px] p-5"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <h2 className="text-base font-bold" style={{ color: ON_SURFACE }}>Ask someone to book</h2>

          {loadingActive ? (
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Checking for an active link…</p>
          ) : hasActiveLink ? (
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => void copyText(shareUrl!, 'Link')}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-semibold"
                style={{ backgroundColor: PRIMARY, color: '#fff' }}
              >
                <Copy className="h-4 w-4" /> Copy link
              </button>
              <button
                type="button"
                onClick={() => void shareBooking()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-semibold"
                style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
              >
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>
          ) : (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="h-12 w-full rounded-xl px-4"
                style={{ backgroundColor: SURFACE_LOW }}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatGuestPhoneDisplay(e.target.value))}
                placeholder="Your phone"
                className="h-12 w-full rounded-xl px-4"
                style={{ backgroundColor: SURFACE_LOW }}
              />
              <RoamPlaceField
                label="Pickup (optional)"
                value={pickupAddress}
                onChangeText={setPickupAddress}
                onResolved={({ address, lat, lng }) => {
                  setPickupAddress(address);
                  setPickup({ lat, lng });
                }}
              />
              <RoamPlaceField
                label="Destination (optional)"
                value={dropoffAddress}
                onChangeText={setDropoffAddress}
                onResolved={({ address, lat, lng }) => {
                  setDropoffAddress(address);
                  setDropoff({ lat, lng });
                }}
              />
              <button
                type="button"
                disabled={loading || !tagLocked}
                onClick={() => void handleCreateRequest()}
                className="h-14 w-full rounded-2xl font-semibold disabled:opacity-50"
                style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
              >
                {loading ? 'Creating link…' : hadLinkBefore ? 'Create another link' : 'Create booking link'}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
