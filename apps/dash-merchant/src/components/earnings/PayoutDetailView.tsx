import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { PayoutDetail } from '../../types/earnings';
import { formatJmd, formatSignedJmd } from '../../lib/partner-utils';
import { deliveryFetch } from '../../lib/partner-api';

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

      <main className="mx-auto w-full max-w-[600px] flex-grow px-margin-mobile py-inset-md pb-28 md:px-margin-tablet md:pb-inset-md">
        <section className="mb-inset-md rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
          <div className="mb-inset-md flex flex-col items-center justify-center text-center">
            <span className="mb-inset-xs text-label-md uppercase tracking-wider text-on-surface-variant">
              Total Payout
            </span>
            <h2 className="mb-inset-xs text-headline-lg-mobile text-primary md:text-headline-lg">
              {formatJmd(payout.totalAmount)}
            </h2>
            <div className="mt-inset-sm inline-flex items-center gap-inset-xs rounded-full bg-primary-container px-inset-sm py-inset-xs text-on-primary-container">
              <MaterialIcon name="check_circle" filled className="text-[16px]" />
              <span className="text-label-md">{statusLabel}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-inset-sm border-t border-outline-variant pt-inset-sm">
            <div>
              <span className="mb-inset-base block text-label-sm text-on-surface-variant">Payout Date</span>
              <span className="block text-body-sm text-on-surface">{payout.payoutDate}</span>
            </div>
            <div>
              <span className="mb-inset-base block text-label-sm text-on-surface-variant">Bank Account</span>
              <div className="flex items-center gap-inset-xs">
                <MaterialIcon name="account_balance" className="text-[16px] text-on-surface-variant" />
                <span className="block text-body-sm text-on-surface">{payout.bankAccountMasked}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-inset-xl rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
          <h3 className="mb-inset-md text-headline-md text-on-surface">Breakdown</h3>
          <div className="space-y-inset-sm">
            <div className="flex items-center justify-between py-inset-xs">
              <span className="text-body-sm text-on-surface">Order earnings</span>
              <span className="text-body-sm text-on-surface">{formatJmd(payout.orderEarnings)}</span>
            </div>
            <div className="flex items-center justify-between py-inset-xs">
              <span className="text-body-sm text-on-surface">Tips</span>
              <span className="text-body-sm text-on-surface">{formatJmd(payout.tips)}</span>
            </div>
            <div className="flex items-center justify-between py-inset-xs">
              <span className="text-body-sm text-on-surface">Adjustments (Refunds)</span>
              <span className="text-body-sm text-error">
                {formatSignedJmd(payout.adjustments)}
              </span>
            </div>
            {(payout.adjustmentLineItems ?? []).map((line) => (
              <div key={`${line.createdAt}-${line.reason}`} className="flex items-center justify-between py-inset-xs pl-inset-sm">
                <span className="text-body-sm text-on-surface-variant line-clamp-1">{line.reason}</span>
                <span className="text-body-sm text-error">{formatSignedJmd(line.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-inset-xs">
              <span className="text-body-sm text-on-surface">
                Platform fees ({payout.platformFeePercent}%)
              </span>
              <span className="text-body-sm text-error">
                {formatSignedJmd(-payout.platformFee)}
              </span>
            </div>
            <div className="mt-inset-sm flex items-center justify-between border-t border-outline-variant pt-inset-sm">
              <span className="text-label-md uppercase tracking-wider text-on-surface">
                Net Amount
              </span>
              <span className="text-headline-md text-primary">{formatJmd(payout.netAmount)}</span>
            </div>
          </div>
        </section>
        {(payout.orderLines || []).length > 0 && (
          <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md">
            <h3 className="mb-2 text-label-md font-semibold text-on-surface">Orders in this payout</h3>
            <ul className="space-y-2">
              {payout.orderLines?.map((line) => (
                <li key={line.orderId} className="flex items-center justify-between gap-3 text-body-sm">
                  <span>Order {line.orderNumber} · {formatJmd(line.net)}</span>
                  <button
                    type="button"
                    className="text-primary"
                    onClick={() => {
                      void deliveryFetch('/merchant/earnings/disputes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderId: line.orderId }),
                      }).then((body) => {
                        toast.success((body as { words?: string }).words || 'Dispute opened');
                      }).catch((error) => {
                        toast.error(error instanceof Error ? error.message : 'Could not open the dispute');
                      });
                    }}
                  >
                    Dispute
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-outline-variant bg-surface-container-lowest p-margin-mobile pb-safe md:static md:border-none md:bg-transparent md:p-0">
        <button
          type="button"
          onClick={() => {
            const lines = [
              'order,net_jmd',
              ...(payout.orderLines || []).map((line) => `${line.orderNumber},${line.net.toFixed(2)}`),
              `net,${payout.netAmount.toFixed(2)}`,
            ];
            const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `statement-${payout.id}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}
          className="flex h-inset-xl w-full items-center justify-center gap-inset-sm rounded-lg bg-primary-container text-label-md text-on-primary-container shadow-sm transition-all hover:opacity-90 active:scale-95"
        >
          <MaterialIcon name="download" />
          Download Statement
        </button>
      </div>
    </div>
  );
}
