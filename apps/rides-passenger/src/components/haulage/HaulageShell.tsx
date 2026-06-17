import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOW,
} from '@/lib/passengerTheme';

type Props = {
  onBack: () => void;
  stepIndex: number;
  stepCount: number;
};

export function HaulageSubheader({ onBack, stepIndex, stepCount }: Props) {
  const { t } = useTranslation('haulage');

  return (
    <header
      className="sticky top-0 z-10 border-b safe-t"
      style={{
        backgroundColor: PAGE_BG,
        borderColor: OUTLINE_VARIANT,
      }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95 touch-manipulation"
            style={{ color: PRIMARY }}
            aria-label={t('backAria')}
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="truncate text-lg font-semibold" style={{ color: PRIMARY }}>
            {t('title')}
          </h1>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE_VARIANT }}
        >
          {t('stepOf', { current: stepIndex + 1, total: stepCount })}
        </span>
      </div>
    </header>
  );
}

export function HaulageStepper({ stepIndex, stepCount }: { stepIndex: number; stepCount: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6" aria-hidden>
      {Array.from({ length: stepCount }, (_, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <div className="h-0.5 w-6" style={{ backgroundColor: OUTLINE_VARIANT }} />
          ) : null}
          <div
            className={
              i <= stepIndex ? 'haulage-stepper-dot' : 'haulage-stepper-dot haulage-stepper-dot--inactive'
            }
          />
        </React.Fragment>
      ))}
    </div>
  );
}

export function HaulagePrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`haulage-primary-btn flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold touch-manipulation ${className}`}
      style={{ color: ON_SURFACE }}
    >
      {children}
    </button>
  );
}

export function HaulageTactileCard({
  children,
  onClick,
  className = '',
  active = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`haulage-tactile-card w-full rounded-xl text-left touch-manipulation ${active ? 'ring-2 ring-[var(--passenger-primary,#006c49)]' : ''} ${className}`}
      style={active ? { borderColor: PRIMARY } : undefined}
    >
      {children}
    </Tag>
  );
}
