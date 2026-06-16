import React from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  BOOKABLE_PAYMENT_METHODS,
  type TripPaymentMethodId,
  type TripPaymentMethodOption,
} from '@/lib/tripPaymentMethods';
import { TripPaymentMethodIcon } from '@/components/TripPaymentMethodIcon';
import {
  CARD_SHADOW,
  ON_PRIMARY_CONTAINER,
  ON_SURFACE,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  selectedId: TripPaymentMethodId;
  onSelect: (id: TripPaymentMethodId) => void;
  /** Compact rows for wallet home; full cards on manage page. */
  variant?: 'wallet' | 'manage';
};

function MethodCard({
  method,
  selected,
  onSelect,
  variant,
}: {
  method: TripPaymentMethodOption;
  selected: boolean;
  onSelect: () => void;
  variant: 'wallet' | 'manage';
}) {
  const handleClick = () => {
    onSelect();
    if (method.isDemo) {
      toast.message('Demo payment method', {
        description: 'Card and Apple Pay are placeholders. Cash is used for live trips.',
      });
    } else {
      toast.success(`${method.barLabel} is now your default for new trips`);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full items-center justify-between text-left transition-colors passenger-row-hover ${
        variant === 'wallet' ? 'rounded-[24px] p-4' : 'rounded-xl border p-6'
      }`}
      style={{
        backgroundColor: SURFACE_LOWEST,
        boxShadow: CARD_SHADOW,
        borderColor: selected
          ? 'color-mix(in srgb, var(--passenger-primary) 35%, transparent)'
          : 'color-mix(in srgb, var(--passenger-outline-variant) 30%, transparent)',
        borderWidth: variant === 'manage' || selected ? 1 : 0,
      }}
    >
      <div className="flex items-center gap-4">
        <TripPaymentMethodIcon icon={method.icon} className="h-12 w-12 rounded-xl" />
        <div>
          <div className="flex items-center gap-2">
            <p className="font-bold" style={{ color: ON_SURFACE }}>
              {method.barLabel}
            </p>
            {selected ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter"
                style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY_CONTAINER }}
              >
                Default
              </span>
            ) : null}
            {method.isDemo ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter"
                style={{ color: SECONDARY }}
              >
                Demo
              </span>
            ) : null}
          </div>
          {method.subtitle ? (
            <p className="text-sm" style={{ color: SECONDARY }}>
              {method.subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {selected ? (
        <Check className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} aria-hidden />
      ) : null}
    </button>
  );
}

export function WalletPaymentMethodsList({
  selectedId,
  onSelect,
  variant = 'wallet',
}: Props) {
  return (
    <div className={variant === 'wallet' ? 'space-y-2' : 'space-y-3'}>
      {BOOKABLE_PAYMENT_METHODS.map((method) => (
        <MethodCard
          key={method.id}
          method={method}
          selected={method.id === selectedId}
          onSelect={() => onSelect(method.id)}
          variant={variant}
        />
      ))}
    </div>
  );
}
