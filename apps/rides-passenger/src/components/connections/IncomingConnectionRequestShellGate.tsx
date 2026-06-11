import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import { useIncomingConnectionRequests } from '@/hooks/useIncomingConnectionRequests';
import {
  dismissConnectionRequestId,
  IncomingConnectionRequestBanner,
  readDismissedConnectionRequestIds,
} from '@/components/connections/IncomingConnectionRequestBanner';

function shouldHideIncomingBanner(pathname: string): boolean {
  if (pathname.startsWith('/account/contacts/pending')) return true;
  if (pathname.startsWith('/login')) return true;
  if (pathname.startsWith('/admin')) return true;
  return false;
}

/** App-wide incoming connection request banner — flag-gated. */
export function IncomingConnectionRequestShellGate() {
  const { pathname } = useLocation();
  const { requests } = useIncomingConnectionRequests(ROAM_CONNECTIONS);
  const [dismissedRevision, setDismissedRevision] = useState(0);

  const dismissedIds = useMemo(() => {
    void dismissedRevision;
    return readDismissedConnectionRequestIds();
  }, [dismissedRevision]);

  const visibleRequest = useMemo(() => {
    if (!ROAM_CONNECTIONS || shouldHideIncomingBanner(pathname)) return null;
    return requests.find((r) => !dismissedIds.has(r.id)) ?? null;
  }, [pathname, requests, dismissedIds]);

  if (!visibleRequest) return null;

  const moreCount = Math.max(0, requests.length - 1);

  return (
    <IncomingConnectionRequestBanner
      request={visibleRequest}
      moreCount={moreCount}
      onDismiss={(requestId) => {
        dismissConnectionRequestId(requestId);
        setDismissedRevision((n) => n + 1);
      }}
    />
  );
}
