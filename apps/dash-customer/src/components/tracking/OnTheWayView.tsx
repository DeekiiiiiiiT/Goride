import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DEFAULT_ORDER_STEPS, OrderStatusStepper } from '@/components/ui/OrderStatusStepper';
import type { TrackingOrder } from '@/lib/trackingContent';
import { formatArrivalEta, remainingDeliveryMinutes } from '@/lib/trackingContent';
import { CourierActions, CourierProfileCard } from './CourierShared';
import { CourierTrackingMap } from './CourierTrackingMap';

type Props = {
  order: TrackingOrder;
  onBack: () => void;
  onHelp?: () => void;
  onDetails?: () => void;
};

export function OnTheWayView({ order, onBack, onHelp, onDetails }: Props) {
  const arrival = formatArrivalEta(
    remainingDeliveryMinutes({
      nowMs: Date.now(),
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      courierLat: order.courierLat,
      courierLng: order.courierLng,
      deliveryLat: order.deliveryLat,
      deliveryLng: order.deliveryLng,
    }),
  );

  return (
    <div className="app-fullscreen-screen safe-x safe-t bg-background w-full overflow-hidden flex flex-col relative">
      <CourierTrackingMap order={order} className="absolute inset-0 z-0" preferCourier />

      <div className="absolute top-0 left-0 w-full z-30 pt-safe px-4 pt-4">
        <div className="flex justify-between items-center mb-4">
          <button type="button" onClick={onBack} className="w-10 h-10 bg-surface rounded-full shadow flex items-center justify-center">
            <MaterialIcon name="arrow_back" />
          </button>
          <button type="button" onClick={onHelp} className="px-4 py-2 bg-surface rounded-full shadow text-label-sm text-primary flex items-center gap-2">
            <span>Help</span>
            <MaterialIcon name="help_outline" className="text-[16px]" />
          </button>
        </div>

        <div className="bg-surface rounded-xl shadow-[0px_10px_30px_rgba(0,0,0,0.08)] p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-headline-sm font-semibold mb-1">{order.courier.name} is on the way!</h1>
              <p className="text-body-sm text-on-surface-variant">
                {arrival.startsWith('Arriving in ') ? (
                  <>
                    Arriving in{' '}
                    <span className="text-label-md font-semibold text-primary">
                      {arrival.replace('Arriving in ', '')}
                    </span>
                  </>
                ) : (
                  <span className="text-label-md font-semibold text-primary">{arrival}</span>
                )}
              </p>
            </div>
            <div className="bg-surface-variant px-3 py-1 rounded-full">
              <span className="text-label-sm text-on-surface-variant">Live map</span>
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
              {order.courier.name} picked up your order
            </p>
          </div>

          <div className="flex items-center justify-between mb-6">
            <CourierProfileCard courier={order.courier} compact />
            <CourierActions phone={order.courier.phone} order={order} />
          </div>

          <button type="button" onClick={onDetails} className="w-full flex justify-between items-center border-t border-surface-variant pt-4">
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
