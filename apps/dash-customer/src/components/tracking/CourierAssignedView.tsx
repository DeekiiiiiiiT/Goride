import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { TrackingOrder } from '@/lib/trackingContent';
import { TRACKING_MAP_IMAGES } from '@/lib/trackingContent';
import { CourierProfileCard } from './CourierShared';

type Props = {
  order: TrackingOrder;
  onBack: () => void;
};

export function CourierAssignedView({ order, onBack }: Props) {
  return (
    <div className="app-fullscreen-screen safe-x safe-t text-on-surface flex flex-col overflow-hidden">
      <header className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center px-4 h-16 bg-surface/80 backdrop-blur-md">
        <button type="button" onClick={onBack} className="p-2 -ml-2 rounded-full text-on-surface">
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md font-semibold">Track Order</h1>
        <button type="button" className="p-2 -mr-2 rounded-full text-on-surface">
          <MaterialIcon name="help" />
        </button>
      </header>

      <main className="flex-grow relative bg-surface-container w-full">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-80"
          style={{ backgroundImage: `url('${TRACKING_MAP_IMAGES.courierAssigned}')` }}
        />

        <div className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-3xl shadow-[0px_-10px_40px_rgba(0,0,0,0.08)] px-4 pt-6 pb-8 max-w-[1200px] mx-auto w-full">
          <div className="w-12 h-1.5 bg-outline-variant rounded-full mx-auto mb-6 opacity-50" />

          <div className="text-center mb-6">
            <h2 className="text-headline-lg-mobile font-bold mb-1">Courier Assigned</h2>
            <p className="text-body-md text-on-surface-variant">Arriving at restaurant in ~5 min</p>
          </div>

          <div className="relative flex items-center justify-between mb-8 px-4">
            <div className="absolute top-1/2 left-8 right-8 h-1 bg-surface-variant -translate-y-1/2 rounded-full">
              <div className="absolute top-0 left-0 h-full bg-primary rounded-full w-1/3" />
            </div>
            <StepIcon icon="receipt_long" active />
            <StepIcon icon="two_wheeler" active large />
            <StepIcon icon="pedal_bike" />
            <StepIcon icon="home" />
          </div>

          <CourierProfileCard courier={order.courier} />

          <div className="flex justify-between items-center border-t border-surface-variant pt-4 px-2">
            <div>
              <p className="text-label-sm text-on-surface-variant mb-1">Order #{order.orderNumber}</p>
              <p className="text-body-md text-on-surface">{order.merchantName}</p>
            </div>
            <button type="button" className="text-label-md font-semibold text-primary">
              Details
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function StepIcon({ icon, active, large }: { icon: string; active?: boolean; large?: boolean }) {
  const size = large ? 'w-10 h-10' : 'w-8 h-8';
  const iconSize = large ? 'text-[20px]' : 'text-[16px]';
  return (
    <div className="relative z-10 flex flex-col items-center">
      <div
        className={`${size} rounded-full flex items-center justify-center mb-2 ${
          active
            ? large
              ? 'bg-surface border-4 border-primary text-primary shadow-md'
              : 'bg-primary text-on-primary shadow-sm'
            : 'bg-surface-variant text-on-surface-variant opacity-60 shadow-sm'
        }`}
      >
        <MaterialIcon name={icon} className={iconSize} filled={active && !large} />
      </div>
    </div>
  );
}
