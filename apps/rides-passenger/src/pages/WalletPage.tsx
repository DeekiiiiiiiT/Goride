import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Car,
  ChevronRight,
  CircleHelp,
  Loader2,
  PlusCircle,
  Wallet,
} from 'lucide-react';
import type { WalletBalanceDto, WalletTransactionDto } from '@roam/types/rides';
import { formatMoneyMinorPlain } from '@roam/types/rides';
import { walletGetTransactions } from '@/services/tripIntentEdge';
import { walletGetBalance } from '@/services/walletEdge';
import { WALLET_BALANCE_CHANGED_EVENT } from '@/lib/walletEvents';

import {
  CARD_SHADOW,
  INVERSE_SURFACE,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
  SECONDARY,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOWEST,
  SURFACE_VARIANT,
} from '@/lib/passengerTheme';
import { AddFundsSheet } from '@/components/wallet/AddFundsSheet';
import { WalletPaymentMethodsList } from '@/components/wallet/WalletPaymentMethodsList';
import { useDefaultPaymentMethod } from '@/hooks/useDefaultPaymentMethod';

const PROMO_BANNER_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuD0UhK5VtLTpy4UHuvfJVFirezfOFH8aVxjOc4xktbQT5pwx1qbyTm-1WnbSsefL9Wi0oVIw8xkhGB-M23OqRkM8nzib-4ZdM6dNXqr697Y74RBMdSaNwcbD1T-KNqHDZLZthBKomvCPZGNz5SxlisRDu3A3Uq0dj1GhoL0wn6Bf9DgGZ6Z4R79Abe0tlHvDx4axkEXUEOIL1d1-6axQwvJ7qYZEZysz7DB_d8-FN_Aqsd_NrdFdklLYBgPoWE-swsr6v2WeuC7e5zq';

function formatTxDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function shadowTxTitle(tx: WalletTransactionDto): string {
  if (tx.kind !== 'shadow_trip') return tx.title;
  return tx.title?.trim() || 'Shadow trip';
}

function txIsCredit(tx: WalletTransactionDto): boolean {
  if (tx.kind === 'journal') return tx.is_credit === true;
  if (tx.kind === 'topup') return true;
  return false;
}

function txIcon(tx: WalletTransactionDto) {
  const positive = txIsCredit(tx);
  if (tx.kind === 'topup' || tx.kind === 'shadow_trip' || tx.kind === 'journal') {
    return {
      Icon: Wallet,
      iconBg: positive ? PRIMARY_FIXED : SURFACE_CONTAINER_HIGH,
      iconColor: positive ? PRIMARY_CONTAINER : ON_SURFACE_VARIANT,
      positive,
    };
  }
  return { Icon: Car, iconBg: SURFACE_CONTAINER_HIGH, iconColor: ON_SURFACE_VARIANT, positive: false };
}

