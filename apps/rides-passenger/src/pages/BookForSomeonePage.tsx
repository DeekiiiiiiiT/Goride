import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { RiderContactRow } from '@roam/types/riderContacts';
import { contactsList } from '@/services/contactsEdge';
import { relationLabel } from '@/components/contacts/ContactRelationPicker';
import {
  buildGuestPhoneE164,
  formatGuestPhoneDisplay,
  isValidGuestPhone,
  persistGuestRecipientDraft,
} from '@/lib/guestRecipientBooking';
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

export default function BookForSomeonePage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selected, setSelected] = useState<RiderContactRow | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  useEffect(() => {
    void contactsList().then((r) => setContacts(r.contacts)).catch(() => {});
  }, []);

  const filtered = contacts.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.display_name.toLowerCase().includes(q) || c.phone_e164.includes(q);
  });

  const handleContinue = async () => {
    let draftName = fullName.trim();
    let draftPhone = phone.replace(/\D/g, '');
    let contactId: string | undefined;
    let pickupPreset: GuestRecipientDraftPickup | undefined;
    let placeId: string | undefined;

    if (selected && !manual) {
      draftName = selected.display_name;
      draftPhone = selected.phone_e164.replace(/\D/g, '').slice(-10);
      contactId = selected.id;
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

    persistGuestRecipientDraft({
      fullName: draftName,
      phone: draftPhone.length > 10 ? draftPhone.slice(-10) : draftPhone,
      countryCode: '+1',
      contactId,
      selectedPlaceId: placeId,
      pickupPreset,
    });
    toast.success(`Booking for ${draftName}. Choose pickup and destination.`);
    navigate('/');
  };

  type GuestRecipientDraftPickup = {
    label: string;
    address: string;
    lat: number;
    lng: number;
  };

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 items-center bg-[#f7f9fb] px-4 safe-t">
        <button type="button" onClick={() => navigate('/services')} className="rounded-full p-2" style={{ color: PRIMARY }}>
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>Book for Someone Else</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-4 safe-x">
        <section className="space-y-2">
          <h2 className="text-[30px] font-bold leading-tight">Recipient Details</h2>
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Pick from Roam Contacts or enter details manually.
          </p>
        </section>

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
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {selected?.places?.length ? (
              <div className="space-y-2">
                <p className="text-xs font-bold tracking-wide" style={{ color: SECONDARY }}>PICKUP FROM</p>
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
            <button type="button" onClick={() => setManual(false)} className="text-sm font-semibold" style={{ color: PRIMARY }}>
              Back to contacts
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleContinue()}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold"
          style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
        >
          Continue to Booking
          <ArrowRight className="h-5 w-5" />
        </button>
      </main>
    </div>
  );
}
