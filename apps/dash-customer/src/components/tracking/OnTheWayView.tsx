import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DEFAULT_ORDER_STEPS, OrderStatusStepper } from '@/components/ui/OrderStatusStepper';
import type { TrackingOrder } from '@/lib/trackingContent';
import { TRACKING_MAP_IMAGES } from '@/lib/trackingContent';
import { CourierActions, CourierProfileCard } from './CourierShared';

type Props = {
  order: TrackingOrder;
  onBack: () => void;
};

const COURIER_POSITIONS = [
  { top: '62.5%', left: '50%' },
  { top: '55%', left: '48%' },
  { top: '48%', left: '45%' },
  { top: '40%', left: '42%' },
  { top: '32%', left: '40%' },
];

export function OnTheWayView({ order, onBack }: Props) {
  const [courierIndex, setCourierIndex] = useState(0);
  const pos = COURIER_POSITIONS[courierIndex];

  useEffect(() => {
    const interval = setInterval(() => {
      setCourierIndex((i) => (i + 1) % COURIER_POSITIONS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-fullscreen-screen safe-x safe-t bg-background w-full overflow-hidden flex flex-col relative">
      <div className="absolute inset-0 tracking-map-bg z-0">
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 800">
          <path
            d="M 150,200 C 180,300 250,350 200,500 C 180,560 120,600 180,700"
            fill="none"
            stroke="#10b981"
            strokeDasharray="8 8"
            strokeWidth="4"
            className="opacity-60"
          />
          <path d="M 150,200 C 180,300 250,350 200,500" fill="none" stroke="#10b981" strokeLinecap="round" strokeWidth="4" />
        </svg>

        <div className="absolute top-[25%] left-[37.5%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-8 h-8 bg-surface rounded-full shadow-md flex items-center justify-center border-2 border-primary-container z-10">
            <MaterialIcon name="restaurant" className="text-[16px] text-primary" filled />
          </div>
        </div>

        <div className="absolute top-[87.5%] left-[45%] -translate-x-1/2 -translate-y-1/2">
          <div className="w-10 h-10 bg-primary rounded-full shadow-lg flex items-center justify-center tracking-pulse-animation">
            <MaterialIcon name="home" className="text-[20px] text-on-primary" filled />
          </div>
        </div>

        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-[5000ms] ease-linear"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="bg-surface rounded-full shadow-lg p-1 border-2 border-primary-container tracking-pulse-animation">
            <img src={TRACKING_MAP_IMAGES.driverMarker} alt="Courier" className="w-10 h-10 rounded-full object-cover" />
          </div>
        </div>
      </div>

      <div className="absolute top-0 left-0 w-full z-30 pt-safe px-4 pt-4">
        <div className="flex justify-between items-center mb-4">
          <button type="button" onClick={onBack} className="w-10 h-10 bg-surface rounded-full shadow flex items-center justify-center">
            <MaterialIcon name="arrow_back" />
          </button>
          <button type="button" className="px-4 py-2 bg-surface rounded-full shadow text-label-sm text-primary flex items-center gap-2">
            <span>Help</span>
            <MaterialIcon name="help_outline" className="text-[16px]" />
          </button>
        </div>

        <div className="bg-surface rounded-xl shadow-[0px_10px_30px_rgba(0,0,0,0.08)] p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-headline-sm font-semibold mb-1">{order.courier.name} is on the way!</h1>
              <p className="text-body-sm text-on-surface-variant">
                Arriving in <span className="text-label-md font-semibold text-primary">12 min</span>
              </p>
            </div>
            <div className="bg-surface-variant px-3 py-1 rounded-full">
              <span className="text-label-sm text-on-surface-variant">3.2 km away</span>
            </div>
          </div>
          <OrderStatusStepper steps={DEFAULT_ORDER_STEPS} currentIndex={2} />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full z-40 bg-surface rounded-t-xl shadow-[0px_-10px_30px_rgba(0,0,0,0.08)] pb-safe">
        <div className="w-full flex justify-center py-2">
          <div className="w-12 h-1 bg-outline-variant rounded-full opacity-50" />
        </div>
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 mb-4 py-3 px-4 bg-surface-container-low rounded-lg border border-surface-variant">
            <div className="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center text-primary shrink-0">
              <MaterialIcon name="receipt_long" className="text-[16px]" />
            </div>
            <p className="text-body-sm text-on-surface">
              {order.courier.name} picked up your order at <span className="font-semibold">2:26 PM</span>
            </p>
          </div>

          <div className="flex items-center justify-between mb-6">
            <CourierProfileCard courier={order.courier} compact />
            <CourierActions />
          </div>

          <button type="button" className="w-full flex justify-between items-center border-t border-surface-variant pt-4">
            <div className="text-left">
              <h4 className="text-label-md font-semibold">Order #ROAM-{order.orderNumber}</h4>
              <p className="text-body-sm text-on-surface-variant mt-1">
                {order.items.reduce((s, i) => s + i.quantity, 0)} items from {order.merchantName}
              </p>
            </div>
            <MaterialIcon name="chevron_right" className="text-outline-variant" />
          </button>
        </div>
      </div>
    </div>
  );
}
