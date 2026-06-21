import { useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { formatJmd, formatSignedJmd, PartnerTab } from '../lib/partner-utils';
import {
  EARNINGS_BALANCE,
  EARNINGS_TRANSACTIONS,
  getPayoutDetail,
  NEXT_PAYOUT_LABEL,
  WEEKLY_BARS,
  WEEKLY_SUMMARY,
} from '../lib/earnings-mock-data';
import EarningsSubNav from '../components/earnings/EarningsSubNav';
import PayoutDetailView from '../components/earnings/PayoutDetailView';

interface EarningsPageProps {
  onNavigate: (page: PartnerTab) => void;
}

export default function EarningsPage({ onNavigate }: EarningsPageProps) {
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);

  const selectedPayout = selectedPayoutId ? getPayoutDetail(selectedPayoutId) : null;

  const openLatestPayout = () => {
    const latestPayout = EARNINGS_TRANSACTIONS.find(
      (transaction) => transaction.type === 'payout' && transaction.payoutId
    );
    if (latestPayout?.payoutId) {
      setSelectedPayoutId(latestPayout.payoutId);
    }
  };

  if (selectedPayout) {
    return (
      <PayoutDetailView payout={selectedPayout} onBack={() => setSelectedPayoutId(null)} />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-on-surface antialiased">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md md:px-margin-tablet">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex h-12 w-12 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container active:scale-95"
          aria-label="Menu"
        >
          <MaterialIcon name="menu" />
        </button>
        <h1 className="text-headline-md font-bold text-primary">Earnings</h1>
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container active:scale-95"
          aria-label="Wallet"
        >
          <MaterialIcon name="account_balance_wallet" />
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-grow flex-col gap-lg px-margin-mobile pb-[100px] pt-20 md:px-margin-tablet md:pb-lg">
        <section className="mt-md flex flex-col items-center gap-sm text-center">
          <h2 className="text-label-sm uppercase tracking-widest text-on-surface-variant">
            Current Balance
          </h2>
          <div className="text-headline-lg-mobile text-on-surface md:text-headline-lg">
            {formatJmd(EARNINGS_BALANCE)}
          </div>
          <p className="mb-md text-body-sm text-on-surface-variant">
            Next payout: {NEXT_PAYOUT_LABEL}
          </p>
          <button
            type="button"
            onClick={() => toast.info('Instant payout is coming soon')}
            className="flex min-h-[48px] items-center justify-center rounded-lg border border-secondary px-6 py-3 text-label-md text-secondary transition-colors hover:bg-secondary/5 active:scale-95"
          >
            Instant Payout
          </button>
        </section>

        <section className="flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
          <h3 className="mb-xs text-headline-md text-on-surface">This Week&apos;s Earnings</h3>
          <div className="flex items-center justify-between py-xs">
            <span className="text-body-sm text-on-surface-variant">Gross sales</span>
            <span className="text-body-lg text-on-surface">{formatJmd(WEEKLY_SUMMARY.grossSales)}</span>
          </div>
          <div className="flex items-center justify-between py-xs">
            <span className="text-body-sm text-on-surface-variant">
              Platform fee ({WEEKLY_SUMMARY.platformFeePercent}%)
            </span>
            <span className="text-body-lg text-error">
              {formatSignedJmd(-WEEKLY_SUMMARY.platformFee)}
            </span>
          </div>
          <hr className="my-xs border-outline-variant" />
          <div className="flex items-center justify-between py-xs">
            <span className="text-headline-md text-on-surface">Net earnings</span>
            <span className="text-headline-md text-primary">
              {formatJmd(WEEKLY_SUMMARY.netEarnings)}
            </span>
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
          <div className="mt-sm flex h-40 items-end justify-between gap-2 md:gap-4">
            {WEEKLY_BARS.map((bar) => (
              <div key={bar.day} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t-sm ${
                    bar.isToday ? 'bg-primary-container' : 'bg-surface-variant'
                  }`}
                  style={{ height: `${bar.heightPercent}%` }}
                />
                <span
                  className={`text-label-sm ${bar.isToday ? 'text-on-surface' : 'text-on-surface-variant'}`}
                >
                  {bar.day}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-sm">
          <h3 className="px-xs text-headline-md text-on-surface">Transaction History</h3>
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            {EARNINGS_TRANSACTIONS.map((transaction, index) => {
              const isPayout = transaction.type === 'payout' && transaction.payoutId;
              const row = (
                <>
                  <div className="flex flex-col gap-base text-left">
                    <span className="text-body-lg text-on-surface">{transaction.title}</span>
                    <span className="text-label-sm text-on-surface-variant">{transaction.date}</span>
                  </div>
                  <span
                    className={`text-body-lg ${
                      transaction.amount >= 0 ? 'text-primary' : 'text-error'
                    }`}
                  >
                    {formatSignedJmd(transaction.amount)}
                  </span>
                </>
              );

              if (isPayout) {
                return (
                  <button
                    key={transaction.id}
                    type="button"
                    onClick={() => setSelectedPayoutId(transaction.payoutId!)}
                    className={`flex w-full items-center justify-between p-md text-left transition-colors hover:bg-surface-container-low ${
                      index < EARNINGS_TRANSACTIONS.length - 1
                        ? 'border-b border-outline-variant'
                        : ''
                    }`}
                  >
                    {row}
                  </button>
                );
              }

              return (
                <div
                  key={transaction.id}
                  className={`flex items-center justify-between p-md ${
                    index < EARNINGS_TRANSACTIONS.length - 1
                      ? 'border-b border-outline-variant'
                      : ''
                  }`}
                >
                  {row}
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-md py-sm">
          <button
            type="button"
            onClick={openLatestPayout}
            className="flex min-h-[48px] items-center gap-xs text-body-sm text-primary transition-colors hover:text-primary-fixed-dim"
          >
            <MaterialIcon name="arrow_forward" className="text-[20px]" />
            View Payout Details
          </button>
          <button
            type="button"
            onClick={() => onNavigate('account')}
            className="flex min-h-[48px] items-center gap-xs text-body-sm text-primary transition-colors hover:text-primary-fixed-dim"
          >
            <MaterialIcon name="settings" className="text-[20px]" />
            Update Bank Details
          </button>
        </section>
      </main>

      <EarningsSubNav onNavigate={onNavigate} />
    </div>
  );
}
