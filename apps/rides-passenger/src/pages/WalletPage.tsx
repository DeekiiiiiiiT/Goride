import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowUpFromLine,
  Banknote,
  Car,
  ChevronRight,
  CircleHelp,
  Loader2,
  Wallet,
} from 'lucide-react';
import type { WalletBalanceDto, WalletTransactionDto, ActivityTripHistoryItem } from '@roam/types/rides';
import { formatMoneyMinorPlain } from '@roam/types/rides';
import { walletGetTransactions } from '@/services/tripIntentEdge';
import { walletGetBalance } from '@/services/walletEdge';
import { ridesGetRequest } from '@/services/ridesEdge';
import { activityTripFromRide } from '@/lib/activityTripNavigation';
import { isShadowBookerTrip } from '@/lib/delegatedRideNavigation';
import { WALLET_BALANCE_CHANGED_EVENT, notifyWalletBalanceChanged } from '@/lib/walletEvents';

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
import { WithdrawSheet } from '@/components/wallet/WithdrawSheet';
import { PayArrearsSheet } from '@/components/wallet/PayArrearsSheet';
import { WalletPaymentMethodsList } from '@/components/wallet/WalletPaymentMethodsList';
import { WalletTransactionDetailSheet } from '@/components/wallet/WalletTransactionDetailSheet';
import { ActivityTripDetailsSheet } from '@/components/activity/ActivityTripDetailsSheet';
import { useDefaultPaymentMethod } from '@/hooks/useDefaultPaymentMethod';
import { CASH_SETTLEMENT_PAY_ARREARS_ENABLED } from '@/lib/cashSettlementFlags';

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

