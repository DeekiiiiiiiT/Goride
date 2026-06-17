import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Banknote, Loader2, Share2, Star, X } from 'lucide-react';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { RideRequestRow, SettlementSummaryDto, WalletBalanceDto } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  computeOutcomeFromRide,
  isSplitPaymentOutcome,
  resolveCashReceivedMinor,
  resolveCashSettlementOutcome,
  resolveRiderArrearsMinor,
  resolveWalletPaidMinor,
} from '@roam/types/cashSettlementDisplay';
import { notifyWalletBalanceChanged } from '@/lib/walletEvents';
import {
  ridesGetSettlementSummary,
  ridesGetDisputeInfo,
  ridesCreateDispute,
  type DisputeDto,
} from '@/services/ridesEdge';
import { walletGetBalance } from '@/services/walletEdge';
import { TripPaymentMethodSheet } from '@/components/TripPaymentMethodSheet';
import { PayArrearsSheet } from '@/components/wallet/PayArrearsSheet';
import { useDefaultPaymentMethod } from '@/hooks/useDefaultPaymentMethod';
import { CASH_SETTLEMENT_PAY_ARREARS_ENABLED } from '@/lib/cashSettlementFlags';
import { AlertTriangle, MessageSquare } from 'lucide-react';

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
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const { selectedMethod } = useDefaultPaymentMethod();
  const [dispute, setDispute] = useState<DisputeDto | null>(null);
  const [canFileDispute, setCanFileDispute] = useState(false);
  const [disputeReasons, setDisputeReasons] = useState<Record<string, string>>({});
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [filingDispute, setFilingDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeNotes, setDisputeNotes] = useState('');

  const currency = ride.currency ?? 'JMD';
  const computed = useMemo(() => computeOutcomeFromRide(ride), [ride]);
  const outcome =
    ride.cash_settlement_outcome ??
    summary?.outcome ??
    resolveCashSettlementOutcome(ride) ??
    computed?.outcome ??
    null;
  const isLegacyCashTrip = outcome == null && !loading;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [summaryRes, balanceRes, disputeRes] = await Promise.all([
          ridesGetSettlementSummary(ride.id).catch(() => null),
          walletGetBalance(currency).catch(() => null),
          ridesGetDisputeInfo(ride.id).catch(() => null),
        ]);
        if (cancelled) return;
        if (summaryRes?.summary) setSummary(summaryRes.summary);
        if (balanceRes?.wallet) {
          setWallet(balanceRes.wallet);
          notifyWalletBalanceChanged();
        }
        if (disputeRes) {
          setDispute(disputeRes.dispute);
          setCanFileDispute(disputeRes.can_file_dispute);
          setDisputeReasons(disputeRes.dispute_reasons ?? {});
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

  const owedMinor = summary?.owed_minor ?? computed?.owed_minor ?? ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0;
  const receivedMinor =
    resolveCashReceivedMinor(ride, summary) || (isLegacyCashTrip ? owedMinor : 0);
  const walletPaidMinor = resolveWalletPaidMinor(ride, {
    summary,
    receivedMinor,
    owedMinor,
    outcome,
  });
  const changeMinor = summary?.change_credit_minor ?? computed?.change_credit_minor ?? 0;
  const riderArrearsMinor = resolveRiderArrearsMinor(ride, {
    summary,
    receivedMinor,
    owedMinor,
    outcome,
  });
  const walletArrearsMinor = wallet?.arrears_minor ?? riderArrearsMinor;
  const payArrearsMinor = walletArrearsMinor > 0 ? walletArrearsMinor : riderArrearsMinor;
  const isSplit = outcome === 'split' || isSplitPaymentOutcome(outcome);
  const tripFullyPaid =
    isSplit ||
    outcome === 'exact' ||
    outcome === 'overpay' ||
    (outcome === 'underpay' && receivedMinor > 0 && walletPaidMinor > 0 && riderArrearsMinor === 0);

  const tripChangeCreditMinor = useMemo(() => {
    if (changeMinor > 0) return changeMinor;
    if (riderArrearsMinor > 0) return 0;
    return Math.max(0, receivedMinor + walletPaidMinor - owedMinor);
  }, [changeMinor, riderArrearsMinor, receivedMinor, walletPaidMinor, owedMinor]);

  const cashHeroStatus = (() => {
    if (isLegacyCashTrip) return 'Trip complete';
    if (outcome === 'unpaid') return 'No cash received';
    if (tripFullyPaid && tripChangeCreditMinor <= 0) return 'Paid in full';
    return null;
  })();

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

  const handleArrearsPaid = async () => {
    const balanceRes = await walletGetBalance(currency).catch(() => null);
    if (balanceRes?.wallet) {
      setWallet(balanceRes.wallet);
      notifyWalletBalanceChanged();
    }
    const summaryRes = await ridesGetSettlementSummary(ride.id).catch(() => null);
    if (summaryRes?.summary) setSummary(summaryRes.summary);
  };

  const handleFileDispute = async () => {
    if (filingDispute || !disputeReason) return;
    setFilingDispute(true);
    try {
      const result = await ridesCreateDispute(ride.id, disputeReason, disputeNotes);
      if (result.dispute_id) {
        toast.success('Dispute submitted successfully');
        setDisputeSheetOpen(false);
        setDispute({
          id: result.dispute_id,
          status: result.status,
          reason: disputeReason,
          disputed_amount_minor: riderArrearsMinor,
          resolution_amount_minor: null,
          rider_notes: disputeNotes || null,
          created_at: new Date().toISOString(),
          resolved_at: null,
        });
        setCanFileDispute(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not submit dispute';
      toast.error(msg);
    } finally {
      setFilingDispute(false);
    }
  };

  const disputeStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      open: 'Under review',
      under_review: 'Under review',
      resolved_rider_favor: 'Resolved in your favor',
      resolved_driver_favor: 'Resolved',
      resolved_partial: 'Partially resolved',
      rejected: 'Rejected',
    };
    return labels[status] ?? status;
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
              {cashHeroStatus ? (
                <p
                  className={`trip-summary-cash-hero__status${
                    tripFullyPaid ? ' trip-summary-cash-hero__status--success' : ''
                  }${outcome === 'unpaid' ? ' trip-summary-cash-hero__status--arrears' : ''}`}
                >
                  {cashHeroStatus}
                </p>
              ) : null}

              <div className="trip-summary-cash-hero__rows">
                <div className="trip-summary-cash-hero__row">
                  <span>Fare</span>
                  <span className="tabular-nums font-medium">{formatMoneyMinor(owedMinor, currency)}</span>
                </div>
                <div className="trip-summary-cash-hero__row">
                  <span>Cash you gave</span>
                  <span className="tabular-nums font-medium">{formatMoneyMinor(receivedMinor, currency)}</span>
                </div>
                {walletPaidMinor > 0 && (
                  <div className="trip-summary-cash-hero__row trip-summary-cash-hero__row--wallet">
                    <span>From your wallet</span>
                    <span className="tabular-nums font-semibold">
                      {formatMoneyMinor(walletPaidMinor, currency)}
                    </span>
                  </div>
                )}
                {tripChangeCreditMinor > 0 && (
                  <div className="trip-summary-cash-hero__row trip-summary-cash-hero__row--credit">
                    <span>Credited to your wallet</span>
                    <span className="tabular-nums font-semibold">
                      {formatMoneyMinor(tripChangeCreditMinor, currency)}
                    </span>
                  </div>
                )}
                {riderArrearsMinor > 0 && (
                  <div className="trip-summary-cash-hero__row trip-summary-cash-hero__row--arrears">
                    <span>Still owed</span>
                    <span className="tabular-nums font-semibold">
                      {formatMoneyMinor(riderArrearsMinor, currency)}
                    </span>
                  </div>
                )}
              </div>

              {payArrearsMinor > 0 && CASH_SETTLEMENT_PAY_ARREARS_ENABLED && !dispute && (
                <button
                  type="button"
                  className="trip-summary-pay-card-btn"
                  onClick={() => setPaymentSheetOpen(true)}
                >
                  Pay in Wallet
                </button>
              )}

              {dispute && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-amber-800">
                    <MessageSquare className="h-4 w-4" />
                    <span className="font-medium">Dispute {disputeStatusLabel(dispute.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-amber-700">
                    {disputeReasons[dispute.reason] ?? dispute.reason}
                  </p>
                  {dispute.resolution_amount_minor != null && dispute.resolution_amount_minor > 0 && (
                    <p className="mt-1 text-sm font-medium text-amber-800">
                      {formatMoneyMinor(dispute.resolution_amount_minor, currency)} credited to your wallet
                    </p>
                  )}
                </div>
              )}

              {riderArrearsMinor > 0 && canFileDispute && !dispute && (
                <button
                  type="button"
                  className="mt-3 flex items-center gap-2 text-sm text-slate-600 underline hover:text-slate-800"
                  onClick={() => setDisputeSheetOpen(true)}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Dispute this charge
                </button>
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

      <PayArrearsSheet
        open={paymentSheetOpen}
        onClose={() => setPaymentSheetOpen(false)}
        arrearsMinor={payArrearsMinor}
        currency={currency}
        onSuccess={() => void handleArrearsPaid()}
      />

      {disputeSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 animate-in slide-in-from-bottom max-h-[80vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Dispute this charge</h3>
              <button
                type="button"
                className="p-2 -mr-2 text-slate-400 hover:text-slate-600"
                onClick={() => setDisputeSheetOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              You are disputing a charge of {formatMoneyMinor(riderArrearsMinor, currency)}. Please select a
              reason and provide any additional details.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Reason for dispute
                </label>
                <div className="space-y-2">
                  {Object.entries(disputeReasons).map(([code, label]) => (
                    <label
                      key={code}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                        disputeReason === code ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="dispute-reason"
                        value={code}
                        checked={disputeReason === code}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        className="h-4 w-4 text-blue-600"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Additional details (optional)
                </label>
                <textarea
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  placeholder="Please provide any additional information..."
                  className="w-full rounded-lg border p-3 text-sm"
                  rows={3}
                />
              </div>

              <button
                type="button"
                className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void handleFileDispute()}
                disabled={filingDispute || !disputeReason}
              >
                {filingDispute ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Submitting...
                  </span>
                ) : (
                  'Submit dispute'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
