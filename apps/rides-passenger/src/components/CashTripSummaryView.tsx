import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Banknote, Loader2, Share2, Star, Wallet, X } from 'lucide-react';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { RideRequestRow, SettlementSummaryDto, WalletBalanceDto } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  cashSettlementOutcomeMessage,
  computeOutcomeFromRide,
} from '@roam/types/cashSettlementDisplay';
import { notifyWalletBalanceChanged } from '@/lib/walletEvents';
import { ridesGetSettlementSummary } from '@/services/ridesEdge';
import { walletGetBalance } from '@/services/walletEdge';

const KM_TO_MI = 0.621371;

const TIP_PRESETS_JMD = [
  { id: '500', label: '500' },
  { id: '1000', label: '1,000' },
  { id: '2000', label: '2,000' },
] as const;

function formatTripDistanceMi(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return `${(km * KM_TO_MI).toFixed(1)} mi`;
}

function formatTripDuration(ride: RideRequestRow): string {
  if (ride.trip_started_at && ride.completed_at) {
    const mins = Math.max(
      1,
      Math.round(
        (new Date(ride.completed_at).getTime() - new Date(ride.trip_started_at).getTime()) / 60_000,
      ),
    );
    return `${mins}m`;
  }
  const est = ride.duration_estimate_minutes;
  if (est != null && Number.isFinite(est)) return `${Math.round(est)}m`;
  return '—';
}

type Props = {
  ride: RideRequestRow;
};

