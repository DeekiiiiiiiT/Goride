import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Share2 } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import { createBookingRequest } from '@/services/contactsEdge';
import { buildGuestPhoneE164, formatGuestPhoneDisplay, isValidGuestPhone } from '@/lib/guestRecipientBooking';
import { RoamPlaceField } from '@/components/RoamPlaceField';
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

export default function RoamTagPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [publicCode, setPublicCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
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
      navigate('/login');
      return;
    }

    setLoading(true);
    try {
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
      setShareUrl(res.url);
      setPublicCode(res.public_code);
      toast.success('Roam Tag created — share it with your booker.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create tag');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied');
    } catch {
      toast.message(shareUrl);
    }
  };

  const shareLink = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      await navigator.share({ title: 'Book my Roam ride', url: shareUrl, text: `Book my ride on Roam: ${publicCode}` });
    } else {
      void copyLink();
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
        <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          Ask someone to book and pay for your ride. Share the link or code below.
        </p>

        {!shareUrl ? (
          <div className="space-y-4 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="h-12 w-full rounded-xl px-4" style={{ backgroundColor: SURFACE_LOW }} />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatGuestPhoneDisplay(e.target.value))}
              placeholder="Your phone"
              className="h-12 w-full rounded-xl px-4"
              style={{ backgroundColor: SURFACE_LOW }}
            />
            <RoamPlaceField label="Pickup" value={pickupAddress} onChangeText={setPickupAddress} onResolved={({ address, lat, lng }) => { setPickupAddress(address); setPickup({ lat, lng }); }} />
            <RoamPlaceField label="Destination" value={dropoffAddress} onChangeText={setDropoffAddress} onResolved={({ address, lat, lng }) => { setDropoffAddress(address); setDropoff({ lat, lng }); }} />
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleCreate()}
              className="h-14 w-full rounded-2xl font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              {loading ? 'Creating…' : 'Create Roam Tag'}
            </button>
          </div>
        ) : (
          <div className="space-y-4 rounded-[24px] p-6 text-center" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <p className="text-sm font-bold tracking-widest" style={{ color: ON_SURFACE_VARIANT }}>YOUR ROAM TAG</p>
            <p className="text-4xl font-bold tracking-[0.2em]" style={{ color: PRIMARY }}>{publicCode}</p>
            <p className="break-all text-sm" style={{ color: ON_SURFACE_VARIANT }}>{shareUrl}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => void copyLink()} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-semibold" style={{ backgroundColor: PRIMARY, color: '#fff' }}>
                <Copy className="h-4 w-4" /> Copy
              </button>
              <button type="button" onClick={() => void shareLink()} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-semibold" style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}>
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
