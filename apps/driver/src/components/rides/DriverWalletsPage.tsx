import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { formatMoneyMinorPlain, type PaymentJournalEntryDto } from '@roam/types/rides';
import {
  ridesDriverWalletJournal,
  ridesDriverWallets,
} from '../../services/ridesDriverEdge';
import { CASH_SETTLEMENT_V2_ENABLED } from '../../lib/cashSettlementFlags';

type WalletTab = 'digital' | 'cash' | 'debt';

const TAB_LABELS: Record<WalletTab, string> = {
  digital: 'Digital',
  cash: 'Cash',
  debt: 'Debt',
};

type Props = {
  onBack?: () => void;
};

export function DriverWalletsPage({ onBack }: Props) {
  const showMultiWallet = CASH_SETTLEMENT_V2_ENABLED;
  const [tab, setTab] = useState<WalletTab>('digital');
  const currency = 'JMD';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<Awaited<ReturnType<typeof ridesDriverWallets>>['wallets'] | null>(
    null,
  );
  const [transactions, setTransactions] = useState<PaymentJournalEntryDto[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const loadWallets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ridesDriverWallets(currency);
      setWallets(res.wallets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wallets');
    } finally {
      setLoading(false);
    }
  }, [currency]);

  const loadJournal = useCallback(async () => {
    setTxLoading(true);
    try {
      const res = await ridesDriverWalletJournal(tab, currency);
      setTransactions(res.transactions ?? []);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }, [tab, currency]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    void loadJournal();
  }, [loadJournal]);

  const activeWallet = wallets?.[tab];
  const debtOwed = wallets?.debt ? Math.abs(wallets.debt.balance_minor) : 0;
  const tabs: WalletTab[] = showMultiWallet ? ['digital', 'cash', 'debt'] : ['digital'];

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-full p-2 text-[#004ac6] transition-colors hover:bg-slate-100 active:scale-95 dark:text-blue-400 dark:hover:bg-slate-800"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {showMultiWallet ? 'Trip wallets' : 'Trip wallet'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {showMultiWallet
                ? 'Digital, cash collected, and change debt'
                : 'Settlement ledger balance & history'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadWallets()}
          className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Refresh wallets"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {showMultiWallet && debtOwed > 0 && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Open change debt</p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              {formatMoneyMinorPlain(debtOwed)} owed to riders — repays automatically when your Digital
              wallet is funded.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className={`grid gap-2 ${showMultiWallet ? 'grid-cols-3' : 'grid-cols-1'}`}>
        {tabs.map((key) => {
          const bal = wallets?.[key];
          const Icon = key === 'cash' ? Banknote : CreditCard;
          const displayMinor =
            key === 'debt' && bal ? Math.abs(bal.balance_minor) : bal?.available_minor ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-2xl border p-3 text-left transition-colors ${
                tab === key
                  ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              }`}
            >
              <Icon className="mb-2 h-4 w-4 text-slate-500" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {TAB_LABELS[key]}
              </p>
              {loading && !bal ? (
                <Loader2 className="mt-1 h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatMoneyMinorPlain(displayMinor)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
          Recent {showMultiWallet ? TAB_LABELS[tab] : ''} transactions
        </h3>
        {txLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
            No transactions yet
          </p>
        ) : (
          <ul className="space-y-2">
            {transactions.map((tx) => {
              const positive = tx.is_credit === true;
              const signed = positive
                ? `+${formatMoneyMinorPlain(tx.amount_minor)}`
                : `-${formatMoneyMinorPlain(tx.amount_minor)}`;
              return (
                <li
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {tx.description}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(tx.created_at).toLocaleString()}</p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {signed}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {activeWallet && tab === 'digital' && activeWallet.credit_minor > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Available: {formatMoneyMinorPlain(activeWallet.available_minor)}
        </p>
      )}
    </div>
  );
}
