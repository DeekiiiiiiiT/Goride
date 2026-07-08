import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  Car,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  Info,
  Share2,
  Star,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@roam/auth-client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { ActivityTripHistoryItem } from '@roam/types/rides';
import type { RideRequestRow } from '@roam/types/rides';
import {
  buildReceiptFareLines,
  formatReceiptAmount,
  receiptPassengerLabel,
  receiptPaymentLabel,
} from '@/lib/activityReceiptUtils';
import { TripTollReceiptSection } from '@roam/toll-ui';
import {
  INVERSE_SURFACE,
  ON_PRIMARY,
  ON_PRIMARY_FIXED,
  ON_SECONDARY_FIXED_VARIANT,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
  PRIMARY_FIXED_DIM,
  SECONDARY,
  SECONDARY_FIXED,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const GLASS_CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(0, 109, 67, 0.1)',
};

type ActivityTripReceiptSheetProps = {
  trip: ActivityTripHistoryItem;
  ride: RideRequestRow;
  onBack: () => void;
};

function formatReceiptLine(minor: number, currency: string): string {
  const amount = formatReceiptAmount(minor, currency);
  return `${currency} $${amount.replace(/^\$/, '')}`;
}

function notifySoon(label: string) {
  toast.message(label, { description: 'Coming soon' });
}