export function CashTripSummaryView({ ride }: Props) {
  const navigate = useNavigate();
  const [rating, setRating] = useState(5);
  const [selectedTip, setSelectedTip] = useState<string | null>(null);
  const [summary, setSummary] = useState<SettlementSummaryDto | null>(null);
  const [wallet, setWallet] = useState<WalletBalanceDto | null>(null);
  const [loading, setLoading] = useState(true);

  const currency = ride.currency ?? 'JMD';
  const computed = useMemo(() => computeOutcomeFromRide(ride), [ride]);
  const outcome = ride.cash_settlement_outcome;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [summaryRes, balanceRes] = await Promise.all([
          ridesGetSettlementSummary(ride.id).catch(() => null),
          walletGetBalance(currency).catch(() => null),
        ]);
        if (cancelled) return;
        if (summaryRes?.summary) setSummary(summaryRes.summary);
        if (balanceRes?.wallet) {
          setWallet(balanceRes.wallet);
          notifyWalletBalanceChanged();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [ride.id, currency]);

  const owedMinor = summary?.owed_minor ?? computed?.owed_minor ?? ride.fare_final_minor ?? 0;
  const receivedMinor = summary?.cash_received_minor ?? Number(ride.cash_received_minor ?? 0);
  const changeMinor = summary?.change_credit_minor ?? computed?.change_credit_minor ?? 0;
  const arrearsMinor = summary?.arrears_minor ?? computed?.arrears_minor ?? 0;

  const fare = formatMoneyMinor(ride.fare_final_minor ?? ride.fare_estimate_minor, currency);
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);
  const duration = formatTripDuration(ride);
  const distance = formatTripDistanceMi(ride.distance_estimate_km);

  const finish = () => {
    notifyWalletBalanceChanged();
    toast.success('Thanks for riding with Roam');
    navigate('/', { replace: true });
  };

  const handleShare = async () => {
    const changeLine = changeMinor > 0 ? ` — ${formatMoneyMinor(changeMinor, currency)} credited to wallet` : '';
    const text = `Cash trip from ${ride.pickup_address ?? 'pickup'} to ${ride.dropoff_address ?? 'drop-off'} — ${fare}${changeLine}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Roam cash trip summary', text });
        return;
      }
    } catch {
      /* user cancelled */
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Trip details copied');
    } catch {
      toast.message('Share', { description: text });
    }
  };

  const selectTip = (id: string) => {
    if (id === 'custom') {
      toast.message('Custom tip', { description: 'Coming soon' });
      return;
    }
    setSelectedTip((prev) => (prev === id ? null : id));
  };

  return (
    <div className="trip-summary-page">
      <header className="trip-summary-header">
        <button
          type="button"
          className="trip-summary-icon-btn"
          onClick={finish}
          aria-label="Close trip summary"
        >
          <X className="size-5" strokeWidth={2.25} />
        </button>
        <h1 className="trip-summary-header__title">Cash trip summary</h1>
        <button
          type="button"
          className="trip-summary-icon-btn"
          onClick={() => void handleShare()}
          aria-label="Share trip summary"
        >
          <Share2 className="size-5" strokeWidth={2.25} />
        </button>
      </header>

      <main className="trip-summary-main">
        <section className="trip-summary-cash-hero" aria-label="Cash payment details">
          <div className="trip-summary-cash-hero__icon" aria-hidden>
            <Banknote className="size-6" strokeWidth={2} />
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
            </div>
          ) : (
            <>
              {outcome === 'overpay' && changeMinor > 0 ? (
                <div className="trip-summary-cash-hero__highlight">
                  <p className="trip-summary-cash-hero__highlight-label">Change credited to wallet</p>
                  <p className="trip-summary-cash-hero__highlight-amount">
                    +{formatMoneyMinor(changeMinor, currency)}
                  </p>
                  <p className="trip-summary-cash-hero__highlight-sub">
                    Your driver collected more than the fare. The difference is in your Roam wallet.
                  </p>
                </div>
              ) : outcome === 'exact' ? (
                <div className="trip-summary-cash-hero__highlight trip-summary-cash-hero__highlight--exact">
                  <p className="trip-summary-cash-hero__highlight-label">Paid in cash</p>
                  <p className="trip-summary-cash-hero__highlight-amount">
                    {formatMoneyMinor(receivedMinor, currency)}
                  </p>
                  <p className="trip-summary-cash-hero__highlight-sub">Exact fare — no change due</p>
                </div>
              ) : outcome === 'underpay' || outcome === 'unpaid' ? (
                <div className="trip-summary-cash-hero__highlight trip-summary-cash-hero__highlight--arrears">
                  <p className="trip-summary-cash-hero__highlight-label">
                    {outcome === 'unpaid' ? 'Trip unpaid' : 'Partial payment'}
                  </p>
                  {arrearsMinor > 0 && (
                    <p className="trip-summary-cash-hero__highlight-amount">
                      {formatMoneyMinor(arrearsMinor, currency)} owed
                    </p>
                  )}
                  <p className="trip-summary-cash-hero__highlight-sub">
                    Outstanding balance added to your wallet — settle before your next cash trip.
                  </p>
                </div>
              ) : null}

              <div className="trip-summary-cash-hero__rows">
                <div className="trip-summary-cash-hero__row">
                  <span>Fare due</span>
                  <span className="tabular-nums font-medium">{formatMoneyMinor(owedMinor, currency)}</span>
                </div>
                <div className="trip-summary-cash-hero__row">
                  <span>Cash paid to driver</span>
                  <span className="tabular-nums font-medium">{formatMoneyMinor(receivedMinor, currency)}</span>
                </div>
                {changeMinor > 0 && (
                  <div className="trip-summary-cash-hero__row trip-summary-cash-hero__row--credit">
                    <span>Change to wallet</span>
                    <span className="tabular-nums font-semibold">
                      +{formatMoneyMinor(changeMinor, currency)}
                    </span>
                  </div>
                )}
                {arrearsMinor > 0 && (
                  <div className="trip-summary-cash-hero__row trip-summary-cash-hero__row--arrears">
                    <span>Outstanding balance</span>
                    <span className="tabular-nums font-semibold">
                      {formatMoneyMinor(arrearsMinor, currency)}
                    </span>
                  </div>
                )}
              </div>

              {outcome && (
                <p className="trip-summary-cash-hero__note">
                  {cashSettlementOutcomeMessage(outcome, ride)}
                </p>
              )}

              {wallet && (
                <div className="trip-summary-cash-hero__wallet">
                  <span className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" aria-hidden />
                    Wallet balance
                  </span>
                  <span className="font-bold tabular-nums">
                    {formatMoneyMinor(wallet.balance_minor, wallet.currency)}
                  </span>
                </div>
              )}

              <Link to={`/account/wallet?ride=${ride.id}`} className="trip-summary-cash-hero__link">
                View wallet transactions
              </Link>
            </>
          )}
        </section>

        <section className="trip-summary-stats" aria-label="Trip statistics">
          <div className="trip-summary-stats__cell">
            <span className="trip-summary-stats__label">Fare</span>
            <span className="trip-summary-stats__value">{fare}</span>
          </div>
          <div className="trip-summary-stats__cell trip-summary-stats__cell--mid">
            <span className="trip-summary-stats__label">Time</span>
            <span className="trip-summary-stats__value">{duration}</span>
          </div>
          <div className="trip-summary-stats__cell">
            <span className="trip-summary-stats__label">Dist</span>
            <span className="trip-summary-stats__value">{distance}</span>
          </div>
        </section>

        <section className="trip-summary-card" aria-label="Rate your driver">
          <div className="trip-summary-rating__avatar" aria-hidden>
            D
          </div>
          <h2 className="trip-summary-rating__title">Rate your driver</h2>
          <p className="trip-summary-rating__subtitle">How was your {serviceLabel} ride?</p>
          <div className="trip-summary-stars" role="group" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`trip-summary-star-btn ${value <= rating ? 'trip-summary-star-btn--active' : ''}`}
                onClick={() => setRating(value)}
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                aria-pressed={value <= rating}
              >
                <Star
                  className="size-9"
                  strokeWidth={1.75}
                  fill={value <= rating ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Add a tip">
          <h3 className="trip-summary-tips__label">Add a tip</h3>
          <div className="trip-summary-tips__grid">
            {TIP_PRESETS_JMD.map((tip) => (
              <button
                key={tip.id}
                type="button"
                className={`trip-summary-tip-btn ${
                  selectedTip === tip.id ? 'trip-summary-tip-btn--selected' : ''
                }`}
                onClick={() => selectTip(tip.id)}
              >
                {ride.currency === 'USD' ? `$${tip.label}` : `JMD ${tip.label}`}
              </button>
            ))}
            <button
              type="button"
              className={`trip-summary-tip-btn trip-summary-tip-btn--custom ${
                selectedTip === 'custom' ? 'trip-summary-tip-btn--selected' : ''
              }`}
              onClick={() => selectTip('custom')}
            >
              Custom
            </button>
          </div>
        </section>

        <button type="button" className="trip-summary-done" onClick={finish}>
          Done
        </button>
      </main>
    </div>
  );
}
