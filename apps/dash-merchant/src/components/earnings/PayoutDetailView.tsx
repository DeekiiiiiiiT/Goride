import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { PayoutDetail } from '../../types/earnings';
import { formatJmd, formatSignedJmd } from '../../lib/partner-utils';

interface PayoutDetailViewProps {
  payout: PayoutDetail;
  onBack: () => void;
}

export default function PayoutDetailView({ payout, onBack }: PayoutDetailViewProps) {
  const statusLabel =
    payout.status === 'completed'
      ? 'Completed'
      : payout.status === 'pending'
        ? 'Pending'
        : 'Failed';

  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-background pb-safe">
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md md:px-margin-tablet">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low active:scale-95"
          aria-label="Go back"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md text-on-surface">Payout Detail</h1>
        <div className="h-12 w-12" />
      </header>

      <main className="mx-auto w-full max-w-[600px] flex-grow px-margin-mobile py-md pb-28 md:px-margin-tablet md:pb-md">
        <section className="mb-md rounded-lg border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
          <div className="mb-md flex flex-col items-center justify-center text-center">
            <span className="mb-xs text-label-md uppercase tracking-wider text-on-surface-variant">
              Total Payout
            </span>
            <h2 className="mb-xs text-headline-lg-mobile text-primary md:text-headline-lg">
              {formatJmd(payout.totalAmount)}
            </h2>
            <div className="mt-sm inline-flex items-center gap-xs rounded-full bg-primary-container px-sm py-xs text-on-primary-container">
              <MaterialIcon name="check_circle" filled className="text-[16px]" />
              <span className="text-label-md">{statusLabel}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-sm border-t border-outline-variant pt-sm">
            <div>
              <span className="mb-base block text-label-sm text-on-surface-variant">Payout Date</span>
              <span className="block text-body-sm text-on-surface">{payout.payoutDate}</span>
            </div>
            <div>
              <span className="mb-base block text-label-sm text-on-surface-variant">Bank Account</span>
              <div className="flex items-center gap-xs">
                <MaterialIcon name="account_balance" className="text-[16px] text-on-surface-variant" />
                <span className="block text-body-sm text-on-surface">{payout.bankAccountMasked}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-xl rounded-lg border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
          <h3 className="mb-md text-headline-md text-on-surface">Breakdown</h3>
          <div className="space-y-sm">
            <div className="flex items-center justify-between py-xs">
              <span className="text-body-sm text-on-surface">Order earnings</span>
              <span className="text-body-sm text-on-surface">{formatJmd(payout.orderEarnings)}</span>
            </div>
            <div className="flex items-center justify-between py-xs">
              <span className="text-body-sm text-on-surface">Tips</span>
              <span className="text-body-sm text-on-surface">{formatJmd(payout.tips)}</span>
            </div>
            <div className="flex items-center justify-between py-xs">
              <span className="text-body-sm text-on-surface">Adjustments (Refunds)</span>
              <span className="text-body-sm text-error">
                {formatSignedJmd(payout.adjustments)}
              </span>
            </div>
            <div className="flex items-center justify-between py-xs">
              <span className="text-body-sm text-on-surface">
                Platform fees ({payout.platformFeePercent}%)
              </span>
              <span className="text-body-sm text-error">
                {formatSignedJmd(-payout.platformFee)}
              </span>
            </div>
            <div className="mt-sm flex items-center justify-between border-t border-outline-variant pt-sm">
              <span className="text-label-md uppercase tracking-wider text-on-surface">
                Net Amount
              </span>
              <span className="text-headline-md text-primary">{formatJmd(payout.netAmount)}</span>
            </div>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-outline-variant bg-surface-container-lowest p-margin-mobile pb-safe md:static md:border-none md:bg-transparent md:p-0">
        <button
          type="button"
          onClick={() => toast.info('Statement download is coming soon')}
          className="flex h-xl w-full items-center justify-center gap-sm rounded-lg bg-primary-container text-label-md text-on-primary-container shadow-sm transition-all hover:opacity-90 active:scale-95"
        >
          <MaterialIcon name="download" />
          Download Statement
        </button>
      </div>
    </div>
  );
}
