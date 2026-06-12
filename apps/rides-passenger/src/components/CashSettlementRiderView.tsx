import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  Headphones,
  MessageCircle,
  Star,
} from 'lucide-react';
import type { AssignedDriverSummaryDto } from '@roam/types/delegatedRide';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { CashPaymentCard } from '@/components/CashPaymentCard';
import { RiderRideChatWrap } from '@/components/RiderRideChatWrap';
import { RideChatUnreadDot } from '@roam/ride-chat';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import {
  resolveLockedFareMinor,
  showSettlementResultOnTripScreen,
} from '@roam/types/cashSettlementDisplay';
import {
  INVERSE_SURFACE,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SECONDARY,
  SURFACE_CONTAINER,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const DEFAULT_DRIVER_PHOTO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA93ctmei8OeV07C4xXen9YTDszxEqdbhEVrlLmzdCtwcRycMa7yF14tR06KTt6Id9zi9fpGu_7Us6XzD_RPpZrXpOg6eHuCLG8Ht3jsPpFbuntYWdJPrM0Usd3Q0x3AITlAk1TgB-DDskI6SA1RiD-7TH9nf1NV4Pk6mjetUyMfUphO2TyF0E4u0QfY0lYCrK8mK7x9k-9uu0BJh5qN_-oiNMlfTSZSji2SnPXLw3XSE0bYWq6uEivTvr9viY-9GFeMN8iXibp1NVa';

type Props = {
  ride: RideRequestRow;
  assignedDriver?: AssignedDriverSummaryDto | null;
  onMinimize: () => void;
  isFetching?: boolean;
  canChat?: boolean;
  /** After driver confirms exact/overpay — rider taps to open trip summary */
  onContinueToSummary?: () => void;
};

function CashSettlementFareCard({ ride }: { ride: RideRequestRow }) {
  const currency = ride.currency ?? 'JMD';
  const lockedMinor = resolveLockedFareMinor(ride);
  if (lockedMinor == null || !Number.isFinite(lockedMinor)) return null;

  const amountLabel = formatMoneyMinor(lockedMinor, currency);

  return (
    <div className="cash-settlement-glass z-10 flex w-full flex-col items-center rounded-[1.5rem] p-8 text-center">
      <div
        className="mb-6 rounded-full p-3"
        style={{ backgroundColor: 'color-mix(in srgb, var(--passenger-primary) 5%, transparent)' }}
      >
        <Banknote className="h-8 w-8" style={{ color: PRIMARY }} aria-hidden />
      </div>
      <p
        className="mb-2 text-sm font-semibold uppercase tracking-widest"
        style={{ color: SECONDARY }}
      >
        Total fare
      </p>
      <div className="mb-6 flex items-baseline tracking-tight">
        <span className="mr-1 text-2xl font-semibold" style={{ color: PRIMARY }}>
          {currency}
        </span>
        <span className="text-4xl font-bold tabular-nums" style={{ color: ON_SURFACE }}>
          {amountLabel}
        </span>
      </div>
      <div
        className="mb-6 h-px w-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--passenger-outline-variant) 30%, transparent)' }}
      />
      <p className="text-base leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
        Please hand the exact amount of{' '}
        <span className="font-bold" style={{ color: ON_SURFACE }}>
          {currency} {amountLabel}
        </span>{' '}
        to your driver now.
      </p>
    </div>
  );
}

function CashSettlementDriverCard({
  assignedDriver,
  serviceLabel,
  onChat,
  canChat,
  unreadCount,
}: {
  assignedDriver?: AssignedDriverSummaryDto | null;
  serviceLabel: string;
  onChat?: () => void;
  canChat?: boolean;
  unreadCount?: number;
}) {
  const driverPhoto = assignedDriver?.profile_photo_url?.trim() || DEFAULT_DRIVER_PHOTO;
  const driverName = assignedDriver?.display_name?.trim() || 'Your driver';
  const vehicleLabel = assignedDriver?.vehicle_label?.trim() || serviceLabel;

  return (
    <div className="cash-settlement-glass z-10 flex w-full items-center gap-4 rounded-[1.5rem] p-5">
      <div className="relative shrink-0">
        <img
          src={driverPhoto}
          alt=""
          className="h-16 w-16 rounded-full object-cover"
          style={{ filter: 'grayscale(0.2)' }}
        />
        <span
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2"
          style={{ backgroundColor: PRIMARY, borderColor: SURFACE_LOWEST, color: ON_PRIMARY }}
          aria-hidden
        >
          <Star className="h-3.5 w-3.5 fill-current" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-semibold" style={{ color: ON_SURFACE }}>
          {driverName}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ backgroundColor: SURFACE_CONTAINER, color: SECONDARY }}
          >
            {vehicleLabel}
          </span>
          <span className="text-xs font-bold" style={{ color: PRIMARY }}>
            4.9
          </span>
        </div>
      </div>
      {canChat && onChat ? (
        <button
          type="button"
          onClick={onChat}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-transform active:scale-95"
          style={{ borderColor: OUTLINE_VARIANT, color: SECONDARY }}
          aria-label="Message driver"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
          <RideChatUnreadDot show={(unreadCount ?? 0) > 0} className="right-0.5 top-0.5" />
        </button>
      ) : null}
    </div>
  );
}

