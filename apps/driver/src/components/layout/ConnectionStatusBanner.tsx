import React from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useOffline } from '../providers/OfflineProvider';

type Props = {
  reconnecting?: boolean;
};

/** Slim banner for active-trip screens when network is down or resyncing. */
export function ConnectionStatusBanner({ reconnecting = false }: Props) {
  const { isOnline } = useOffline();

  if (isOnline && !reconnecting) return null;

  return (
    <div
      className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
      aria-live="polite"
    >
      {reconnecting ? (
        <>
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          Reconnecting…
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          You&apos;re offline — your trip is still active. We&apos;ll sync when connection returns.
        </>
      )}
    </div>
  );
}
