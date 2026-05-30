import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronRight,
  CreditCard,
  MoreVertical,
  Pencil,
  PlusCircle,
  Receipt,
  RefreshCw,
  Shield,
  Smartphone,
  Star,
  Trash2,
} from 'lucide-react';
import {
  CARD_SHADOW,
  ON_PRIMARY_CONTAINER,
  ON_SECONDARY_CONTAINER,
  ON_SURFACE,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY,
  SECONDARY_CONTAINER,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOWEST,
  TOGGLE_OFF,
} from '@/lib/passengerTheme';

function SectionLabel({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between">
      <h3
        className="text-xs font-bold uppercase tracking-widest"
        style={{ color: SECONDARY }}
      >
        {children}
      </h3>
      {trailing}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ backgroundColor: checked ? PRIMARY : TOGGLE_OFF }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
        style={{ left: checked ? 'calc(100% - 1.25rem - 2px)' : '2px' }}
      />
    </button>
  );
}

export default function ManagePaymentMethodsPage() {
  const navigate = useNavigate();
  const [autoRefill, setAutoRefill] = useState(true);

  const notifySoon = () => {
    toast.message('Coming soon');
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center px-5 shadow-sm safe-t"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="flex w-full items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/account/wallet')}
            className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
            style={{ color: PRIMARY }}
            aria-label="Back to wallet"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
            Payment Methods
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-8 px-5 py-6 safe-x">
        <section>
          <h2 className="text-[30px] font-bold leading-tight tracking-tight" style={{ color: ON_SURFACE }}>
            Manage Payment Methods
          </h2>
          <p className="mt-1 text-sm" style={{ color: SECONDARY }}>
            Control your primary and backup payment sources for seamless rides.
          </p>
        </section>

        <section className="space-y-4">
          <SectionLabel
            trailing={
              <span className="text-sm font-semibold" style={{ color: PRIMARY }}>
                2 Active
              </span>
            }
          >
            Saved methods
          </SectionLabel>

          <div className="space-y-3">
            <div
              className="flex items-center justify-between rounded-xl border p-6 transition-colors passenger-row-hover"
              style={{
                backgroundColor: SURFACE_LOWEST,
                borderColor: 'color-mix(in srgb, var(--passenger-outline-variant) 30%, transparent)',
                boxShadow: CARD_SHADOW,
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg"
                  style={{ backgroundColor: ON_SURFACE }}
                >
                  <Smartphone className="h-6 w-6 text-white" aria-hidden />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Apple Pay</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter"
                      style={{
                        backgroundColor: PRIMARY_CONTAINER,
                        color: ON_PRIMARY_CONTAINER,
                      }}
                    >
                      Default
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: SECONDARY }}>
                    Linked to Wallet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={notifySoon}
                className="rounded-full p-2 transition-colors passenger-row-hover"
                style={{ color: SECONDARY }}
                aria-label="More options for Apple Pay"
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div
              className="flex items-center justify-between rounded-xl border p-6 transition-colors passenger-row-hover"
              style={{
                backgroundColor: SURFACE_LOWEST,
                borderColor: 'color-mix(in srgb, var(--passenger-outline-variant) 30%, transparent)',
                boxShadow: CARD_SHADOW,
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg"
                  style={{ backgroundColor: SURFACE_CONTAINER_HIGH }}
                >
                  <CreditCard className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
                </div>
                <div>
                  <p className="font-semibold">Visa ending in 1212</p>
                  <p className="text-sm" style={{ color: SECONDARY }}>
                    Expires 12/26
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={notifySoon}
                  className="rounded-full p-2 transition-colors passenger-row-hover"
                  style={{ color: SECONDARY }}
                  aria-label="Remove Visa card"
                >
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={notifySoon}
                  className="rounded-full p-2 transition-colors passenger-row-hover"
                  style={{ color: SECONDARY }}
                  aria-label="Edit Visa card"
                >
                  <Pencil className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={notifySoon}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 font-semibold transition-all active:scale-[0.98] passenger-row-hover"
              style={{
                borderColor: OUTLINE_VARIANT,
                color: PRIMARY,
              }}
            >
              <PlusCircle className="h-5 w-5" aria-hidden />
              <span>Add Payment Method</span>
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <SectionLabel>Preferences</SectionLabel>
          <div
            className="overflow-hidden rounded-xl border divide-y"
            style={{
              backgroundColor: SURFACE_LOWEST,
              borderColor: 'color-mix(in srgb, var(--passenger-outline-variant) 30%, transparent)',
              boxShadow: CARD_SHADOW,
              divideColor: 'color-mix(in srgb, var(--passenger-outline-variant) 20%, transparent)',
            }}
          >
            <button
              type="button"
              onClick={notifySoon}
              className="flex w-full items-center justify-between p-6 text-left transition-colors passenger-row-hover"
            >
              <div className="flex items-center gap-4">
                <Star className="h-6 w-6" style={{ color: SECONDARY }} aria-hidden />
                <span className="font-medium">Set default payment method</span>
              </div>
              <ChevronRight className="h-5 w-5" style={{ color: OUTLINE_VARIANT }} aria-hidden />
            </button>

            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <RefreshCw className="h-6 w-6 shrink-0" style={{ color: SECONDARY }} aria-hidden />
                <div>
                  <p className="font-medium">Auto-refill Roam Credits</p>
                  <p className="text-sm" style={{ color: SECONDARY }}>
                    Refill when below $10.00
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={autoRefill}
                onChange={setAutoRefill}
                ariaLabel="Auto-refill Roam Credits"
              />
            </div>

            <button
              type="button"
              onClick={notifySoon}
              className="flex w-full items-center justify-between p-6 text-left transition-colors passenger-row-hover"
            >
              <div className="flex items-center gap-4">
                <Receipt className="h-6 w-6" style={{ color: SECONDARY }} aria-hidden />
                <span className="font-medium">Payment history & invoices</span>
              </div>
              <ChevronRight className="h-5 w-5" style={{ color: OUTLINE_VARIANT }} aria-hidden />
            </button>
          </div>
        </section>

        <section
          className="flex gap-3 rounded-xl border p-4"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--passenger-secondary-container) 20%, transparent)',
            borderColor: 'color-mix(in srgb, var(--passenger-secondary-container) 40%, transparent)',
          }}
        >
          <Shield
            className="h-6 w-6 shrink-0"
            style={{ color: ON_SECONDARY_CONTAINER }}
            aria-hidden
          />
          <p className="text-sm leading-relaxed" style={{ color: ON_SECONDARY_CONTAINER }}>
            Roam uses industry-standard encryption to protect your financial information. Your full
            card details are never stored on your device.
          </p>
        </section>
      </main>
    </div>
  );
}
