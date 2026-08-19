import { MaterialIcon } from '@/components/icons/MaterialIcon';

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
  const handleRetry = () => {
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
          We&apos;re having trouble connecting to our servers. Please check your internet connection and try again.
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
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary">
              <MaterialIcon name="local_dining" filled />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wider mb-0.5">
                Active Order
              </span>
              <span className="text-label-md font-semibold tracking-wide text-on-background">View your order</span>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
                <span className="text-label-sm font-medium text-primary-container">In progress</span>
              </div>
            </div>
          </div>
          <div className="flex items-center text-primary">
            <span className="text-label-sm font-medium mr-1">View Details</span>
            <MaterialIcon name="chevron_right" size={16} />
          </div>
        </button>
      )}
    </div>
  );
}
