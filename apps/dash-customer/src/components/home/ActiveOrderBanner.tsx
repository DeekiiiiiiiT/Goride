import { MaterialIcon } from '@/components/icons/MaterialIcon';

export type ActiveOrderBannerOrder = {
  id: string;
  orderNumber: string;
  merchantName: string;
  eta?: string;
  trackingStatus?: string;
};

type ActiveOrderBannerProps = {
  order: ActiveOrderBannerOrder;
  onTrack: () => void;
};

function statusLabel(trackingStatus?: string): string {
  const s = (trackingStatus ?? '').toLowerCase();
  if (s.includes('deliver') || s === 'on_the_way' || s === 'picked_up') {
    return 'Your order is on the way!';
  }
  if (s.includes('prepar') || s === 'accepted' || s === 'confirmed') {
    return 'Your order is being prepared';
  }
  if (s.includes('ready')) return 'Your order is ready for pickup';
  return 'Your order is in progress';
}

function progressStep(trackingStatus?: string): 1 | 2 | 3 {
  const s = (trackingStatus ?? '').toLowerCase();
  if (s.includes('deliver') || s === 'on_the_way' || s === 'picked_up' || s === 'arriving') {
    return 2;
  }
  if (s.includes('complet') || s === 'delivered') return 3;
  return 1;
}

export function ActiveOrderBanner({ order, onTrack }: ActiveOrderBannerProps) {
  const step = progressStep(order.trackingStatus);
  const etaText = order.eta?.replace(/^Arriving in\s*/i, '') || 'soon';

  return (
    <button
      type="button"
      onClick={onTrack}
      className="group relative flex w-full flex-col gap-4 overflow-hidden rounded-[24px] bg-surface-container-lowest p-4 text-left shadow-[0px_10px_30px_rgba(0,0,0,0.08)] transition-transform duration-200 active:scale-[0.98]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-container/10 to-transparent" />
      <div className="relative z-10 flex w-full items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            {statusLabel(order.trackingStatus)}
          </span>
          <h2 className="text-xl font-semibold text-on-surface">
            Arriving in <span className="font-bold text-primary">{etaText}</span>
          </h2>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container/20 text-primary">
          <MaterialIcon name="local_shipping" filled />
        </div>
      </div>

      <div className="relative z-10 mt-1 flex w-full items-center justify-between">
        <div className="absolute left-0 top-1/2 z-0 h-0.5 w-full -translate-y-1/2 bg-surface-variant" />
        <div
          className={`absolute left-0 top-1/2 z-0 h-0.5 -translate-y-1/2 bg-primary ${
            step >= 2 ? 'w-1/2' : 'w-1/6'
          }`}
        />

        <div className="relative z-10 flex flex-col items-center gap-1 bg-surface-container-lowest px-1">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
            <MaterialIcon name="check" className="text-[10px] font-bold text-on-primary" />
          </div>
          <span className="text-[10px] text-on-surface-variant">Preparing</span>
        </div>
        <div className="relative z-10 flex flex-col items-center gap-1 bg-surface-container-lowest px-1">
          <div
            className={`h-4 w-4 rounded-full border-2 border-surface-container-lowest ${
              step >= 2
                ? 'bg-primary dash-progress-dot-active'
                : 'bg-surface-variant'
            }`}
          />
          <span
            className={`text-[10px] ${step >= 2 ? 'font-bold text-primary' : 'text-outline'}`}
          >
            On the way
          </span>
        </div>
        <div className="relative z-10 flex flex-col items-center gap-1 bg-surface-container-lowest px-1">
          <div className="h-4 w-4 rounded-full border-2 border-surface-container-lowest bg-surface-variant" />
          <span className="text-[10px] text-outline">Arriving</span>
        </div>
      </div>

      <div className="relative z-10 mt-1 flex w-full items-center justify-between border-t border-surface-variant pt-3 text-on-surface-variant">
        <span className="text-sm">
          {order.merchantName} - Order #{order.orderNumber}
        </span>
        <MaterialIcon name="chevron_right" className="text-sm" />
      </div>
    </button>
  );
}
