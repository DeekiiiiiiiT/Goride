import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { toast } from '@/lib/toast';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  hasActiveOrder?: boolean;
  activeOrderId?: string;
  onRetry?: () => void;
};

export default function ConnectionErrorPage({
  onNavigate,
  hasActiveOrder = false,
  activeOrderId,
  onRetry,
}: Props) {
  const online = useNetworkStatus();

  const handleRetry = () => {
    if (!online) {
      toast.error('You are still offline. Check your connection and try again.');
      return;
    }
    if (onRetry) {
      onRetry();
      return;
    }
    window.location.reload();
  };

  return (
    <div className="bg-background min-h-dvh flex flex-col items-center justify-between p-4 pt-safe pb-safe antialiased">
      <div className="flex-1 w-full max-w-sm flex flex-col items-center justify-center text-center">
        <div className="w-48 h-48 mb-6 rounded-full overflow-hidden shadow-sm bg-surface-container flex items-center justify-center">
          <MaterialIcon name="wifi_off" className="text-on-surface-variant text-[64px]" />
        </div>

        <h1 className="text-headline-lg-mobile font-bold text-on-background mb-2">Something went wrong</h1>
        <p className="text-body-md text-on-surface-variant max-w-[280px] mx-auto mb-8">
          {online
            ? "We're having trouble connecting to our servers. Please try again."
            : 'You appear to be offline. Check your internet connection and try again.'}
        </p>

        <button
          type="button"
          onClick={handleRetry}
          className="bg-primary-container text-surface-container-lowest text-label-md font-semibold tracking-wide py-3 px-8 rounded-lg w-full max-w-[200px] shadow-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <MaterialIcon name="refresh" size={18} />
          Retry
        </button>
      </div>

      {hasActiveOrder && activeOrderId && (
        <button
          type="button"
          onClick={() => onNavigate('tracking', { orderId: activeOrderId })}
          className="w-full max-w-sm bg-surface-container-lowest shadow-[0px_10px_30px_rgba(0,0,0,0.08)] rounded-xl p-4 flex items-center justify-between border border-surface-variant mt-6 active:scale-[0.98] transition-transform text-left"
        >
          <div>
            <p className="text-label-md font-semibold text-on-surface">Track active order</p>
            <p className="text-body-sm text-on-surface-variant">Your delivery may still be on the way</p>
          </div>
          <MaterialIcon name="chevron_right" className="text-on-surface-variant" />
        </button>
      )}
    </div>
  );
}
