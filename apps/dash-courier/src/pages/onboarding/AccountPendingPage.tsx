import React, { useCallback, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  buildAccountReviewItems,
  type AccountReviewItem,
  type ReviewItemStatus,
} from '@/lib/accountReviewStatus';
import { listCourierDocuments } from '@/lib/courierDocumentService';
import { loadCourierProfile, pollApprovalStatus } from '@/lib/courierProfileService';
import { loadPrimaryVehicle } from '@/lib/courierVehicleService';

const ILLUSTRATION =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBYf-fdDm1Bab--RSRWIJPR_V0M4sCI6hf0x8mZUsLnisvhbLH2egFAbkDMzu56Q5pKCsUqwx5kjtqyTk41NTUOwRT80cYvsCqcuCsSSEWFbTLxBLlUoeTWW1A8zrmvL_Mh5ngFeBeickxlWlTgl82B2JzP8sIeuN5sfEZQX_1jt-XUdu3zs2QRNTD9tR5sdCAP-qmfjjcIYHdxMPEbJ9oDla4BLGlLH1PrkvzJLZOFXi_IUSs_psijqQ12_t97ks6Fi-Q77SuHr5k';

type AccountPendingPageProps = {
  onLogOut: () => void;
  onContactSupport: () => void;
  onApproved: () => void;
};

const STATUS_ICON: Record<ReviewItemStatus, { icon: string; className: string; pulse?: boolean; filled?: boolean }> = {
  'not-submitted': { icon: 'radio_button_unchecked', className: 'text-muted' },
  submitted: { icon: 'hourglass_top', className: 'text-warning', pulse: true },
  verified: { icon: 'check_circle', className: 'text-success', filled: true },
  rejected: { icon: 'cancel', className: 'text-error', filled: true },
  expired: { icon: 'event_busy', className: 'text-warning', filled: true },
};

const POLL_INTERVAL_MS = 30_000;

export function AccountPendingPage({
  onLogOut,
  onContactSupport,
  onApproved,
}: AccountPendingPageProps) {
  const [checking, setChecking] = useState(false);
  const [items, setItems] = useState<AccountReviewItem[]>([]);

  const refreshReview = useCallback(async () => {
    const [docs, profile, vehicle] = await Promise.all([
      listCourierDocuments(),
      loadCourierProfile(),
      loadPrimaryVehicle(),
    ]);
    setItems(
      buildAccountReviewItems({
        docs,
        backgroundCheckStatus: profile?.background_check_status,
        hasVehicle: Boolean(vehicle),
      }),
    );
    return profile?.status ?? null;
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const [polled, reviewStatus] = await Promise.all([pollApprovalStatus(), refreshReview()]);
      if (polled === 'active' || reviewStatus === 'active') {
        onApproved();
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkStatus();
    const interval = window.setInterval(() => void checkStatus(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-background min-h-dvh flex flex-col items-center">
      <header className="w-full max-w-md flex justify-between items-center px-[var(--spacing-edge)] min-h-14 pt-safe">
        <div className="flex items-center gap-2">
          <MaterialIcon name="local_shipping" className="text-[28px] text-primary" filled />
          <span className="text-xl font-semibold text-primary tracking-tight">Roam Rush</span>
        </div>
        <button
          type="button"
          onClick={onLogOut}
          className="text-on-surface-variant hover:text-primary transition-colors min-h-11 px-2 text-sm font-medium"
        >
          Log out
        </button>
      </header>

      <main className="flex-1 w-full max-w-md flex flex-col mt-8 px-[var(--spacing-edge)] pb-safe">
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
          {items.map((item) => {
            const icon = STATUS_ICON[item.status];
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-2 bg-surface-bright rounded-lg"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    item.status === 'verified'
                      ? 'bg-success/10'
                      : item.status === 'rejected'
                        ? 'bg-error/10'
                        : 'bg-warning/10'
                  }`}
                >
                  <MaterialIcon
                    name={icon.icon}
                    className={`${icon.className} ${icon.pulse ? 'animate-pulse' : ''}`}
                    filled={icon.filled}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-on-background">{item.label}</p>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide mt-1 ${
                      item.status === 'verified'
                        ? 'text-success'
                        : item.status === 'rejected'
                          ? 'text-error'
                          : item.status === 'not-submitted'
                            ? 'text-muted'
                            : 'text-warning'
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
            onClick={() => void checkStatus()}
            disabled={checking}
            className="min-h-11 px-3 text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-50"
          >
            {checking ? 'Checking status…' : 'Check status'}
          </button>
        </div>
      </main>
    </div>
  );
}
