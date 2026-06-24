import { StoreStatus } from '../../lib/partner-utils';

const STATUS_LABEL: Record<StoreStatus, string> = {
  open: 'Open',
  paused: 'Paused',
  closed: 'Closed',
};

interface StoreStatusToggleProps {
  storeStatus: StoreStatus;
  isAcceptingOrders: boolean;
  onToggle: (next: boolean) => void;
  pending?: boolean;
  size?: 'sm' | 'md';
  showHeading?: boolean;
  headingLabel?: string;
}

export default function StoreStatusToggle({
  storeStatus,
  isAcceptingOrders,
  onToggle,
  pending = false,
  size = 'sm',
  showHeading = false,
  headingLabel = 'Store Status',
}: StoreStatusToggleProps) {
  const label = STATUS_LABEL[storeStatus];
  const isClosed = storeStatus === 'closed';
  const switchTrack =
    size === 'sm'
      ? 'h-5 w-9 after:h-4 after:w-4 after:left-[2px] after:top-[2px]'
      : 'h-6 w-11 after:h-5 after:w-5 after:left-[2px] after:top-[2px]';

  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low shadow-sm ${
        size === 'sm' ? 'px-2 py-1' : 'gap-inset-xs px-inset-xs py-1'
      }`}
    >
      {showHeading && (
        <span className="hidden text-label-md font-semibold text-on-surface xl:inline">{headingLabel}</span>
      )}
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={isAcceptingOrders}
          disabled={pending || isClosed}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={`${label}. Tap to ${isAcceptingOrders ? 'pause' : 'open'} orders`}
        />
        <div
          className={`peer relative rounded-full bg-outline-variant transition-colors after:absolute after:rounded-full after:border after:border-outline-variant after:bg-white after:shadow-sm after:transition-all peer-checked:bg-primary-container peer-checked:after:translate-x-full peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${switchTrack}`}
        />
      </label>
        <span
        className={`min-w-[2.75rem] whitespace-nowrap font-semibold ${
          size === 'sm' ? 'hidden text-label-sm lg:inline' : 'text-label-md'
        } ${
          storeStatus === 'open'
            ? 'text-primary-container'
            : storeStatus === 'paused'
              ? 'text-on-surface-variant'
              : 'text-error'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