export default function WalletPage() {
  const navigate = useNavigate();
  const { selectedId, select } = useDefaultPaymentMethod();
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransactionDto[]>([]);
  const [wallet, setWallet] = useState<WalletBalanceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setWalletError(null);
      setLoading(true);
      try {
        const [txRes, balRes] = await Promise.all([
          walletGetTransactions(),
          walletGetBalance(),
        ]);
        if (!cancelled) {
          setTransactions(txRes.transactions ?? []);
          setWallet(balRes.wallet);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Could not load wallet';
          setWalletError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener(WALLET_BALANCE_CHANGED_EVENT, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(WALLET_BALANCE_CHANGED_EVENT, load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const notifySoon = () => {
    toast.message('Coming soon');
  };

  const handleTxClick = (tx: WalletTransactionDto) => {
    if (tx.kind === 'shadow_trip' && tx.ride_id) {
      navigate(`/shadow-trip/${tx.ride_id}/receipt`);
    }
  };

  const balanceLabel = wallet
    ? formatMoneyMinorPlain(wallet.balance_minor)
    : loading
      ? null
      : '0.00';

  const balanceMajor = wallet ? wallet.balance_minor / 100 : 0;

  return (
    <>
    <div
      className={`flex min-h-[100dvh] flex-col pb-28 ${addFundsOpen ? 'blur-sm' : ''}`}
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center justify-between px-5 shadow-sm safe-t"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/account')}
            className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
            style={{ color: PRIMARY }}
            aria-label="Back to account"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
            Wallet
          </h1>
        </div>
        <button
          type="button"
          onClick={notifySoon}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: ON_SURFACE_VARIANT }}
          aria-label="Wallet help"
        >
          <CircleHelp className="h-6 w-6" aria-hidden />
        </button>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 py-6 safe-x">
        {wallet && wallet.arrears_minor > 0 && (
          <div
            className="rounded-2xl border px-4 py-3 text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, #ef4444 8%, var(--passenger-surface-lowest, #fff))',
              borderColor: 'color-mix(in srgb, #ef4444 25%, transparent)',
              color: ON_SURFACE,
            }}
          >
            <p className="font-semibold">Outstanding balance</p>
            <p className="mt-0.5" style={{ color: ON_SURFACE_VARIANT }}>
              You owe {formatMoneyMinorPlain(wallet.arrears_minor)} from a previous cash trip. Pay your
              driver in full on your next ride or contact support.
            </p>
          </div>
        )}

        {walletError && !wallet && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {walletError}
          </div>
        )}

        <section
          className="relative overflow-hidden rounded-[24px] p-6"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <div className="relative z-10">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: SECONDARY }}>
              Wallet balance
            </p>
            <div className="flex items-baseline gap-1">
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: PRIMARY }} />
              ) : (
                <span className="text-[30px] font-bold tracking-tight tabular-nums" style={{ color: PRIMARY }}>
                  {balanceLabel}
                </span>
              )}
            </div>
            {wallet && wallet.credit_minor > 0 && (
              <p className="mt-2 text-xs" style={{ color: SECONDARY }}>
                Includes {formatMoneyMinorPlain(wallet.credit_minor)} ride credit
              </p>
            )}
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setAddFundsOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold shadow-md transition-all active:scale-95"
                style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
              >
                <PlusCircle className="h-5 w-5" fill="currentColor" aria-hidden />
                Add Funds
              </button>
            </div>
          </div>
          <div
            className="absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-30 blur-[80px]"
            style={{ backgroundColor: PRIMARY_FIXED }}
            aria-hidden
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
              Payment Methods
            </h2>
            <button
              type="button"
              onClick={() => navigate('/account/wallet/payment-methods')}
              className="text-xs font-bold tracking-wide hover:underline"
              style={{ color: PRIMARY }}
            >
              MANAGE
            </button>
          </div>
          <p className="px-1 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Your default method is used when you book a trip on Home.
          </p>
          <WalletPaymentMethodsList selectedId={selectedId} onSelect={select} variant="wallet" />
        </section>

        <section className="space-y-4">
          <h2 className="px-1 text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            Recent Transactions
          </h2>
          <div
            className="overflow-hidden rounded-[24px]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8" style={{ color: ON_SURFACE_VARIANT }}>
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : transactions.length === 0 ? (
              <p className="p-6 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                No transactions yet.
              </p>
            ) : (
              transactions.map((tx) => {
                const { Icon, iconBg, iconColor, positive } = txIcon(tx);
                const amountMinor = Number(tx.amount_minor);
                const amount = positive
                  ? `+${formatMoneyMinorPlain(amountMinor)}`
                  : `-${formatMoneyMinorPlain(amountMinor)}`;
                const clickable = tx.kind === 'shadow_trip' && Boolean(tx.ride_id);
                const Row = clickable ? 'button' : 'div';
                return (
                  <Row
                    key={tx.id}
                    type={clickable ? 'button' : undefined}
                    onClick={clickable ? () => handleTxClick(tx) : undefined}
                    className={`flex w-full items-center justify-between p-4 transition-colors passenger-row-hover ${
                      clickable ? 'text-left' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: iconBg }}
                      >
                        <Icon className="h-5 w-5" style={{ color: iconColor }} aria-hidden />
                      </div>
                      <div>
                        <p className="font-bold" style={{ color: ON_SURFACE }}>
                          {shadowTxTitle(tx)}
                        </p>
                        <p className="text-sm" style={{ color: SECONDARY }}>
                          {formatTxDate(tx.date)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className="font-bold tabular-nums"
                        style={{ color: positive ? PRIMARY : ON_SURFACE }}
                      >
                        {amount}
                      </p>
                    </div>
                  </Row>
                );
              })
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={notifySoon}
          className="relative flex h-32 w-full items-center overflow-hidden rounded-[24px] p-6 text-left"
          style={{ backgroundColor: INVERSE_SURFACE }}
        >
          <img
            src={PROMO_BANNER_URL}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-overlay"
          />
          <div className="relative z-10 min-w-0 flex-1">
            <h3 className="text-xl font-bold text-white">Earn 5% Back</h3>
            <p className="text-sm" style={{ color: SURFACE_VARIANT }}>
              Top up with Roam Rides.
            </p>
          </div>
          <ChevronRight className="relative z-10 ml-auto h-6 w-6 shrink-0 text-white" aria-hidden />
        </button>
      </main>

    </div>

      <AddFundsSheet
        open={addFundsOpen}
        onClose={() => setAddFundsOpen(false)}
        balanceMajor={balanceMajor}
      />
    </>
  );
}
