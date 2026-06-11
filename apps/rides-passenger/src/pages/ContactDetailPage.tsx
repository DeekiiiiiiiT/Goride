import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Shield } from 'lucide-react';
import {
  contactGroupsList,
  contactsCreate,
  contactsDelete,
  contactsGet,
  contactsList,
  contactsUpdate,
  lookupPassengerByPhone,
} from '@/services/contactsEdge';
import { ContactFormFields } from '@/components/contacts/ContactFormFields';
import { ContactGroupPicker } from '@/components/contacts/ContactGroupPicker';
import { SafetyPreferenceToggle } from '@/components/trusted-contacts/SafetyPreferenceToggle';
import { MAX_TRUSTED_CONTACTS } from '@/services/trustedContactsEdge';
import {
  buildGuestPhoneE164,
  formatGuestPhoneDisplay,
  isValidGuestPhone,
  persistGuestRecipientDraft,
} from '@/lib/guestRecipientBooking';
import { createRoamConnectionRequest } from '@/services/roamConnectionsEdge';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import { CONNECTION_INVITE_SENT_COPY, CONNECTION_REQUEST_SENT_COPY } from '@/lib/roamConnectionCopy';
import {
  CARD_SHADOW,
  ERROR,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
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
        if (ROAM_CONNECTIONS) {
          const lookup = await lookupPassengerByPhone(body.phone_e164);
          await createRoamConnectionRequest({
            target_display_name: body.display_name,
            phone_e164: body.phone_e164,
            target_user_id: lookup.profile?.user_id,
            source: 'contacts_page',
          });
          toast.message(
            lookup.found ? CONNECTION_REQUEST_SENT_COPY : CONNECTION_INVITE_SENT_COPY,
          );
          navigate('/account/contacts/pending', { replace: true });
        } else {
          const { contact } = await contactsCreate(body);
          toast.success('Contact saved');
          navigate(`/account/contacts/${contact.id}`, { replace: true });
        }
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
          <ContactFormFields
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            phone={phone}
            onPhoneChange={setPhone}
          />
          <ContactGroupPicker groups={groups} selectedIds={groupIds} onChange={setGroupIds} />
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
            />
          </div>
        </div>

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
