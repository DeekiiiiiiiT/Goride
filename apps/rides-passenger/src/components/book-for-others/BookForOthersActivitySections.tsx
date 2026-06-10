import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Loader2, MapPin, X } from 'lucide-react';
import type {
  BookForOthersIntentActivityItem,
  BookForOthersMeActivityItem,
  BookForOthersRideActivityItem,
  BookForOthersSomeoneActivityItem,
} from '@roam/types/riderContacts';
import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';
import type { TripIntentBookerViewDto } from '@roam/types/riderContacts';
import { liveRideStatusHeadline } from '@/components/LiveRideView';
import { TripIntentBookSheet } from '@/components/trip-intent/TripIntentBookSheet';
import { TRIP_INTENT_V2 } from '@/lib/tripIntentFlags';
import { formatShortAddress } from '@/lib/formatRideAddress';
import {
  formatFareMinor,
  tripIntentClaim,
  tripIntentGetBookerView,
  tripIntentReject,
  tripIntentWithdraw,
} from '@/services/tripIntentEdge';
import { OPEN_ROAM_LABEL, SHADOW_ROAM_LABEL } from '@/lib/tripIntentCopy';
import { navigateToDelegatedRide } from '@/lib/delegatedRideNavigation';
import { bookerVisibleAddress } from '@/lib/shadowBookerPrivacy';
import {
  ERROR,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
} from '@/lib/passengerTheme';

type ActivityTab = 'someone' | 'me';

function rideStatusLabel(status: RideRequestStatus): string {
  if (status === 'matching') return 'Finding a driver';
  return liveRideStatusHeadline(status, {} as RideRequestRow);
}

function formatBookCountdown(bookByAt: string | null | undefined): string | null {
  if (!bookByAt) return null;
  const ms = new Date(bookByAt).getTime() - Date.now();
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function intentStatusLabel(status: string, linkedRideStatus?: string | null, bookByAt?: string | null): string {
  if (status === 'booked' && linkedRideStatus === 'cancelled') return 'Ride ended — cancel to remove';
  if (status === 'draft') return 'Finish setting up your trip';
  if (status === 'published') return 'Waiting for payer to agree';
  if (status === 'claimed') {
    const countdown = formatBookCountdown(bookByAt);
    return countdown ? `Payer agreed — book within ${countdown}` : 'Payer agreed — book your ride';
  }
  if (status === 'booked') return 'Finding a driver';
  return 'Trip request live';
}

function bookerIntentStatusLabel(status: string): string {
  if (status === 'published') return 'Requested you to pay';
  if (status === 'claimed') return 'Agreed — waiting for rider to book';
  if (status === 'booked') return 'Finding a driver';
  return 'Payment requested';
}

function roamModeLabel(mode: string): string {
  return mode === 'shadow_roam' ? SHADOW_ROAM_LABEL : OPEN_ROAM_LABEL;
}

function ActivityRow({
  title,
  subtitle,
  detail,
  onClick,
}: {
  title: string;
  subtitle: string;
  detail?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left touch-manipulation transition-colors active:bg-black/[0.03]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: ON_SURFACE }}>
          {title}
        </p>
        <p className="mt-0.5 truncate text-[12px]" style={{ color: PRIMARY }}>
          {subtitle}
        </p>
        {detail ? (
          <p className="mt-1 flex items-center gap-1 truncate text-[11px]" style={{ color: ON_SURFACE_VARIANT }}>
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            {detail}
          </p>
        ) : null}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE_VARIANT }} aria-hidden />
    </button>
  );
}

function SomeoneRideRow({
  item,
  onOpen,
}: {
  item: BookForOthersRideActivityItem;
  onOpen: (item: BookForOthersRideActivityItem) => void;
}) {
  const name = item.counterparty_name?.trim() || 'Passenger';
  const isShadow = item.roam_mode === 'shadow_roam';
  const route = isShadow
    ? 'Locations private'
    : bookerVisibleAddress(item.roam_mode, 'booker', item.pickup_address)
      ? formatShortAddress(item.pickup_address)
      : null;
  return (
    <ActivityRow
      title={`Ride for ${name}`}
      subtitle={isShadow ? 'Trip in progress' : rideStatusLabel(item.status as RideRequestStatus)}
      detail={route}
      onClick={() => onOpen(item)}
    />
  );
}

