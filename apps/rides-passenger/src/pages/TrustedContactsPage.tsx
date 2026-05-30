import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const PRIMARY = '#004ac6';
const PRIMARY_CONTAINER = '#2563eb';
const ON_SURFACE = '#191c1e';
const ON_SURFACE_VARIANT = '#434655';
const ON_PRIMARY_CONTAINER = '#eeefff';
const ON_SECONDARY_FIXED = '#0b1c30';
const SURFACE_LOWEST = '#ffffff';
const SURFACE_LOW = '#f2f4f6';
const SURFACE_CONTAINER = '#eceef0';
const SURFACE_CONTAINER_HIGH = '#e6e8ea';
const SURFACE_CONTAINER_HIGHEST = '#e0e3e5';
const SECONDARY = '#505f76';
const SECONDARY_CONTAINER = '#d0e1fb';
const SECONDARY_FIXED = '#d3e4fe';
const OUTLINE = '#737686';
const OUTLINE_VARIANT = '#c3c6d7';
const ERROR = '#ba1a1a';
const PAGE_BG = '#f7f9fb';
const CARD_SHADOW = '0px 4px 20px rgba(0, 0, 0, 0.05)';
const MAX_CONTACTS = 5;

const SARAH_AVATAR_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB7nCNJC75ul4rqwV8rkRVBA6LpUkrnQL2OfI3Tcvok-agAUfSwc0p2lHR0IaPWyn3dfbVZsdFO05SjIw2-ChqKSEiwHml4u8RaQfIgiyt5SoFThn-fCdeIUuMkHG14L3gfjyqc_chgkRk3EextaoOOO7Y4_oARPDhVpOJugR8LrZ4ygqXZJs_adw_VxtlvTSd_VtxpOebnqLGnUoJkAXTAEIokps9F0pd6OdUqKYWYxupD1Gx-HubUH6Cph8rBDDPNLOoUemdYF3aD';

type TrustedContact = {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  initials?: string;
  online?: boolean;
};

const INITIAL_CONTACTS: TrustedContact[] = [
  {
    id: 'sarah',
    name: 'Sarah Jenkins',
    phone: '+1 (555) 012-3456',
    avatarUrl: SARAH_AVATAR_URL,
    online: true,
  },
  {
    id: 'marcus',
    name: 'Marcus Johnson',
    phone: '+1 (555) 987-6543',
    initials: 'MJ',
  },
];

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
  const [shareAllTrips, setShareAllTrips] = useState(true);
  const [nightTripsOnly, setNightTripsOnly] = useState(false);
  const [contacts, setContacts] = useState<TrustedContact[]>(INITIAL_CONTACTS);

  const contactCountLabel = useMemo(
    () => `${contacts.length} of ${MAX_CONTACTS}`,
    [contacts.length],
  );

  const removeContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    toast.message('Contact removed');
  };

  const addContact = () => {
    if (contacts.length >= MAX_CONTACTS) {
      toast.error(`You can add up to ${MAX_CONTACTS} trusted contacts.`);
      return;
    }
    toast.message('Coming soon');
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
          className="rounded-full p-2 transition-colors active:scale-95 hover:bg-[#f2f4f6]"
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
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="group flex items-center justify-between rounded-[24px] p-4 transition-colors duration-300 hover:bg-[#f2f4f6]"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              >
                <div className="flex min-w-0 items-center gap-4">
                  {contact.avatarUrl ? (
                    <div className="relative shrink-0">
                      <img
                        src={contact.avatarUrl}
                        alt=""
                        className="h-14 w-14 rounded-full object-cover"
                      />
                      {contact.online ? (
                        <span
                          className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white bg-green-500"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold"
                      style={{ backgroundColor: SECONDARY_FIXED, color: ON_SECONDARY_FIXED }}
                    >
                      {contact.initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold" style={{ color: ON_SURFACE }}>
                      {contact.name}
                    </p>
                    <p className="text-sm tracking-wide" style={{ color: SECONDARY }}>
                      {contact.phone}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(contact.id)}
                  className="rounded-full p-2 transition-colors active:scale-90 hover:text-[#ba1a1a]"
                  style={{ color: OUTLINE }}
                  aria-label={`Remove ${contact.name}`}
                >
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addContact}
              className="group flex w-full flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed py-8 transition-all active:scale-[0.98] hover:border-[#004ac6] hover:bg-[#004ac6]/5"
              style={{ borderColor: OUTLINE_VARIANT }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors group-hover:bg-[#004ac6] group-hover:text-white"
                style={{ backgroundColor: SURFACE_CONTAINER_HIGHEST, color: SECONDARY }}
              >
                <UserPlus className="h-5 w-5" aria-hidden />
              </div>
              <span
                className="font-semibold transition-colors group-hover:text-[#004ac6]"
                style={{ color: SECONDARY }}
              >
                Add New Contact
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
            Contacts will receive an SMS with a link to your live trip map whenever you start a ride.
            No app download is required for them to track your progress.
          </p>
        </section>
      </main>
    </div>
  );
}
