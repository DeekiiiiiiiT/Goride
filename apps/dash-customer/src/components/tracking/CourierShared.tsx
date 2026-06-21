import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { TrackingOrder } from '@/lib/trackingContent';

type Courier = TrackingOrder['courier'];

export function CourierProfileCard({ courier, compact }: { courier: Courier; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-4">
        <div className="relative">
          <img src={courier.avatar} alt={courier.name} className="w-14 h-14 rounded-full object-cover border-2 border-surface shadow-sm" />
          <div className="absolute -bottom-1 -right-1 bg-surface rounded-full p-0.5 shadow-sm">
            <div className="bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              {courier.rating} <MaterialIcon name="star" className="text-[10px]" filled />
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-headline-sm font-semibold">{courier.name}</h3>
          <p className="text-body-sm text-on-surface-variant">
            {courier.vehicle} • {courier.plate}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low rounded-xl p-4 mb-6 border border-surface-variant flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative">
          <img src={courier.avatar} alt={courier.name} className="w-14 h-14 rounded-full object-cover border-2 border-surface" />
          <div className="absolute -bottom-1 -right-1 bg-surface rounded-full p-1 shadow-sm">
            <div className="bg-primary rounded-full w-5 h-5 flex items-center justify-center">
              <MaterialIcon name="two_wheeler" className="text-[12px] text-on-primary" />
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-headline-sm font-semibold">{courier.name}</h3>
          <div className="flex items-center gap-1 mt-1">
            <MaterialIcon name="star" className="text-[14px] text-[#F59E0B]" filled />
            <span className="text-label-sm text-on-surface-variant">
              {courier.rating} • {courier.deliveries}
            </span>
          </div>
        </div>
      </div>
      <CourierActions />
    </div>
  );
}

export function CourierActions() {
  return (
    <div className="flex gap-2">
      <button type="button" aria-label="Message courier" className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center">
        <MaterialIcon name="chat" />
      </button>
      <button type="button" aria-label="Call courier" className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center">
        <MaterialIcon name="call" />
      </button>
    </div>
  );
}
