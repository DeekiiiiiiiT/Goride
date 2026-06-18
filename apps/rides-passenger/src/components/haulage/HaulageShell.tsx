import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
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
      className="sticky top-0 z-50 border-b bg-[color:var(--passenger-page-bg,#f7f9fb)]/90 shadow-sm backdrop-blur-md safe-t"
      style={{ borderColor: OUTLINE_VARIANT }}
    >
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95 touch-manipulation"
            style={{ color: PRIMARY }}
            aria-label={t('backAria')}
          >
            <span className="material-symbols-outlined" aria-hidden>
              arrow_back
            </span>
          </button>
          <h1 className="text-xl font-semibold" style={{ color: PRIMARY }}>
            {t('title')}
          </h1>
        </div>
        <span className="text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
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

export function HaulageStickyFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-40 border-t px-4 py-4 safe-x"
      style={{
        backgroundColor: PAGE_BG,
        borderColor: OUTLINE_VARIANT,
        boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div className="mx-auto max-w-2xl">{children}</div>
    </footer>
  );
}

export const HAULAGE_FOOTER_CLEARANCE = 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]';

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
      className={`haulage-primary-btn flex w-full items-center justify-center gap-3 rounded-xl px-8 py-4 text-base font-semibold touch-manipulation ${className}`}
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
      className={`haulage-tactile-card w-full rounded-xl text-left touch-manipulation ${active ? 'ring-2' : ''} ${className}`}
      style={active ? { borderColor: PRIMARY } : undefined}
    >
      {children}
    </Tag>
  );
}
