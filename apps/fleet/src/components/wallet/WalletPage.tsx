import { useState } from 'react';
import { initialEarningsPeriod } from '../earnings/EarningsPeriodFilter';
import { cn } from '../ui/utils';
import { BalancesTab } from './BalancesTab';
import { PaymentMethodsTab } from './PaymentMethodsTab';
import { PayoutTab } from './PayoutTab';

type DeskTab = 'balances' | 'payment-methods' | 'payout';

const TABS: { id: DeskTab; label: string }[] = [
  { id: 'balances', label: 'Balances' },
  { id: 'payment-methods', label: 'Payment methods' },
  { id: 'payout', label: 'Payout' },
];

type Props = {
  onNavigate?: (page: string) => void;
  onOpenDriver?: (driverId: string) => void;
};

export function WalletPage({ onNavigate, onOpenDriver }: Props) {
  const [tab, setTab] = useState<DeskTab>('balances');
  const [period, setPeriod] = useState(initialEarningsPeriod);

  const subtitle =
    tab === 'balances'
      ? 'Cash drivers are holding, Roam rider debt, and platform bank payouts for the selected period.'
      : tab === 'payment-methods'
        ? 'Cards Roam can use later for debt collection and Roam Cash loads (WiPay).'
        : 'Bank account for future Roam period deposits.';

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Wallet
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/50">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'min-h-11 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'balances' ? (
        <BalancesTab
          period={period}
          onPeriodChange={setPeriod}
          onNavigate={onNavigate}
          onOpenDriver={onOpenDriver}
        />
      ) : null}
      {tab === 'payment-methods' ? <PaymentMethodsTab /> : null}
      {tab === 'payout' ? <PayoutTab /> : null}
    </div>
  );
}
