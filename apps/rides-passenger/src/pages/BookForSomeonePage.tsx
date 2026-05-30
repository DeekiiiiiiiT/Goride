import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Contact,
  UserRound,
  Users,
} from 'lucide-react';

const PRIMARY = '#004ac6';
const PRIMARY_CONTAINER = '#2563eb';
const ON_SURFACE = '#191c1e';
const ON_SURFACE_VARIANT = '#434655';
const ON_PRIMARY = '#ffffff';
const SURFACE_LOWEST = '#ffffff';
const SURFACE_LOW = '#f2f4f6';
const SECONDARY = '#505f76';
const SECONDARY_CONTAINER = '#d0e1fb';
const PAGE_BG = '#f7f9fb';
const CARD_SHADOW = '0px 4px 20px rgba(0, 0, 0, 0.05)';

const LUXURY_IMAGE_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAzxB2Pf1UL6snmlfDl2E3bB5f5MOK6g0nP0yMKKhRiZ_sLBf52PLrFy_6MEg6hAngXTWZpY3xNx2J-OyvaN3kfQBfzbTaqrsFEpbv7UnZrl3VWehIu5DFwix93ZUTwMk114n5qDWAK6GadraBs9YRU9yl2seDoV2dlWGQxYoPYay3WDk0CWLT3PItyaoUA5g89thmN4ZG-gCg-MXP5KIaK63RlabKxhHSwfR8hFgCbBMWiNpkOIk9i2YaFJ4AxRj0JHCQ8zqFTQt9y';

const BOOKING_PURPOSES = [
  {
    id: 'guest' as const,
    title: 'Guest',
    description: 'Private travel',
    icon: UserRound,
  },
  {
    id: 'family' as const,
    title: 'Family',
    description: 'Loved ones',
    icon: Users,
  },
  {
    id: 'business' as const,
    title: 'Business',
    description: 'Client/Staff',
    icon: Briefcase,
  },
];

type BookingPurpose = (typeof BOOKING_PURPOSES)[number]['id'];

function PurposeOption({
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex w-full items-center gap-4 rounded-[24px] p-5 text-left transition-all active:scale-[0.99] sm:flex-col sm:items-start"
      style={{
        backgroundColor: SURFACE_LOWEST,
        boxShadow: CARD_SHADOW,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: selected ? PRIMARY : 'transparent',
      }}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
        style={{ backgroundColor: SECONDARY_CONTAINER }}
      >
        <Icon className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
      </div>
      <div>
        <p className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
          {title}
        </p>
        <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          {description}
        </p>
      </div>
      <CheckCircle2
        className={`absolute right-4 top-4 h-6 w-6 transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`}
        style={{ color: PRIMARY }}
        fill={selected ? PRIMARY : 'none'}
        stroke={selected ? ON_PRIMARY : PRIMARY}
        aria-hidden
      />
    </button>
  );
}

export default function BookForSomeonePage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState<BookingPurpose>('family');

  const handleContinue = () => {
    if (!fullName.trim() || !phone.trim()) {
      toast.error('Enter the recipient’s name and phone number.');
      return;
    }
    toast.message('Booking for someone else is coming soon.');
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header className="sticky top-0 z-50 flex h-16 w-full items-center bg-[#f7f9fb] px-4 safe-t">
        <button
          type="button"
          onClick={() => navigate('/services')}
          className="rounded-full p-2 transition-colors active:scale-95 hover:bg-[#f2f4f6]"
          style={{ color: PRIMARY }}
          aria-label="Back to services"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="ml-2 text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
          Book for Someone Else
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-4 safe-x">
        <section className="space-y-2">
          <h2 className="text-[30px] font-bold leading-tight tracking-tight" style={{ color: ON_SURFACE }}>
            Recipient Details
          </h2>
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            They will receive ride details via SMS for a seamless premium experience.
          </p>
        </section>

        <div className="space-y-4">
          <div
            className="space-y-6 rounded-[24px] p-5"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <div className="flex items-center justify-between pb-4">
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: SECONDARY }}
              >
                Passenger Information
              </span>
              <button
                type="button"
                onClick={() => toast.message('Coming soon')}
                className="flex items-center gap-1 text-xs font-bold tracking-wide transition-opacity hover:opacity-80"
                style={{ color: PRIMARY }}
              >
                <Contact className="h-[18px] w-[18px]" aria-hidden />
                Contacts
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  className="mb-2 block text-xs font-bold tracking-wide"
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  FULL NAME
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alexander Sterling"
                  className="h-14 w-full rounded-xl border-none px-4 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
                  style={{
                    backgroundColor: SURFACE_LOW,
                    color: ON_SURFACE,
                  }}
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-bold tracking-wide"
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  PHONE NUMBER
                </label>
                <div className="flex gap-2">
                  <div
                    className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl text-base"
                    style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
                  >
                    +1
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className="h-14 min-w-0 flex-1 rounded-xl border-none px-4 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
                    style={{
                      backgroundColor: SURFACE_LOW,
                      color: ON_SURFACE,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="px-1 text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
              Why are you booking?
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {BOOKING_PURPOSES.map((option) => (
                <PurposeOption
                  key={option.id}
                  title={option.title}
                  description={option.description}
                  icon={option.icon}
                  selected={purpose === option.id}
                  onSelect={() => setPurpose(option.id)}
                />
              ))}
            </div>
          </div>

          <div
            className="relative h-40 w-full overflow-hidden rounded-[24px]"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <img src={LUXURY_IMAGE_URL} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-6">
              <p className="text-xl font-semibold text-white">
                Luxury standard for every guest.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button
            type="button"
            onClick={handleContinue}
            className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold shadow-lg transition-transform active:scale-[0.98]"
            style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
          >
            Continue to Booking
            <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
          <p className="mt-4 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Recipient will receive a secure tracking link.
          </p>
        </div>
      </main>
    </div>
  );
}
