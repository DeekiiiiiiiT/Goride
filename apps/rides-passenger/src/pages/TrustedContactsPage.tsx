import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Info,
  Moon,
  RefreshCw,
  ShieldHalf,
  Trash2,
  UserPlus,
} from 'lucide-react';

import type { RiderContactRow } from '@roam/types/riderContacts';
import { contactsList, contactsUpdate } from '@/services/contactsEdge';
import {
  CARD_SHADOW,
  ON_PRIMARY_CONTAINER,
  ON_SECONDARY_FIXED,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY,
  SECONDARY_FIXED,
  SURFACE_CONTAINER,
  SURFACE_CONTAINER_HIGH,
  SURFACE_CONTAINER_HIGHEST,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const MAX_CONTACTS = 5;

function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function PreferenceToggle({
  checked,
  onChange,
  icon,
  iconBg,
  iconColor,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <div
      className="flex items-center justify-between p-6 transition-colors"
      style={{ backgroundColor: checked ? 'rgba(0, 74, 198, 0.02)' : 'transparent' }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: ON_SURFACE }}>
            {title}
          </p>
          <p className="text-sm" style={{ color: SECONDARY }}>
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
        style={{
          backgroundColor: checked ? PRIMARY : SURFACE_CONTAINER_HIGHEST,
        }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
          style={{
            left: checked ? 'calc(100% - 1.25rem - 4px)' : '4px',
          }}
        />
      </button>
    </div>
  );
}

export default function TrustedContactsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [shareAllTrips, setShareAllTrips] = useState(true);
  const [nightTripsOnly, setNightTripsOnly] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['trusted-contacts'],
    queryFn: () => contactsList({ trusted_for_safety: true }),
  });

  const contacts = data?.contacts ?? [];

  const contactCountLabel = useMemo(
    () => `${contacts.length} of ${MAX_CONTACTS}`,
    [contacts.length],
  );

  const removeContact = async (contact: RiderContactRow) => {
    setRemovingId(contact.id);
    try {
      await contactsUpdate(contact.id, { trusted_for_safety: false });
      await queryClient.invalidateQueries({ queryKey: ['trusted-contacts'] });
      toast.message(`${contact.display_name} removed from trusted contacts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update contact');
    } finally {
      setRemovingId(null);
    }
  };

  const addContact = () => {
    if (contacts.length >= MAX_CONTACTS) {
      toast.error(`You can add up to ${MAX_CONTACTS} trusted contacts.`);
      return;
    }
    navigate('/account/contacts');
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
          onClick={() => navigate('/account')}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label="Back to account"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
          Trusted Contacts
        </h1>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-5 py-6 safe-x">
        <section>
          <div
            className="relative overflow-hidden rounded-[24px] p-6"
            style={{
              backgroundColor: PRIMARY_CONTAINER,
              color: ON_PRIMARY_CONTAINER,
              boxShadow: CARD_SHADOW,
            }}
          >
            <div className="relative z-10">
              <h2 className="mb-2 text-xl font-semibold tracking-tight">Travel with Confidence</h2>
              <p className="max-w-md text-base opacity-90">
                Share your real-time trip status with the people you trust. They&apos;ll know your
                driver, vehicle, and ETA.
              </p>
            </div>
            <ShieldHalf
              className="absolute -bottom-4 -right-4 h-[120px] w-[120px] rotate-12 opacity-10"
              aria-hidden
            />
          </div>
        </section>

        <section className="space-y-4">
          <h3
            className="px-2 text-xs font-bold uppercase tracking-widest"
            style={{ color: SECONDARY }}
          >
            Sharing Preferences
          </h3>
          <div
            className="overflow-hidden rounded-[24px]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <PreferenceToggle
              checked={shareAllTrips}
              onChange={setShareAllTrips}
              icon={<RefreshCw className="h-6 w-6" aria-hidden />}
              iconBg="rgba(0, 74, 198, 0.1)"
              iconColor={PRIMARY}
              title="Share all trips"
              description="Automatically alert contacts on every ride"
            />
            <PreferenceToggle
              checked={nightTripsOnly}
              onChange={setNightTripsOnly}
              icon={<Moon className="h-6 w-6" aria-hidden />}
              iconBg="rgba(208, 225, 251, 0.3)"
              iconColor={SECONDARY}
              title="Night trips only"
              description="Only share rides between 9 PM and 6 AM"
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: SECONDARY }}
            >
              Current Contacts
            </h3>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: SURFACE_CONTAINER_HIGH, color: ON_SURFACE_VARIANT }}
            >
              {contactCountLabel}
            </span>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <p className="px-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Loading contacts…
              </p>
            ) : null}

            {!isLoading && contacts.length === 0 ? (
              <p className="px-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                No trusted contacts yet. Add someone from Roam Contacts and mark them as trusted for
                safety.
              </p>
            ) : null}

            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="group flex items-center justify-between rounded-[24px] p-4 transition-colors duration-300 passenger-row-hover"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/account/contacts/${contact.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                >
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold"
                    style={{ backgroundColor: SECONDARY_FIXED, color: ON_SECONDARY_FIXED }}
                  >
                    {contactInitials(contact.display_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold" style={{ color: ON_SURFACE }}>
                      {contact.display_name}
                    </p>
                    <p className="text-sm tracking-wide" style={{ color: SECONDARY }}>
                      {contact.phone_e164}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void removeContact(contact)}
                  disabled={removingId === contact.id}
                  className="rounded-full p-2 transition-colors active:scale-90 hover:text-[#ba1a1a] disabled:opacity-50"
                  style={{ color: OUTLINE }}
                  aria-label={`Remove ${contact.display_name}`}
                >
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addContact}
              className="group flex w-full flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed py-8 transition-all active:scale-[0.98] hover:border-[var(--passenger-primary)] hover:bg-[var(--passenger-highlight)]"
              style={{ borderColor: OUTLINE_VARIANT }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors group-hover:bg-[var(--passenger-primary)] group-hover:text-white"
                style={{ backgroundColor: SURFACE_CONTAINER_HIGHEST, color: SECONDARY }}
              >
                <UserPlus className="h-5 w-5" aria-hidden />
              </div>
              <span
                className="font-semibold transition-colors group-hover:text-[#004ac6]"
                style={{ color: SECONDARY }}
              >
                Add from Roam Contacts
              </span>
            </button>
          </div>
        </section>

        <section
          className="flex gap-4 rounded-[24px] p-6"
          style={{ backgroundColor: SURFACE_CONTAINER }}
        >
          <Info className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} aria-hidden />
          <p className="text-sm italic leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
            Trusted contacts are managed in Roam Contacts. Mark someone as trusted for safety on
            their contact page to share live trip updates with them.
          </p>
        </section>
      </main>
    </div>
  );
}
