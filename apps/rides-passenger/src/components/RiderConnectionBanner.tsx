import { Loader2, WifiOff } from 'lucide-react';

type Props = {
  isOnline: boolean;
  reconnecting?: boolean;
};

export function RiderConnectionBanner({ isOnline, reconnecting = false }: Props) {
  if (isOnline && !reconnecting) return null;

  return (
    <div
      className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900"
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
          You&apos;re offline — we&apos;ll update your trip when connection returns.
        </>
      )}
    </div>
  );
}
