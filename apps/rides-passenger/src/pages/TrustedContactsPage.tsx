import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Info, Moon, RefreshCw, ShieldHalf } from 'lucide-react';
import type { SafetySharingPreference } from '@roam/types/passengerProfile';
import { contactsUpdate } from '@/services/contactsEdge';
import { getMyPassengerProfile } from '@/services/passengerProfileEdge';
import { MAX_TRUSTED_CONTACTS, updateSafetySharing } from '@/services/trustedContactsEdge';
import { SafetyPreferenceToggle } from '@/components/trusted-contacts/SafetyPreferenceToggle';
import { TrustedContactListItem } from '@/components/trusted-contacts/TrustedContactListItem';
import { TrustedContactsEmptyState } from '@/components/trusted-contacts/TrustedContactsEmptyState';
import { TrustedContactsFab } from '@/components/trusted-contacts/TrustedContactsFab';
import { TestShareSheet } from '@/components/trusted-contacts/TestShareSheet';
import { contactsList } from '@/services/contactsEdge';
import {
  CARD_SHADOW,
  ON_PRIMARY_CONTAINER,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY,
  SURFACE_CONTAINER,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

export default function TrustedContactsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [testShareOpen, setTestShareOpen] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  const { data: profileData } = useQuery({
    queryKey: ['passenger-profile'],
    queryFn: getMyPassengerProfile,
  });

  const sharing = profileData?.profile.safety_sharing;
  const shareAllTrips = sharing?.default_sharing_preference === 'all';
  const nightTripsOnly = sharing?.default_sharing_preference === 'night';

  const { data, isLoading } = useQuery({
    queryKey: ['trusted-contacts'],
    queryFn: () => contactsList({ trusted_for_safety: true }),
  });

  const contacts = data?.contacts ?? [];

  const contactCountLabel = useMemo(
    () => `${contacts.length} of ${MAX_TRUSTED_CONTACTS}`,
    [contacts.length],
  );

  const setSharingPreference = async (pref: SafetySharingPreference) => {
    setSavingPref(true);
    try {
      await updateSafetySharing({ default_sharing_preference: pref });
      await queryClient.invalidateQueries({ queryKey: ['passenger-profile'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save preference');
    } finally {
      setSavingPref(false);
    }
  };

  const handleShareAllChange = (checked: boolean) => {
    if (checked) void setSharingPreference('all');
    else if (nightTripsOnly) void setSharingPreference('night');
    else void setSharingPreference('manual');
  };

  const handleNightOnlyChange = (checked: boolean) => {
    if (checked) void setSharingPreference('night');
    else if (shareAllTrips) void setSharingPreference('all');
    else void setSharingPreference('manual');
  };

  const removeContact = async (contactId: string, name: string) => {
    setRemovingId(contactId);
    try {
      await contactsUpdate(contactId, { trusted_for_safety: false });
      await queryClient.invalidateQueries({ queryKey: ['trusted-contacts'] });
      toast.message(`${name} removed from trusted contacts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update contact');
    } finally {
      setRemovingId(null);
    }
  };

  const goAdd = () => {
    if (contacts.length >= MAX_TRUSTED_CONTACTS) {
      toast.error(`You can add up to ${MAX_TRUSTED_CONTACTS} trusted contacts.`);
      return;
    }
    navigate('/account/contacts/trusted/add');
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center gap-4 px-5 shadow-sm safe-t"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <button
          type="button"
          onClick={() => navigate('/account/contacts')}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label="Back to contacts"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
          Trusted Contacts
        </h1>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-5 py-6 safe-x">
        <section>
          <div
            className="relative overflow-hidden rounded-[24px] p-6"
            style={{
              background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_CONTAINER} 100%)`,
              color: ON_PRIMARY_CONTAINER,
              boxShadow: CARD_SHADOW,
            }}
          >
            <div className="relative z-10">
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-white">Travel with Confidence</h2>
              <p className="max-w-md text-base text-white/90">
                Share your real-time trip status with the people you trust. They&apos;ll know your
                driver, vehicle, and ETA.
              </p>
            </div>
            <ShieldHalf
              className="absolute -bottom-4 -right-4 h-[120px] w-[120px] rotate-12 text-white opacity-10"
              aria-hidden
            />
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="px-2 text-xs font-bold uppercase tracking-widest" style={{ color: SECONDARY }}>
            Sharing Preferences
          </h3>
          <div
            className="overflow-hidden rounded-[24px] border border-[rgba(0,74,198,0.08)]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <SafetyPreferenceToggle
              checked={shareAllTrips}
              onChange={handleShareAllChange}
              disabled={savingPref}
              icon={<RefreshCw className="h-6 w-6" aria-hidden />}
              iconBg="rgba(0, 74, 198, 0.1)"
              iconColor={PRIMARY}
              title="Share all trips"
              description="Automatically alert contacts on every ride"
            />
            <div className="mx-5 h-px bg-black/[0.06]" />
            <SafetyPreferenceToggle
              checked={nightTripsOnly}
              onChange={handleNightOnlyChange}
              disabled={savingPref || shareAllTrips}
              icon={<Moon className="h-6 w-6" aria-hidden />}
              iconBg="rgba(208, 225, 251, 0.5)"
              iconColor={SECONDARY}
              title="Night trips only"
              description="Only share rides between 9 PM and 6 AM"
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: SECONDARY }}>
              Current Contacts
            </h3>
            <span
              className="rounded-full px-3 py-1 text-[11px] font-bold"
              style={{ backgroundColor: SURFACE_CONTAINER_HIGH, color: ON_SURFACE_VARIANT }}
            >
              {contactCountLabel}
            </span>
          </div>

          {isLoading ? (
            <p className="px-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Loading contacts…
            </p>
          ) : null}

          {!isLoading && contacts.length === 0 ? (
            <TrustedContactsEmptyState onAdd={goAdd} />
          ) : null}

          {!isLoading && contacts.length > 0 ? (
            <div
              className="space-y-0 overflow-hidden rounded-[24px] border border-[rgba(0,74,198,0.08)]"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              {contacts.map((contact, index) => (
                <React.Fragment key={contact.id}>
                  {index > 0 ? <div className="mx-5 h-px bg-black/[0.06]" /> : null}
                  <TrustedContactListItem
                    contact={contact}
                    onOpen={() => navigate(`/account/contacts/${contact.id}`)}
                    onRemove={() => void removeContact(contact.id, contact.display_name)}
                    removing={removingId === contact.id}
                  />
                </React.Fragment>
              ))}
            </div>
          ) : null}

          {contacts.length > 0 ? (
            <button
              type="button"
              onClick={() => setTestShareOpen(true)}
              className="w-full rounded-2xl border py-3 text-sm font-semibold transition-colors active:scale-[0.98]"
              style={{ borderColor: 'rgba(0,74,198,0.2)', color: PRIMARY }}
            >
              Test Share
            </button>
          ) : null}
        </section>

        <section
          className="flex gap-4 rounded-[24px] p-6"
          style={{ backgroundColor: SURFACE_CONTAINER }}
        >
          <Info className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} aria-hidden />
          <p className="text-sm leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
            Trusted contacts receive SMS links to view trip status. They don&apos;t need the Roam app.
          </p>
        </section>
      </main>

      <TrustedContactsFab onClick={goAdd} hidden={contacts.length === 0} />

      <TestShareSheet
        open={testShareOpen}
        onClose={() => setTestShareOpen(false)}
        contacts={contacts}
        onSuccess={() => toast.success('Test alert sent. Your contacts will receive messages like this during rides.')}
      />
    </div>
  );
}
