import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Clock, Loader2, Navigation } from 'lucide-react';
import { liveRideStatusHeadline } from '@/components/LiveRideView';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { navigateToDelegatedRide } from '@/lib/delegatedRideNavigation';
import { shadowBookerBannerCopy } from '@/lib/shadowBookerPrivacy';
import { ON_SURFACE, ON_SURFACE_VARIANT, PRIMARY, PRIMARY_CONTAINER } from '@/lib/passengerTheme';
import { resolveActiveRideForHub } from '@/services/bookForOthersEdge';
import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';

export function BookForOthersActiveTripBanner() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['book-for-others', 'active-ride'],
    queryFn: resolveActiveRideForHub,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading && !data) return null;
  if (!data?.ride) return null;

  const ride = data.ride;
  const isBooker = data.participant_role === 'booker';
  const roamMode = ride.roam_mode ?? null;
  const passengerName = ride.guest_passenger_name?.trim() || 'Passenger';
  const shadowCopy = shadowBookerBannerCopy(isBooker, passengerName, roamMode);
  const isShadowBooker = isBooker && roamMode === 'shadow_roam';

  const title = isShadowBooker
    ? shadowCopy.title
    : isBooker
      ? `Live trip for ${passengerName}`
      : 'Your live trip';
  const subtitle = isShadowBooker
    ? shadowCopy.subtitle
    : liveRideStatusHeadline(ride.status as RideRequestStatus, ride as RideRequestRow);
  const detail = isShadowBooker
    ? null
    : formatShortAddress(ride.pickup_address);

  const handleOpen = () => {
    if (isBooker) {
      navigateToDelegatedRide(navigate, ride.id, data.participant_role, roamMode);
      return;
    }
    navigate(`/ride/${ride.id}`);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="mb-4 flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left touch-manipulation active:scale-[0.99]"
      style={{
        backgroundColor: PRIMARY_CONTAINER,
        borderColor: 'rgba(0,74,198,0.18)',
      }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: '#FFFFFF', color: PRIMARY }}
        aria-hidden
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isShadowBooker ? (
          <Clock className="h-5 w-5" strokeWidth={2} />
        ) : (
          <Navigation className="h-5 w-5" strokeWidth={2} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold" style={{ color: ON_SURFACE }}>
          {title}
        </span>
        <span
          className={`block text-[12px] font-medium ${isShadowBooker ? 'whitespace-normal leading-snug' : 'truncate'}`}
          style={{ color: isShadowBooker ? ON_SURFACE_VARIANT : PRIMARY }}
        >
          {subtitle}
        </span>
        {detail ? (
          <span className="block truncate text-[11px]" style={{ color: ON_SURFACE_VARIANT }}>
            {detail}
          </span>
        ) : null}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} aria-hidden />
    </button>
  );
}
