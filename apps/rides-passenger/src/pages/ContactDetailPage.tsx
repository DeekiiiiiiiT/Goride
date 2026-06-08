import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, MapPin, Shield, Trash2 } from 'lucide-react';
import type { RiderContactRow } from '@roam/types/riderContacts';
import {
  contactGroupCreate,
  contactGroupsList,
  contactPlaceCreate,
  contactPlaceDelete,
  contactsCreate,
  contactsDelete,
  contactsGet,
  contactsList,
  contactsUpdate,
} from '@/services/contactsEdge';
import { ContactGroupPicker } from '@/components/contacts/ContactGroupPicker';
import { SafetyPreferenceToggle } from '@/components/trusted-contacts/SafetyPreferenceToggle';
import { MAX_TRUSTED_CONTACTS } from '@/services/trustedContactsEdge';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import {
  buildGuestPhoneE164,
  formatGuestPhoneDisplay,
  isValidGuestPhone,
  persistGuestRecipientDraft,
} from '@/lib/guestRecipientBooking';
import {
  CARD_SHADOW,
  ERROR,
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

export default function ContactDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [trusted, setTrusted] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof contactGroupsList>>['groups']>([]);
  const [places, setPlaces] = useState<NonNullable<RiderContactRow['places']>>([]);
  const [placeLabel, setPlaceLabel] = useState('Home');
  const [placeAddress, setPlaceAddress] = useState('');
  const [placeCoords, setPlaceCoords] = useState<{ lat: number; lng: number } | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const res = await contactGroupsList();
      setGroups(res.groups);
    } catch {
      /* optional */
    }
  }, []);

  const loadContact = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const { contact } = await contactsGet(id);
      setDisplayName(contact.display_name);
      setPhone(formatGuestPhoneDisplay(contact.phone_e164.replace(/^\+1/, '')));
      setTrusted(contact.trusted_for_safety);
      setGroupIds(contact.groups?.map((g) => g.id) ?? []);
      setPlaces(contact.places ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Contact not found');
      navigate('/account/contacts/roam');
    } finally {
      setLoading(false);
    }
  }, [id, isNew, navigate]);

  useEffect(() => {
    void loadGroups();
    void loadContact();
  }, [loadContact, loadGroups]);

  const handleSave = async () => {
    if (!displayName.trim() || !phone.trim()) {
      toast.error('Name and phone are required.');
      return;
    }
    if (!isValidGuestPhone(phone)) {
      toast.error('Enter a valid phone number.');
      return;
    }

    if (trusted) {
      const trustedRes = await contactsList({ trusted_for_safety: true }).catch(() => ({ contacts: [] }));
      const alreadyTrusted = !isNew && id && trustedRes.contacts.some((c) => c.id === id);
      const trustedCount = trustedRes.contacts.length - (alreadyTrusted ? 1 : 0);
      if (trustedCount >= MAX_TRUSTED_CONTACTS) {
        toast.error(`You can trust up to ${MAX_TRUSTED_CONTACTS} contacts. Remove one to add another.`);
        return;
      }
    }

    setSaving(true);
    try {
      const body = {
        display_name: displayName.trim(),
        phone_e164: buildGuestPhoneE164('+1', phone),
        trusted_for_safety: trusted,
        group_ids: groupIds,
      };
      if (isNew) {
        const { contact } = await contactsCreate(body);
        toast.success('Contact saved');
        navigate(`/account/contacts/${contact.id}`, { replace: true });
      } else if (id) {
        await contactsUpdate(id, body);
        toast.success('Contact updated');
        await loadContact();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlace = async () => {
    if (isNew || !id) {
      toast.error('Save the contact first.');
      return;
    }
    if (!placeCoords || !placeAddress.trim()) {
      toast.error('Pick an address from suggestions.');
      return;
    }
    try {
      const { place } = await contactPlaceCreate(id, {
        label: placeLabel.trim() || 'Place',
        address: placeAddress,
        lat: placeCoords.lat,
        lng: placeCoords.lng,
      });
      setPlaces((prev) => [...prev, place]);
      setPlaceAddress('');
      setPlaceCoords(null);
      toast.success('Place saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add place');
    }
  };

  const handleBookForContact = () => {
    if (!id || isNew) return;
    persistGuestRecipientDraft({
      fullName: displayName.trim(),
      phone: phone.replace(/\D/g, ''),
      countryCode: '+1',
      contactId: id,
    });
    navigate('/services/book-for-someone');
  };

  const handleBookWithPlace = (place: NonNullable<RiderContactRow['places']>[number]) => {
    if (!id || isNew) return;
    persistGuestRecipientDraft({
      fullName: displayName.trim(),
      phone: phone.replace(/\D/g, ''),
      countryCode: '+1',
      contactId: id,
      selectedPlaceId: place.id,
      pickupPreset: {
        label: place.label,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
      },
    });
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <p style={{ color: ON_SURFACE_VARIANT }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 items-center bg-[#f7f9fb] px-4 safe-t">
        <button type="button" onClick={() => navigate('/account/contacts/roam')} className="rounded-full p-2" style={{ color: PRIMARY }}>
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>
          {isNew ? 'New contact' : displayName || 'Contact'}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 safe-x">
        <div className="space-y-4 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
          <div>
            <label className="mb-2 block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>NAME</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-12 w-full rounded-xl border-none px-4 outline-none focus:ring-2 focus:ring-[#004ac6]"
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>PHONE</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatGuestPhoneDisplay(e.target.value))}
              className="h-12 w-full rounded-xl border-none px-4 outline-none focus:ring-2 focus:ring-[#004ac6]"
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
            />
          </div>
          <ContactGroupPicker
            groups={groups}
            selectedIds={groupIds}
            onChange={setGroupIds}
            onCreateGroup={async (name) => {
              const { group } = await contactGroupCreate({ name });
              setGroups((prev) => [...prev, group]);
              setGroupIds((prev) => [...prev, group.id]);
            }}
          />
          <div
            className="overflow-hidden rounded-2xl"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <SafetyPreferenceToggle
              checked={trusted}
              onChange={setTrusted}
              icon={<Shield className="h-6 w-6" aria-hidden />}
              iconBg="rgba(0, 74, 198, 0.1)"
              iconColor={PRIMARY}
              title="Trusted contact for safety"
              description="Receive live trip updates via SMS"
            />
          </div>
          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            Manage all trusted contacts in Account → Contacts → Trusted Contacts.
          </p>
        </div>

        {!isNew && id ? (
          <div className="space-y-3 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <p className="text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>SAVED PLACES</p>
            {places.map((place) => (
              <div key={place.id} className="flex items-start gap-3 rounded-xl p-3" style={{ backgroundColor: SURFACE_LOW }}>
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PRIMARY }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{place.label}</p>
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>{place.address}</p>
                  <button type="button" onClick={() => handleBookWithPlace(place)} className="mt-2 text-sm font-semibold" style={{ color: PRIMARY }}>
                    Book ride from here
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void contactPlaceDelete(id, place.id).then(() => {
                    setPlaces((prev) => prev.filter((p) => p.id !== place.id));
                  })}
                  aria-label="Remove place"
                  style={{ color: ERROR }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="space-y-2 pt-2">
              <input
                value={placeLabel}
                onChange={(e) => setPlaceLabel(e.target.value)}
                placeholder="Label (Home, Work…)"
                className="h-10 w-full rounded-xl border-none px-3 text-sm"
                style={{ backgroundColor: SURFACE_LOW }}
              />
              <RoamPlaceField
                label="Address"
                value={placeAddress}
                onChangeText={(text) => {
                  setPlaceAddress(text);
                  setPlaceCoords(null);
                }}
                onResolved={({ address, lat, lng }) => {
                  setPlaceAddress(address);
                  setPlaceCoords({ lat, lng });
                }}
              />
              <button type="button" onClick={() => void handleAddPlace()} className="text-sm font-semibold" style={{ color: PRIMARY }}>
                Add place
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="h-14 w-full rounded-2xl text-lg font-semibold disabled:opacity-50"
          style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
        >
          {saving ? 'Saving…' : 'Save contact'}
        </button>

        {!isNew && id ? (
          <>
            <button
              type="button"
              onClick={handleBookForContact}
              className="h-14 w-full rounded-2xl text-lg font-semibold"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
            >
              Book a ride for them
            </button>
            <button
              type="button"
              onClick={() => void contactsDelete(id).then(() => {
                toast.message('Contact removed');
                navigate('/account/contacts/roam');
              })}
              className="w-full py-2 text-sm font-semibold"
              style={{ color: ERROR }}
            >
              Delete contact
            </button>
          </>
        ) : null}
      </main>
    </div>
  );
}
