import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type CustomerUnavailablePageProps = {
  onClose: () => void;
  onLeaveAtSafeLocation: () => void;
};

const INITIAL_SECONDS = 300;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CustomerUnavailablePage({
  onClose,
  onLeaveAtSafeLocation,
}: CustomerUnavailablePageProps) {
  const [secondsLeft, setSecondsLeft] = useState(INITIAL_SECONDS);
  const timerExpired = secondsLeft <= 0;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col pt-14 pb-16">
      <header className="bg-surface shadow-sm flex justify-between items-center px-[var(--spacing-edge)] h-14 w-full z-50 fixed top-0 pt-safe">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-on-surface hover:bg-surface-container-high p-2 rounded-full active:scale-95"
        >
          <MaterialIcon name="close" />
        </button>
        <h1 className="text-xl font-bold text-primary">Roam Dash Courier</h1>
        <div className="flex items-center text-primary text-xs font-semibold uppercase tracking-wide">
          <MaterialIcon name="bolt" className="text-base mr-1" />
          Online
        </div>
      </header>

      <main className="flex-1 flex flex-col px-[var(--spacing-edge)] pt-6 gap-6 overflow-y-auto">
        <section className="flex flex-col items-center justify-center py-6 bg-surface rounded-xl shadow-soft border-l-4 border-warning">
          <MaterialIcon name="hourglass_empty" className="text-warning mb-2 text-5xl" />
          <h2 className="text-xl font-semibold text-on-surface mb-1">Waiting for customer...</h2>
          <p
            className={`text-[28px] leading-9 font-bold tabular-nums ${
              timerExpired ? 'text-error' : 'text-on-surface'
            }`}
          >
            {formatTime(Math.max(0, secondsLeft))}
          </p>
          <p className="text-sm text-muted mt-2 text-center px-4">
            Please attempt to contact the customer before leaving the order.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <button
            type="button"
            className="flex flex-col items-center justify-center bg-primary text-on-primary rounded-xl py-4 px-2 shadow-primary active:scale-95 min-h-20"
          >
            <MaterialIcon name="call" className="mb-2" />
            <span className="text-xs font-semibold uppercase tracking-wide">Call Customer</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center justify-center bg-surface border border-outline-variant text-on-surface rounded-xl py-4 px-2 shadow-soft active:scale-95 min-h-20"
          >
            <MaterialIcon name="notifications_active" className="mb-2" />
            <span className="text-xs font-semibold uppercase tracking-wide">Send Notification</span>
          </button>
        </section>

        <hr className="border-t border-surface-container-high -mx-[var(--spacing-edge)]" />

        <section className="flex flex-col gap-2 pb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
            Resolution Options
          </h3>

          <button
            type="button"
            onClick={onLeaveAtSafeLocation}
            disabled={!timerExpired}
            className={`flex items-center justify-between w-full bg-surface p-4 rounded-xl shadow-soft text-left border border-transparent ${
              timerExpired
                ? 'hover:border-outline-variant active:scale-95'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="bg-surface-container-low p-2 rounded-full text-primary">
                <MaterialIcon name="place" filled />
              </div>
              <div>
                <span className="block text-base font-semibold text-on-surface">
                  Leave at safe location
                </span>
                <span className="block text-sm text-muted">Requires a photo</span>
              </div>
            </div>
            <MaterialIcon name="chevron_right" className="text-muted" />
          </button>

          <button
            type="button"
            disabled={!timerExpired}
            className={`flex items-center justify-between w-full bg-surface p-4 rounded-xl shadow-soft text-left border border-transparent ${
              timerExpired
                ? 'hover:border-outline-variant active:scale-95'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="bg-surface-container-low p-2 rounded-full text-muted">
                <MaterialIcon name="assignment_return" />
              </div>
              <div>
                <span className="block text-base font-semibold text-on-surface">
                  Return order to restaurant
                </span>
                <span className="block text-sm text-muted">Available after timer expires</span>
              </div>
            </div>
            <MaterialIcon name="chevron_right" className="text-muted" />
          </button>

          <button
            type="button"
            className="flex items-center justify-between w-full bg-surface p-4 rounded-xl shadow-soft active:scale-95 text-left border border-transparent hover:border-outline-variant mt-4"
          >
            <div className="flex items-center gap-4">
              <div className="bg-surface-container-low p-2 rounded-full text-on-surface">
                <MaterialIcon name="support_agent" />
              </div>
              <div>
                <span className="block text-base font-semibold text-on-surface">Contact Support</span>
                <span className="block text-sm text-muted">Get help with this delivery</span>
              </div>
            </div>
            <MaterialIcon name="chevron_right" className="text-muted" />
          </button>
        </section>
      </main>
    </div>
  );
}