export function CashSettlementRiderView({
  ride,
  assignedDriver,
  onMinimize,
  isFetching = false,
  canChat = false,
  onContinueToSummary,
}: Props) {
  const navigate = useNavigate();
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);
  const showResult =
    ride.status === 'completed' &&
    showSettlementResultOnTripScreen(ride.cash_settlement_outcome);
  const driverName = assignedDriver?.display_name?.trim() || 'your driver';

  const content = (openChat?: () => void, unreadCount?: number) => (
    <div className="cash-settlement-page">
      <header className="safe-t safe-x z-10 flex w-full items-center px-6 py-4">
        {!showResult ? (
          <button
            type="button"
            onClick={onMinimize}
            className="-ml-2 rounded-full p-2 transition-opacity active:opacity-70 passenger-row-hover"
            style={{ color: PRIMARY }}
            aria-label="Minimize"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <span className="w-10" aria-hidden />
        )}
        <h1
          className="ml-4 text-sm font-semibold uppercase tracking-widest"
          style={{ color: ON_SURFACE_VARIANT }}
        >
          {showResult ? 'Payment complete' : 'Pay your driver'}
        </h1>
      </header>

      <main className={`safe-x relative flex flex-1 flex-col items-center overflow-hidden px-6 ${showResult ? '' : 'pb-28'}`}>
        <div className="cash-settlement-watermark" aria-hidden>
          <Banknote className="h-[400px] w-[400px] stroke-[0.5]" />
        </div>

        <div className="z-10 mt-2 flex w-full max-w-lg flex-1 flex-col">
          {showResult ? (
            <div className="space-y-5">
              <CashPaymentCard ride={ride} variant="settlement_result" />
              <button
                type="button"
                onClick={onContinueToSummary}
                className="w-full rounded-xl py-4 text-sm font-semibold tracking-wide transition-transform active:scale-95"
                style={{ backgroundColor: INVERSE_SURFACE, color: ON_PRIMARY }}
              >
                Continue
              </button>
            </div>
          ) : (
            <>
              <CashSettlementFareCard ride={ride} />

              <div className="mt-6">
                <CashSettlementDriverCard
                  assignedDriver={assignedDriver}
                  serviceLabel={serviceLabel}
                  onChat={openChat}
                  canChat={canChat}
                  unreadCount={unreadCount}
                />
              </div>

              <div className="mb-10 mt-auto flex w-full flex-col items-center gap-4 py-8">
                <div className="flex items-center gap-3">
                  <div
                    className={`cash-settlement-orbit h-5 w-5 rounded-full border-2 border-t-transparent ${isFetching ? '' : 'opacity-80'}`}
                    style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }}
                    aria-hidden
                  />
                  <p
                    className="cash-settlement-pulse text-sm font-semibold uppercase tracking-wide"
                    style={{ color: ON_SURFACE_VARIANT }}
                  >
                    Waiting for confirmation…
                  </p>
                </div>
                <p className="max-w-xs px-4 text-center text-xs leading-relaxed" style={{ color: SECONDARY }}>
                  The trip will automatically close once {driverName} confirms receipt of the cash.
                </p>
              </div>
            </>
          )}
        </div>
      </main>

      {!showResult ? (
        <footer
          className="safe-x fixed bottom-0 left-0 z-50 w-full border-t px-4 py-6"
          style={{
            backgroundColor: SURFACE_LOWEST,
            borderColor: OUTLINE_VARIANT,
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/account/support')}
            className="mx-auto flex w-full max-w-lg items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold uppercase tracking-wider transition-transform active:scale-95"
            style={{ backgroundColor: INVERSE_SURFACE, color: ON_PRIMARY }}
          >
            <Headphones className="h-5 w-5" aria-hidden />
            Need help?
          </button>
        </footer>
      ) : null}
    </div>
  );

  if (!canChat || showResult) {
    return content();
  }

  return (
    <RiderRideChatWrap ride={ride} participantRole="passenger">
      {(openChat, { unreadCount }) => content(openChat, unreadCount)}
    </RiderRideChatWrap>
  );
}