function SomeoneIntentRow({
  item,
  onOpen,
}: {
  item: BookForOthersIntentActivityItem;
  onOpen: (item: BookForOthersIntentActivityItem) => void;
}) {
  const name = item.requester_name?.trim() || 'Rider';
  const isShadow = item.roam_mode === 'shadow_roam';
  const fare =
    item.fare_estimate_minor && item.currency
      ? formatFareMinor(item.fare_estimate_minor, item.currency)
      : null;
  const subtitle = fare
    ? `${bookerIntentStatusLabel(item.status)} · ${fare}`
    : bookerIntentStatusLabel(item.status);
  const detail = isShadow
    ? 'Locations private'
    : bookerVisibleAddress(item.roam_mode, 'booker', item.pickup_address)
      ? formatShortAddress(item.pickup_address)
      : null;
  return (
    <ActivityRow
      title={`Pay for ${name}`}
      subtitle={subtitle}
      detail={detail}
      onClick={() => onOpen(item)}
    />
  );
}

function SomeoneItemRow({
  item,
  onOpenRide,
  onOpenIntent,
}: {
  item: BookForOthersSomeoneActivityItem;
  onOpenRide: (item: BookForOthersRideActivityItem) => void;
  onOpenIntent: (item: BookForOthersIntentActivityItem) => void;
}) {
  if (item.kind === 'trip_intent') {
    return <SomeoneIntentRow item={item} onOpen={onOpenIntent} />;
  }
  return <SomeoneRideRow item={item} onOpen={onOpenRide} />;
}

function MeItemRow({
  item,
  onOpen,
  onCancelIntent,
  cancellingIntentId,
}: {
  item: BookForOthersMeActivityItem;
  onOpen: (item: BookForOthersMeActivityItem) => void;
  onCancelIntent: (item: BookForOthersIntentActivityItem) => void;
  cancellingIntentId: string | null;
}) {
  if (item.kind === 'trip_intent') {
    return (
      <MeIntentRow
        item={item}
        onOpen={onOpen}
        onCancel={onCancelIntent}
        cancelling={cancellingIntentId === item.intent_id}
      />
    );
  }
  return <MeRideRow item={item} onOpen={onOpen} />;
}