export function ActivityTripReceiptSheet({ trip, ride, onBack }: ActivityTripReceiptSheetProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const fare = buildReceiptFareLines(ride);
  const currency = fare.currency;
  const total = formatReceiptLine(fare.totalMinor, currency);
  const tripFare = formatReceiptLine(fare.tripFareMinor, currency);
  const subtotal = formatReceiptLine(fare.subtotalMinor, currency);
  const bookingFee = formatReceiptLine(fare.bookingFeeMinor, currency);
  const passengerLabel = receiptPassengerLabel(ride, trip.participant_role);
  const payment = receiptPaymentLabel(ride);
  const isCash = (ride.payment_method ?? 'cash') !== 'card';
  const isHire = passengerLabel !== 'your ride';
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) || null;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col safe-t safe-x"
      style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-receipt-title"
    >
      <header
        className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between px-5 shadow-sm"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full touch-manipulation transition-colors active:scale-95"
            style={{ color: PRIMARY }}
            aria-label="Back to trip details"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 id="activity-receipt-title" className="text-base font-bold" style={{ color: PRIMARY }}>
            Receipt
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate('/account/support')}
            className="flex h-10 w-10 items-center justify-center rounded-full touch-manipulation transition-colors active:scale-95"
            style={{ color: PRIMARY }}
            aria-label="Help"
          >
            <CircleHelp className="h-5 w-5" aria-hidden />
          </button>
          <div
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full"
            style={{ backgroundColor: SECONDARY_FIXED }}
            aria-hidden
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4" style={{ color: SECONDARY }} />
            )}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto pb-10">
        <section
          className="relative overflow-hidden px-5 pb-12 pt-8"
          style={{ backgroundColor: PRIMARY }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden>
            <div
              className="absolute right-0 top-0 h-64 w-64 rounded-full blur-[80px]"
              style={{ backgroundColor: PRIMARY_FIXED }}
            />
            <div
              className="absolute bottom-0 left-0 h-48 w-48 rounded-full blur-[60px]"
              style={{ backgroundColor: PRIMARY_CONTAINER }}
            />
          </div>

          <div className="relative z-10">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p
                  className="text-xs font-semibold uppercase tracking-widest opacity-80"
                  style={{ color: PRIMARY_FIXED }}
                >
                  Trip Summary
                </p>
                <h2
                  className="max-w-[250px] text-[2rem] font-bold leading-tight tracking-tight"
                  style={{ color: ON_PRIMARY }}
                >
                  {isHire ? "Here's your receipt for your hire" : "Here's your receipt for your ride"}
                </h2>
              </div>
              <div
                className="shrink-0 rounded-[1.5rem] border p-4 backdrop-blur-md"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                }}
                aria-hidden
              >
                <Car className="h-9 w-9" style={{ color: ON_PRIMARY }} strokeWidth={1.75} />
              </div>
            </div>
            {isHire ? (
              <p className="text-lg opacity-90" style={{ color: PRIMARY_FIXED }}>
                {passengerLabel}
              </p>
            ) : null}
          </div>
        </section>

        <div className="-mt-6 px-5">
          <section className="rounded-[1.5rem] p-6 shadow-sm" style={GLASS_CARD_STYLE}>
            <div className="mb-8 flex items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-sm font-semibold" style={{ color: SECONDARY }}>
                  Total Amount
                </p>
                <p
                  className="text-[2rem] font-extrabold leading-none tracking-tight tabular-nums"
                  style={{ color: PRIMARY }}
                >
                  {total}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--passenger-primary-container) 20%, transparent)',
                  color: PRIMARY_FIXED_DIM,
                }}
              >
                Paid
              </span>
            </div>

            <div className="mb-6 h-px w-full" style={{ backgroundColor: OUTLINE_VARIANT }} />

            <div className="space-y-0">
              <div className="flex items-center justify-between py-1">
                <span className="text-base" style={{ color: ON_SURFACE_VARIANT }}>Trip fare</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: ON_SURFACE }}>
                  {tripFare}
                </span>
              </div>

              <div
                className="flex items-center justify-between border-t py-6"
                style={{ borderColor: OUTLINE_VARIANT }}
              >
                <span className="text-base font-semibold" style={{ color: ON_SURFACE_VARIANT }}>
                  Subtotal
                </span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: ON_SURFACE }}>
                  {subtotal}
                </span>
              </div>

              {fare.bookingFeeMinor > 0 ? (
                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1 text-base" style={{ color: ON_SURFACE_VARIANT }}>
                    Booking fee
                    <button
                      type="button"
                      onClick={() => toast.message('Booking fee', { description: 'Service fee for using Roam.' })}
                      className="rounded-full p-0.5 touch-manipulation"
                      aria-label="Booking fee info"
                    >
                      <Info className="h-[18px] w-[18px]" style={{ color: OUTLINE }} aria-hidden />
                    </button>
                  </span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: ON_SURFACE }}>
                    {bookingFee}
                  </span>
                </div>
              ) : null}

              {fare.tipMinor > 0 ? (
                <div className="flex items-center justify-between py-1">
                  <span className="text-base" style={{ color: ON_SURFACE_VARIANT }}>Tip</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: ON_SURFACE }}>
                    {formatReceiptLine(fare.tipMinor, currency)}
                  </span>
                </div>
              ) : null}

              {Number(ride.actual_tolls_minor ?? 0) > 0 ? (
                <div className="mt-4 border-t pt-4" style={{ borderColor: OUTLINE_VARIANT }}>
                  <TripTollReceiptSection
                    baseMinor={fare.tripFareMinor}
                    actualTollsMinor={Number(ride.actual_tolls_minor ?? 0)}
                    estimatedTollsMinor={Number(ride.fare_breakdown?.estimated_tolls_minor ?? 0)}
                    waitTimeMinor={Number(ride.wait_time_fee_minor ?? 0)}
                    totalMinor={fare.totalMinor}
                    currency={currency}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-10">
              <h2
                className="mb-4 text-sm font-semibold uppercase tracking-wider"
                style={{ color: ON_SURFACE }}
              >
                Payments
              </h2>
              <div
                className="flex items-center justify-between gap-3 rounded-xl border p-4"
                style={{
                  backgroundColor: SURFACE_LOW,
                  borderColor: `${OUTLINE_VARIANT}4d`,
                }}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border shadow-sm"
                    style={{
                      backgroundColor: SURFACE_LOWEST,
                      borderColor: OUTLINE_VARIANT,
                      color: SECONDARY,
                    }}
                  >
                    {isCash ? (
                      <Banknote className="h-5 w-5" aria-hidden />
                    ) : (
                      <CreditCard className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: ON_SURFACE }}>
                      {payment.title}
                    </p>
                    <p className="text-xs" style={{ color: ON_SECONDARY_FIXED_VARIANT }}>
                      {payment.subtitle}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: ON_SURFACE }}>
                  {total}
                </span>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => notifySoon('Share receipt')}
                className="flex items-center justify-center gap-2 rounded-xl border py-4 text-sm font-semibold touch-manipulation transition-all active:scale-95"
                style={{
                  backgroundColor: SURFACE_LOWEST,
                  borderColor: PRIMARY,
                  color: PRIMARY,
                }}
              >
                <Share2 className="h-5 w-5" aria-hidden />
                Share
              </button>
              <button
                type="button"
                onClick={() => notifySoon('Download PDF')}
                className="flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold text-white touch-manipulation transition-all active:scale-95"
                style={{ backgroundColor: INVERSE_SURFACE }}
              >
                <Download className="h-5 w-5" aria-hidden />
                PDF
              </button>
            </div>

            {!fare.hasBreakdown ? (
              <p className="mt-6 flex items-start gap-2 text-xs leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Detailed fare breakdown is not available for this trip.
              </p>
            ) : null}
          </section>

          <button
            type="button"
            onClick={() => notifySoon('Rate your driver')}
            className="mt-6 flex w-full items-center gap-4 rounded-[1.5rem] border p-6 text-left touch-manipulation transition-colors active:scale-[0.99]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--passenger-primary-container) 10%, transparent)',
              borderColor: 'color-mix(in srgb, var(--passenger-primary) 20%, transparent)',
            }}
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: PRIMARY }}
            >
              <Star className="h-5 w-5 text-white" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: PRIMARY }}>How was your ride?</p>
              <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                Rate your driver and help us improve.
              </p>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} aria-hidden />
          </button>
        </div>
      </main>
    </div>
  );
}
