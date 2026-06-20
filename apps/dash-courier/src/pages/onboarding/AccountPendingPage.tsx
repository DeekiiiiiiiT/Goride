import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ACCOUNT_REVIEW_ITEMS } from '@/lib/mockAccountReview';

const ILLUSTRATION =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBYf-fdDm1Bab--RSRWIJPR_V0M4sCI6hf0x8mZUsLnisvhbLH2egFAbkDMzu56Q5pKCsUqwx5kjtqyTk41NTUOwRT80cYvsCqcuCsSSEWFbTLxBLlUoeTWW1A8zrmvL_Mh5ngFeBeickxlWlTgl82B2JzP8sIeuN5sfEZQX_1jt-XUdu3zs2QRNTD9tR5sdCAP-qmfjjcIYHdxMPEbJ9oDla4BLGlLH1PrkvzJLZOFXi_IUSs_psijqQ12_t97ks6Fi-Q77SuHr5k';

type AccountPendingPageProps = {
  onLogOut: () => void;
  onContactSupport: () => void;
  onApproved: () => void;
};

const STATUS_ICON: Record<string, { icon: string; className: string; pulse?: boolean }> = {
  submitted: { icon: 'check_circle', className: 'text-success' },
  'under-review': { icon: 'hourglass_top', className: 'text-warning', pulse: true },
  processing: { icon: 'pending_actions', className: 'text-warning', pulse: true },
};

export function AccountPendingPage({
  onLogOut,
  onContactSupport,
  onApproved,
}: AccountPendingPageProps) {
  const [checking, setChecking] = useState(false);

  const handleCheckStatus = () => {
    setChecking(true);
    window.setTimeout(() => {
      setChecking(false);
      onApproved();
    }, 1500);
  };

  return (
    <div className="bg-background min-h-full flex flex-col items-center">
      <header className="w-full max-w-md flex justify-between items-center px-[var(--spacing-edge)] h-14">
        <div className="flex items-center gap-2">
          <MaterialIcon name="local_shipping" className="text-[28px] text-primary" filled />
          <span className="text-xl font-semibold text-primary tracking-tight">Roam Dash</span>
        </div>
        <button
          type="button"
          onClick={onLogOut}
          className="text-on-surface-variant hover:text-primary transition-colors p-2 text-sm font-medium"
        >
          Log out
        </button>
      </header>

      <main className="flex-1 w-full max-w-md flex flex-col mt-8 px-[var(--spacing-edge)] pb-8">
        <div className="w-full flex justify-center mb-8 courier-ambient-pulse">
          <img src={ILLUSTRATION} alt="" className="h-48 w-auto object-contain" />
        </div>

        <div className="text-center space-y-2 mb-8">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-on-background">
            Your account is being reviewed
          </h1>
          <p className="text-base text-on-surface-variant px-2">
            This usually takes 1-2 business days
          </p>
        </div>

        <div className="bg-surface rounded-xl shadow-soft border border-surface-container-low p-4 space-y-4 w-full">
          {ACCOUNT_REVIEW_ITEMS.map((item) => {
            const icon = STATUS_ICON[item.status];
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-2 bg-surface-bright rounded-lg"
              >
                <div
                  className={`w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0 ${
                    item.status === 'submitted' ? 'bg-success/10' : ''
                  }`}
                >
                  <MaterialIcon
                    name={icon.icon}
                    className={`${icon.className} ${icon.pulse ? 'animate-pulse' : ''}`}
                    filled={item.status === 'submitted'}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-on-background">{item.label}</p>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide mt-1 ${
                      item.status === 'submitted' ? 'text-success' : 'text-warning'
                    }`}
                  >
                    {item.statusLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-1" />

        <div className="mt-8 w-full flex flex-col gap-6 items-center">
          <p className="text-sm text-muted text-center max-w-[280px]">
            We&apos;ll send you a push notification as soon as you&apos;re approved.
          </p>

          <button
            type="button"
            onClick={onContactSupport}
            className="w-full h-14 bg-surface border border-outline-variant text-primary text-base font-semibold rounded-full hover:bg-surface-container-low active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <MaterialIcon name="support_agent" />
            Contact Support
          </button>

          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={checking}
            className="text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-50"
          >
            {checking ? 'Checking status…' : 'Check status'}
          </button>
        </div>
      </main>
    </div>
  );
}