function MeIntentRow({
  item,
  onOpen,
  onCancel,
  cancelling,
}: {
  item: BookForOthersIntentActivityItem;
  onOpen: (item: BookForOthersMeActivityItem) => void;
  onCancel: (item: BookForOthersIntentActivityItem) => void;
  cancelling: boolean;
}) {
  const fare =
    item.fare_estimate_minor && item.currency
      ? formatFareMinor(item.fare_estimate_minor, item.currency)
      : null;
  const statusLine = intentStatusLabel(item.status, item.linked_ride_status, item.book_by_at);
  const subtitle = fare ? `${statusLine} · ${fare}` : statusLine;
  const showCancel = item.can_cancel !== false;
  const staleRide = item.linked_ride_status === 'cancelled';

  return (
    <div className="flex items-stretch gap-1 px-4 py-3.5">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left touch-manipulation transition-colors active:opacity-80"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: ON_SURFACE }}>
            {`Your tag · ${roamModeLabel(item.roam_mode)}`}
          </p>
          <p
            className="mt-0.5 truncate text-[12px]"
            style={{ color: staleRide ? ERROR : PRIMARY }}
          >
            {subtitle}
          </p>
          {item.pickup_address ? (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px]" style={{ color: ON_SURFACE_VARIANT }}>
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {formatShortAddress(item.pickup_address)}
            </p>
          ) : null}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE_VARIANT }} aria-hidden />
      </button>
      {showCancel ? (
        <button
          type="button"
          disabled={cancelling}
          onClick={(event) => {
            event.stopPropagation();
            onCancel(item);
          }}
          className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold touch-manipulation transition-colors active:opacity-80 disabled:opacity-50"
          style={{
            color: ERROR,
            backgroundColor: 'rgba(220, 38, 38, 0.08)',
          }}
          aria-label="Cancel trip"
        >
          {cancelling ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              <X className="h-4 w-4" aria-hidden />
              <span>Cancel</span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function MeRideRow({
  item,
  onOpen,
}: {
  item: BookForOthersRideActivityItem;
  onOpen: (item: BookForOthersMeActivityItem) => void;
}) {
  const payerName = item.counterparty_name?.trim();
  const title = payerName ? `Ride · paid by ${payerName}` : 'Your ride';
  return (
    <ActivityRow
      title={title}
      subtitle={rideStatusLabel(item.status as RideRequestStatus)}
      detail={formatShortAddress(item.pickup_address)}
      onClick={() => onOpen(item)}
    />
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="relative flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-center text-[13px] font-semibold leading-tight touch-manipulation transition-all"
      style={{
        color: active ? PRIMARY : ON_SURFACE_VARIANT,
        backgroundColor: active ? '#FFFFFF' : 'transparent',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      <span className="truncate">{label}</span>
      {count > 0 ? (
        <span
          className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
          style={{
            backgroundColor: active ? PRIMARY : 'rgba(0,74,198,0.12)',
            color: active ? '#FFFFFF' : PRIMARY,
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function ActivityPanel({
  emptyLabel,
  loading,
  children,
}: {
  emptyLabel: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  const hasItems = React.Children.count(children) > 0;

  return (
    <div
      className="services-menu-card overflow-hidden rounded-2xl"
      role="tabpanel"
    >
      {hasItems ? (
        children
      ) : (
        <p className="px-4 py-8 text-center text-[12px] leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
          {loading ? 'Loading active trips…' : emptyLabel}
        </p>
      )}
    </div>
  );
}

export function BookForOthersActivitySections({
  bookForSomeone,
  bookForMe,
  loading,
}: {
  bookForSomeone: BookForOthersSomeoneActivityItem[];
  bookForMe: BookForOthersMeActivityItem[];
  loading: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ActivityTab>('someone');
  const [userPickedTab, setUserPickedTab] = useState(false);
  const [cancellingIntentId, setCancellingIntentId] = useState<string | null>(null);
  const [intentSheetOpen, setIntentSheetOpen] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<TripIntentBookerViewDto | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [fulfilling, setFulfilling] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const hasClaimed = [...bookForSomeone, ...bookForMe].some(
      (item) => item.kind === 'trip_intent' && item.status === 'claimed' && item.book_by_at,
    );
    if (!hasClaimed) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [bookForSomeone, bookForMe]);
  void tick;

  useEffect(() => {
    if (userPickedTab || loading) return;
    const meHasLiveRide = bookForMe.some((item) => item.kind === 'ride');
    const someoneHasLiveRide = bookForSomeone.some((item) => item.kind === 'ride');
    if (meHasLiveRide && !someoneHasLiveRide) {
      setTab('me');
    } else if (someoneHasLiveRide && !meHasLiveRide) {
      setTab('someone');
    } else if (bookForMe.length > 0 && bookForSomeone.length === 0) {
      setTab('me');
    } else if (bookForSomeone.length > 0 && bookForMe.length === 0) {
      setTab('someone');
    }
  }, [bookForSomeone, bookForMe, loading, userPickedTab]);

  const openSomeoneRide = (item: BookForOthersRideActivityItem) => {
    navigateToDelegatedRide(navigate, item.ride_id, 'booker', item.roam_mode);
  };

  const openSomeoneIntent = (item: BookForOthersIntentActivityItem) => {
    if (item.status === 'booked' && item.ride_request_id) {
      navigateToDelegatedRide(navigate, item.ride_request_id, 'booker', item.roam_mode);
      return;
    }
    if (item.status === 'claimed') {
      toast.message('Waiting for the rider to book this trip');
      return;
    }
    if (!TRIP_INTENT_V2) {
      navigate('/services/book-for-someone', { state: { tripIntentId: item.intent_id } });
      return;
    }

    setIntentLoading(true);
    void tripIntentGetBookerView(item.intent_id)
      .then((res) => {
        const canCommit = res.trip_intent?.can_commit ?? res.trip_intent?.can_fulfill;
        if (!canCommit) {
          toast.error('This trip is no longer available to pay for.');
          return;
        }
        setPendingIntent(res.trip_intent);
        setIntentSheetOpen(true);
      })
      .catch(() => {
        toast.error('Could not load that trip request.');
      })
      .finally(() => {
        setIntentLoading(false);
      });
  };

  const closeIntentSheet = () => {
    setIntentSheetOpen(false);
    setPendingIntent(null);
  };

  const handleIntentCommit = async (intent: TripIntentBookerViewDto) => {
    setFulfilling(true);
    try {
      await tripIntentClaim(intent.intent_id);
      closeIntentSheet();
      await queryClient.invalidateQueries({ queryKey: ['book-for-others', 'activity'] });
      toast.success('You agreed to pay for this trip');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not agree to pay');
    } finally {
      setFulfilling(false);
    }
  };

  const handleIntentReject = async (intent: TripIntentBookerViewDto) => {
    setRejecting(true);
    try {
      await tripIntentReject(intent.intent_id);
      closeIntentSheet();
      await queryClient.invalidateQueries({ queryKey: ['book-for-others', 'activity'] });
      toast.message('Trip request declined');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not decline trip');
    } finally {
      setRejecting(false);
    }
  };

  const openMeItem = (item: BookForOthersMeActivityItem) => {
    if (item.kind === 'trip_intent') {
      if (item.status === 'booked' && item.ride_request_id && item.linked_ride_status !== 'cancelled') {
        navigateToDelegatedRide(navigate, item.ride_request_id, 'passenger', item.roam_mode);
        return;
      }
      navigate('/services/book-for-me');
      return;
    }
    navigateToDelegatedRide(navigate, item.ride_id, 'passenger', item.roam_mode);
  };

  const cancelMeIntent = async (item: BookForOthersIntentActivityItem) => {
    setCancellingIntentId(item.intent_id);
    try {
      await tripIntentWithdraw(item.intent_id);
      await queryClient.invalidateQueries({ queryKey: ['book-for-others', 'activity'] });
      toast.message('Trip cancelled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not cancel trip');
    } finally {
      setCancellingIntentId(null);
    }
  };

  const selectTab = (next: ActivityTab) => {
    setUserPickedTab(true);
    setTab(next);
  };

  const isSomeone = tab === 'someone';
  const panelLoading = loading && (isSomeone ? bookForSomeone.length === 0 : bookForMe.length === 0);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between px-0.5">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: ON_SURFACE }}>
          Active trips
        </h2>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: ON_SURFACE_VARIANT }} aria-hidden />
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Trip type"
        className="mb-3 grid grid-cols-2 gap-1 rounded-2xl p-1"
        style={{ backgroundColor: SURFACE_LOW }}
      >
        <TabButton
          active={isSomeone}
          label="For someone"
          count={bookForSomeone.length}
          onClick={() => selectTab('someone')}
        />
        <TabButton
          active={!isSomeone}
          label="For me"
          count={bookForMe.length}
          onClick={() => selectTab('me')}
        />
      </div>

      {isSomeone ? (
        <ActivityPanel
          emptyLabel="No trips waiting for you to book or pay for."
          loading={panelLoading}
        >
          {bookForSomeone.map((item, index) => (
            <React.Fragment key={item.kind === 'trip_intent' ? item.intent_id : item.ride_id}>
              {index > 0 ? <div className="mx-4 h-px bg-black/[0.06]" /> : null}
              <SomeoneItemRow
                item={item}
                onOpenRide={openSomeoneRide}
                onOpenIntent={openSomeoneIntent}
              />
            </React.Fragment>
          ))}
        </ActivityPanel>
      ) : (
        <ActivityPanel
          emptyLabel="No live tag trips or rides waiting for you."
          loading={panelLoading}
        >
          {bookForMe.map((item, index) => (
            <React.Fragment key={item.kind === 'trip_intent' ? item.intent_id : item.ride_id}>
              {index > 0 ? <div className="mx-4 h-px bg-black/[0.06]" /> : null}
              <MeItemRow
                item={item}
                onOpen={openMeItem}
                onCancelIntent={cancelMeIntent}
                cancellingIntentId={cancellingIntentId}
              />
            </React.Fragment>
          ))}
        </ActivityPanel>
      )}

      <TripIntentBookSheet
        open={intentSheetOpen}
        intent={pendingIntent}
        accepting={fulfilling || intentLoading}
        rejecting={rejecting}
        onClose={closeIntentSheet}
        onAccept={(intent) => void handleIntentCommit(intent)}
        onReject={(intent) => void handleIntentReject(intent)}
      />
    </section>
  );
}
