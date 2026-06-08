import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Car,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Loader2,
  PlusCircle,
  Smartphone,
  Wallet,
} from 'lucide-react';
import type { WalletTransactionDto } from '@roam/types/rides';
import { walletGetTransactions, formatFareMinor } from '@/services/tripIntentEdge';

import {
  CARD_SHADOW,
  INVERSE_SURFACE,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
  SECONDARY,
  SECONDARY_CONTAINER,
  SURFACE_CONTAINER,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOW,
  SURFACE_LOWEST,
  SURFACE_VARIANT,
} from '@/lib/passengerTheme';
import { AddFundsSheet } from '@/components/wallet/AddFundsSheet';

const PROMO_BANNER_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuD0UhK5VtLTpy4UHuvfJVFirezfOFH8aVxjOc4xktbQT5pwx1qbyTm-1WnbSsefL9Wi0oVIw8xkhGB-M23OqRkM8nzib-4ZdM6dNXqr697Y74RBMdSaNwcbD1T-KNqHDZLZthBKomvCPZGNz5SxlisRDu3A3Uq0dj1GhoL0wn6Bf9DgGZ6Z4R79Abe0tlHvDx4axkEXUEOIL1d1-6axQwvJ7qYZEZysz7DB_d8-FN_Aqsd_NrdFdklLYBgPoWE-swsr6v2WeuC7e5zq';

const BALANCE = 42.5;

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

function txIcon(tx: WalletTransactionDto) {
  if (tx.kind === 'topup') {
    return { Icon: Wallet, iconBg: PRIMARY_FIXED, iconColor: PRIMARY_CONTAINER, positive: true };
  }
  if (tx.kind === 'shadow_trip') {
    return { Icon: Wallet, iconBg: PRIMARY_FIXED, iconColor: PRIMARY_CONTAINER, positive: false };
  }
  return { Icon: Car, iconBg: SURFACE_CONTAINER_HIGH, iconColor: ON_SURFACE_VARIANT, positive: false };
}

export default function WalletPage() {
  const navigate = useNavigate();
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransactionDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void walletGetTransactions()
      .then((res) => {
        if (!cancelled) setTransactions(res.transactions);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not load transactions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
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
        <section
          className="relative overflow-hidden rounded-[24px] p-6"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <div className="relative z-10">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: SECONDARY }}>
              Current balance
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-[30px] font-bold tracking-tight" style={{ color: PRIMARY }}>
                ${BALANCE.toFixed(2)}
              </span>
              <span className="text-sm" style={{ color: SECONDARY }}>
                USD
              </span>
            </div>
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
          <div className="space-y-2">
            <button
              type="button"
              onClick={notifySoon}
              className="group flex w-full items-center justify-between rounded-[24px] p-4 text-left transition-colors passenger-row-hover"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: ON_SURFACE }}
                >
                  <Smartphone className="h-6 w-6 text-white" aria-hidden />
                </div>
                <div>
                  <p className="font-bold" style={{ color: ON_SURFACE }}>
                    Apple Pay
                  </p>
                  <p className="text-sm" style={{ color: SECONDARY }}>
                    Default method
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
            </button>
            <button
              type="button"
              onClick={notifySoon}
              className="flex w-full items-center justify-between rounded-[24px] p-4 text-left transition-colors passenger-row-hover"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: SECONDARY_CONTAINER }}
                >
                  <CreditCard className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
                </div>
                <div>
                  <p className="font-bold" style={{ color: ON_SURFACE }}>
                    Visa ending in 1234
                  </p>
                  <p className="text-sm" style={{ color: SECONDARY }}>
                    Expires 08/26
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
            </button>
          </div>
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
                No trips yet.
              </p>
            ) : (
              transactions.map((tx) => {
                const { Icon, iconBg, iconColor, positive } = txIcon(tx);
                const amount = positive
                  ? `+${formatFareMinor(tx.amount_minor, tx.currency)}`
                  : `-${formatFareMinor(tx.amount_minor, tx.currency)}`;
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
                          {tx.title}
                        </p>
                        <p className="text-sm" style={{ color: SECONDARY }}>
                          {formatTxDate(tx.date)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className="font-bold"
                        style={{ color: positive ? PRIMARY : ON_SURFACE }}
                      >
                        {amount}
                      </p>
                      {tx.meta ? (
                        <p className="text-[11px] font-semibold" style={{ color: SECONDARY }}>
                          {tx.meta}
                        </p>
                      ) : null}
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
              Top up $100 or more with Roam Rides Visa.
            </p>
          </div>
          <ChevronRight className="relative z-10 ml-auto h-6 w-6 shrink-0 text-white" aria-hidden />
        </button>
      </main>

    </div>

      <AddFundsSheet
        open={addFundsOpen}
        onClose={() => setAddFundsOpen(false)}
        balanceUsd={BALANCE}
      />
    </>
  );
}
