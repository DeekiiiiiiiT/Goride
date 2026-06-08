import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, MapPin, Tag, UserPlus } from 'lucide-react';
import type {
  BookForOthersIntentActivityItem,
  BookForOthersMeActivityItem,
  BookForOthersRideActivityItem,
  BookForOthersSomeoneActivityItem,
} from '@roam/types/riderContacts';
import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';
import { liveRideStatusHeadline } from '@/components/LiveRideView';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { formatFareMinor } from '@/services/tripIntentEdge';
import { OPEN_ROAM_LABEL, SHADOW_ROAM_LABEL } from '@/lib/tripIntentCopy';
import {
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

function intentStatusLabel(status: string): string {
  if (status === 'draft') return 'Finish setting up your trip';
  if (status === 'published') return 'Waiting for someone to pay';
  if (status === 'claimed') return 'Someone is booking your ride';
  if (status === 'booked') return 'Ride is being confirmed';
  return 'Trip request live';
}

function bookerIntentStatusLabel(status: string): string {
  if (status === 'published') return 'Requested you to pay';
  if (status === 'claimed') return 'Ready for you to pay';
  if (status === 'booked') return 'Confirming ride';
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
  const route = formatShortAddress(item.pickup_address);
  return (
    <ActivityRow
      title={`Ride for ${name}`}
      subtitle={rideStatusLabel(item.status as RideRequestStatus)}
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
  const fare =
    item.fare_estimate_minor && item.currency
      ? formatFareMinor(item.fare_estimate_minor, item.currency)
      : null;
  const subtitle = fare
    ? `${bookerIntentStatusLabel(item.status)} · ${fare}`
    : bookerIntentStatusLabel(item.status);
  return (
    <ActivityRow
      title={`Pay for ${name}`}
      subtitle={subtitle}
      detail={formatShortAddress(item.pickup_address)}
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
}: {
  item: BookForOthersMeActivityItem;
  onOpen: (item: BookForOthersMeActivityItem) => void;
}) {
  if (item.kind === 'trip_intent') {
    return <MeIntentRow item={item} onOpen={onOpen} />;
  }
  return <MeRideRow item={item} onOpen={onOpen} />;
}

function MeIntentRow({
  item,
  onOpen,
}: {
  item: BookForOthersIntentActivityItem;
  onOpen: (item: BookForOthersMeActivityItem) => void;
}) {
  const fare =
    item.fare_estimate_minor && item.currency
      ? formatFareMinor(item.fare_estimate_minor, item.currency)
      : null;
  const subtitle = fare
    ? `${intentStatusLabel(item.status)} · ${fare}`
    : intentStatusLabel(item.status);
  return (
    <ActivityRow
      title={`Your tag · ${roamModeLabel(item.roam_mode)}`}
      subtitle={subtitle}
      detail={formatShortAddress(item.pickup_address)}
      onClick={() => onOpen(item)}
    />
  );
}

function MeRideRow({
  item,
  onOpen,
}: {
  item: BookForOthersRideActivityItem;
  onOpen: (item: BookForOthersMeActivityItem) => void;
}) {
  return (
    <ActivityRow
      title="Your ride"
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
  const [tab, setTab] = useState<ActivityTab>('someone');
  const [userPickedTab, setUserPickedTab] = useState(false);

  useEffect(() => {
    if (userPickedTab || loading) return;
    if (bookForMe.length > 0 && bookForSomeone.length === 0) {
      setTab('me');
    } else if (bookForSomeone.length > 0) {
      setTab('someone');
    }
  }, [bookForSomeone.length, bookForMe.length, loading, userPickedTab]);

  const openSomeoneRide = (item: BookForOthersRideActivityItem) => {
    if (item.roam_mode === 'shadow_roam') {
      navigate(`/shadow-trip/${item.ride_id}`);
      return;
    }
    navigate(`/ride/${item.ride_id}`);
  };

  const openSomeoneIntent = (item: BookForOthersIntentActivityItem) => {
    navigate('/services/book-for-someone', { state: { tripIntentId: item.intent_id } });
  };

  const openMeItem = (item: BookForOthersMeActivityItem) => {
    if (item.kind === 'trip_intent') {
      navigate('/services/book-for-me');
      return;
    }
    navigate(`/ride/${item.ride_id}`);
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
              <MeItemRow item={item} onOpen={openMeItem} />
            </React.Fragment>
          ))}
        </ActivityPanel>
      )}
    </section>
  );
}
