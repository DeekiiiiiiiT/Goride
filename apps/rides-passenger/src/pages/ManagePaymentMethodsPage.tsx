import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronRight,
  PlusCircle,
  Receipt,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { WalletPaymentMethodsList } from '@/components/wallet/WalletPaymentMethodsList';
import { useDefaultPaymentMethod } from '@/hooks/useDefaultPaymentMethod';
import { listTripPaymentMethods } from '@/lib/savedPaymentMethods';
import {
  CARD_SHADOW,
  ON_SECONDARY_CONTAINER,
  ON_SURFACE,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SECONDARY,
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
  const { selectedId, select } = useDefaultPaymentMethod();
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
                {listTripPaymentMethods().length} methods
              </span>
            }
          >
            Saved methods
          </SectionLabel>

          <p className="text-sm" style={{ color: SECONDARY }}>
            Tap a method to set your default for new trips. Card and Apple Pay are demo only; cash
            trips use the live settlement flow.
          </p>

          <WalletPaymentMethodsList selectedId={selectedId} onSelect={select} variant="manage" />

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
            <span>Add card (coming soon)</span>
          </button>
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