function shadowTxTitle(tx: WalletTransactionDto, fallback: string): string {
  if (tx.kind !== 'shadow_trip') return tx.title;
  return tx.title?.trim() || fallback;
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
  const { t } = useTranslation('wallet');
  const navigate = useNavigate();
  const { selectedId, select } = useDefaultPaymentMethod();
  const [addCashOpen, setAddCashOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransactionDto[]>([]);
  const [wallet, setWallet] = useState<WalletBalanceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [payArrearsOpen, setPayArrearsOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<WalletTransactionDto | null>(null);
  const [activityTrip, setActivityTrip] = useState<ActivityTripHistoryItem | null>(null);
  const [viewingTrip, setViewingTrip] = useState(false);

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
          const msg = e instanceof Error ? e.message : t('errors.couldNotLoadWallet');
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
    toast.message(t('common:comingSoon'));
  };

  const handleTxClick = (tx: WalletTransactionDto) => {
    setSelectedTx(tx);
  };

  const handleViewTrip = async (rideId: string) => {
    setViewingTrip(true);
    try {
      const res = await ridesGetRequest(rideId);
      const participantRole = res.participant_role === 'booker' ? 'booker' : 'passenger';
      const roamMode = res.roam_mode ?? res.ride.roam_mode;
      if (
        isShadowBookerTrip(participantRole, roamMode, res.booker_visibility)
        && (res.ride.status === 'completed' || res.ride.status === 'cancelled')
      ) {
        navigate(`/shadow-trip/${rideId}/receipt`);
        return;
      }
      const item = activityTripFromRide(res.ride, {
        participantRole,
        counterpartyName: res.ride.guest_passenger_name,
      });
      if (!item) {
        toast.error(t('errors.tripNotAvailable'));
        return;
      }
      setActivityTrip(item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('errors.couldNotLoadTrip'));
    } finally {
      setViewingTrip(false);
    }
  };

  const balanceLabel = wallet
    ? formatMoneyMinorPlain(wallet.balance_minor)
    : loading
      ? null
      : '0.00';

  const balanceMajor = wallet ? wallet.balance_minor / 100 : 0;

  const overlayOpen = addCashOpen || withdrawOpen || payArrearsOpen || selectedTx != null;

  return (
    <>
    <div
      className={`flex min-h-[100dvh] flex-col pb-28 ${overlayOpen ? 'blur-sm' : ''}`}
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
            aria-label={t('backToAccount')}
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
            {t('title')}
          </h1>
        </div>
        <button
          type="button"
          onClick={notifySoon}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: ON_SURFACE_VARIANT }}
          aria-label={t('walletHelp')}
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
            <p className="font-semibold">{t('outstandingBalance')}</p>
            <p className="mt-0.5" style={{ color: ON_SURFACE_VARIANT }}>
              {t('outstandingBalanceDescription', {
                amount: formatMoneyMinorPlain(wallet.arrears_minor),
              })}
            </p>
            {CASH_SETTLEMENT_PAY_ARREARS_ENABLED ? (
              <button
                type="button"
                onClick={() => setPayArrearsOpen(true)}
                className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: PRIMARY }}
              >
                {t('payOutstandingBalance')}
              </button>
            ) : (
              <p className="mt-2 text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                {t('payDriverHint')}
              </p>
            )}
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
              {t('walletBalance')}
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
                {t('includesRideCredit', {
                  amount: formatMoneyMinorPlain(wallet.credit_minor),
                })}
              </p>
            )}
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAddCashOpen(true)}
                className="flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold shadow-md transition-all active:scale-95"
                style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
              >
                <Banknote className="h-5 w-5" aria-hidden />
                {t('addCash')}
              </button>
              <button
                type="button"
                onClick={() => setWithdrawOpen(true)}
                className="flex items-center justify-center gap-2 rounded-2xl border py-4 text-sm font-bold transition-all active:scale-95"
                style={{
                  borderColor: 'color-mix(in srgb, var(--passenger-primary) 35%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--passenger-primary) 6%, var(--passenger-surface))',
                  color: PRIMARY,
                }}
              >
                <ArrowUpFromLine className="h-5 w-5" aria-hidden />
                {t('withdraw')}
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
              {t('paymentMethods')}
            </h2>
            <button
              type="button"
              onClick={() => navigate('/account/wallet/payment-methods')}
              className="text-xs font-bold tracking-wide hover:underline"
              style={{ color: PRIMARY }}
            >
              {t('manage')}
            </button>
          </div>
          <p className="px-1 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {t('defaultMethodHint')}
          </p>
          <WalletPaymentMethodsList selectedId={selectedId} onSelect={select} variant="wallet" />
        </section>

        <section className="space-y-4">
          <h2 className="px-1 text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            {t('recentTransactions')}
          </h2>
          <div
            className="overflow-hidden rounded-[24px]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8" style={{ color: ON_SURFACE_VARIANT }}>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('common:loading')}
              </div>
            ) : transactions.length === 0 ? (
              <p className="p-6 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {t('noTransactions')}
              </p>
            ) : (
              transactions.map((tx) => {
                const { Icon, iconBg, iconColor, positive } = txIcon(tx);
                const amountMinor = Number(tx.amount_minor);
                const amount = positive
                  ? `+${formatMoneyMinorPlain(amountMinor)}`
                  : `-${formatMoneyMinorPlain(amountMinor)}`;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => handleTxClick(tx)}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors passenger-row-hover"
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
                          {shadowTxTitle(tx, t('shadowTrip'))}
                        </p>
                        <p className="text-sm" style={{ color: SECONDARY }}>
                          {formatTxDate(tx.date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p
                        className="font-bold tabular-nums"
                        style={{ color: positive ? PRIMARY : ON_SURFACE }}
                      >
                        {amount}
                      </p>
                      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: ON_SURFACE_VARIANT }} aria-hidden />
                    </div>
                  </button>
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
            <h3 className="text-xl font-bold text-white">{t('earnBackTitle')}</h3>
            <p className="text-sm" style={{ color: SURFACE_VARIANT }}>
              {t('earnBackDescription')}
            </p>
          </div>
          <ChevronRight className="relative z-10 ml-auto h-6 w-6 shrink-0 text-white" aria-hidden />
        </button>
      </main>

    </div>

      <AddFundsSheet
        open={addCashOpen}
        onClose={() => setAddCashOpen(false)}
        balanceMajor={balanceMajor}
      />
      <WithdrawSheet
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        availableMinor={wallet?.available_minor ?? 0}
      />
      {wallet && wallet.arrears_minor > 0 ? (
        <PayArrearsSheet
          open={payArrearsOpen}
          onClose={() => setPayArrearsOpen(false)}
          arrearsMinor={wallet.arrears_minor}
          currency={wallet.currency}
          onSuccess={async () => {
            try {
              const balRes = await walletGetBalance(wallet.currency);
              setWallet(balRes.wallet);
              notifyWalletBalanceChanged();
            } catch {
              /* ignore */
            }
          }}
        />
      ) : null}
      <WalletTransactionDetailSheet
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onViewTrip={(rideId) => void handleViewTrip(rideId)}
      />
      <ActivityTripDetailsSheet
        trip={activityTrip}
        onClose={() => setActivityTrip(null)}
      />
      {viewingTrip ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: PRIMARY }} aria-hidden />
        </div>
      ) : null}
    </>
  );
}
