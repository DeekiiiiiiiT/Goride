import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Box, Flag, MapPin, Package } from 'lucide-react';

import {
  CARD_SHADOW,
  ERROR,
  ON_PRIMARY,
  ON_PRIMARY_FIXED,
  ON_PRIMARY_FIXED_VARIANT,
  ON_SECONDARY_CONTAINER,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
  PRIMARY_FIXED_DIM,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const MAP_PREVIEW_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCTQHtpO8lskolVcg4AENYfX9MDvFjmK-bi3cxJKlEo9LkpwfhfYpnWXclBHBPJYoK6ct3JJkDOkQbQACPuwhJPlcqzzgHUCcxrDMsP3jVpZfBIzQJwxDTcIg10w0iJBexXUricikEUf027GcrezCN4AxAW_zIjP5f9LqBbE5cO067KBlaJVT1Oco8JYvXvnTvPiMd7hAAqhyCK4MbrmxwPVxMwrwlSFXsQCgve2NMpGE_p2E3qcqpq_siBR5PE68uxMsSkoMWkGXgl';

const PACKAGE_SIZES = [
  { id: 'small' as const, label: 'Small', weight: 'Up to 5kg', icon: Package },
  { id: 'medium' as const, label: 'Medium', weight: 'Up to 15kg', icon: Box },
  { id: 'large' as const, label: 'Large', weight: 'Up to 30kg', icon: Box },
];

type PackageSize = (typeof PACKAGE_SIZES)[number]['id'];

function PackageSizeCard({
  label,
  weight,
  icon: Icon,
  selected,
  onSelect,
}: {
  label: string;
  weight: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col items-center gap-2 rounded-[24px] p-4 transition-all active:scale-95"
      style={{
        backgroundColor: SURFACE_LOWEST,
        boxShadow: CARD_SHADOW,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: selected ? PRIMARY : 'transparent',
      }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full transition-colors"
        style={{
          backgroundColor: selected ? PRIMARY_CONTAINER : SURFACE_CONTAINER_HIGH,
        }}
      >
        <Icon
          className="h-6 w-6"
          style={{ color: selected ? ON_PRIMARY : ON_SURFACE_VARIANT }}
          aria-hidden
        />
      </div>
      <span
        className="text-xs font-bold tracking-wide"
        style={{ color: selected ? PRIMARY : ON_SURFACE }}
      >
        {label}
      </span>
      <span className="text-[11px] font-semibold" style={{ color: ON_SURFACE_VARIANT }}>
        {weight}
      </span>
    </button>
  );
}

export default function CourierServicePage() {
  const navigate = useNavigate();
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [packageSize, setPackageSize] = useState<PackageSize>('medium');
  const [instructions, setInstructions] = useState('');

  const handleRequest = () => {
    if (!pickup.trim() || !dropoff.trim()) {
      toast.error('Enter pickup and drop-off addresses.');
      return;
    }
    toast.message('Courier requests are coming soon.');
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
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label="Back to services"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="ml-2 text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
          Courier Service
        </h1>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 safe-x">
        <section
          className="rounded-[24px] p-5"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <div className="relative flex flex-col gap-4">
            <div
              className="absolute bottom-9 left-[23px] top-9 w-px"
              style={{ backgroundColor: OUTLINE_VARIANT }}
              aria-hidden
            />
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: PRIMARY_FIXED }}
              >
                <MapPin className="h-6 w-6" style={{ color: ON_PRIMARY_FIXED_VARIANT }} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  className="mb-1 block text-xs font-bold tracking-wide"
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  PICKUP LOCATION
                </label>
                <input
                  type="text"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Enter pickup address"
                  className="w-full rounded-xl border-none px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
                  style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: '#d0e1fb' }}
              >
                <Flag className="h-6 w-6" style={{ color: ON_SECONDARY_CONTAINER }} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  className="mb-1 block text-xs font-bold tracking-wide"
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  DROP-OFF LOCATION
                </label>
                <input
                  type="text"
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                  placeholder="Enter destination"
                  className="w-full rounded-xl border-none px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#004ac6]"
                  style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2
            className="mb-3 px-1 text-xs font-bold tracking-wide"
            style={{ color: ON_SURFACE_VARIANT }}
          >
            PACKAGE SIZE
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {PACKAGE_SIZES.map((size) => (
              <PackageSizeCard
                key={size.id}
                label={size.label}
                weight={size.weight}
                icon={size.icon}
                selected={packageSize === size.id}
                onSelect={() => setPackageSize(size.id)}
              />
            ))}
          </div>
        </section>

        <section className="relative h-40 overflow-hidden rounded-[24px]" style={{ boxShadow: CARD_SHADOW }}>
          <img src={MAP_PREVIEW_URL} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" aria-hidden />
          <div className="absolute bottom-3 left-4">
            <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: ERROR }} />
              <span className="text-[11px] font-semibold" style={{ color: ON_SURFACE }}>
                Drivers nearby: 12
              </span>
            </div>
          </div>
        </section>

        <section>
          <label
            className="mb-3 block px-1 text-xs font-bold tracking-wide"
            style={{ color: ON_SURFACE_VARIANT }}
          >
            SPECIAL INSTRUCTIONS
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Leave at the front desk, gate code 1234..."
            className="h-24 w-full resize-none rounded-[24px] border-none p-4 text-sm outline-none focus:ring-2 focus:ring-[#004ac6]"
            style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE, boxShadow: CARD_SHADOW }}
          />
        </section>

        <section
          className="flex items-center justify-between rounded-[24px] p-5"
          style={{ backgroundColor: PRIMARY_FIXED_DIM, boxShadow: CARD_SHADOW }}
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-wide" style={{ color: ON_PRIMARY_FIXED }}>
              ESTIMATED ARRIVAL
            </span>
            <span className="text-xl font-semibold" style={{ color: ON_PRIMARY_FIXED }}>
              25 - 35 mins
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-xs font-bold tracking-wide" style={{ color: ON_PRIMARY_FIXED }}>
              TOTAL FARE
            </span>
            <span className="text-xl font-semibold" style={{ color: ON_PRIMARY_FIXED }}>
              $18.50
            </span>
          </div>
        </section>

        <button
          type="button"
          onClick={handleRequest}
          className="mb-4 w-full rounded-xl py-4 text-lg font-semibold shadow-lg transition-all active:scale-95"
          style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
        >
          Request Courier
        </button>
      </main>
    </div>
  );
}
