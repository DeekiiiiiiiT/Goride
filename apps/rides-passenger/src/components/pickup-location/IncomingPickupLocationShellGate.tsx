import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PICKUP_LOCATION_REQUEST } from '@/lib/pickupLocationRequestFlags';
import { useIncomingPickupLocationRequests } from '@/hooks/useIncomingPickupLocationRequests';
import {
  dismissPickupLocationRequestId,
  IncomingPickupLocationBanner,
  readDismissedPickupLocationRequestIds,
} from '@/components/pickup-location/IncomingPickupLocationBanner';

function shouldHideIncomingBanner(pathname: string): boolean {
  if (pathname.startsWith('/location-share/')) return true;
  if (pathname.startsWith('/login')) return true;
  if (pathname.startsWith('/admin')) return true;
  return false;
}

/** App-wide incoming pickup location banner — flag-gated, below top header. */
export function IncomingPickupLocationShellGate() {
  const { pathname } = useLocation();
  const { requests } = useIncomingPickupLocationRequests(PICKUP_LOCATION_REQUEST);
  const [dismissedRevision, setDismissedRevision] = useState(0);

  const dismissedIds = useMemo(() => {
    void dismissedRevision;
    return readDismissedPickupLocationRequestIds();
  }, [dismissedRevision]);

  const visibleRequest = useMemo(() => {
    if (!PICKUP_LOCATION_REQUEST || shouldHideIncomingBanner(pathname)) return null;
    return requests.find((r) => !dismissedIds.has(r.id)) ?? null;
  }, [pathname, requests, dismissedIds]);

  if (!visibleRequest) return null;

  const moreCount = Math.max(0, requests.length - 1);

  return (
    <IncomingPickupLocationBanner
      request={visibleRequest}
      moreCount={moreCount}
      onDismiss={(requestId) => {
        dismissPickupLocationRequestId(requestId);
        setDismissedRevision((n) => n + 1);
      }}
    />
  );
}
