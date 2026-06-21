import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { TrackingOrder } from '@/lib/trackingContent';
import { TRACKING_MAP_IMAGES } from '@/lib/trackingContent';

type Props = {
  order: TrackingOrder;
  onClose: () => void;
};

export function AlmostThereView({ order, onClose }: Props) {
  return (
    <div className="app-fullscreen-screen safe-x safe-t bg-background flex flex-col relative overflow-hidden">
      <header className="absolute top-0 w-full z-20 px-4 pt-safe pt-4 pb-4 flex justify-between items-center pointer-events-none">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-surface-container-lowest shadow-sm flex items-center justify-center pointer-events-auto"
        >
          <MaterialIcon name="close" />
        </button>
        <button
          type="button"
          className="bg-surface-container-lowest px-4 py-2 rounded-full shadow-sm pointer-events-auto flex items-center gap-2"
        >
          <MaterialIcon name="help" filled className="text-primary" />
          <span className="text-label-md font-semibold">Help</span>
        </button>
      </header>

      <main className="flex-grow relative w-full h-[530px]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${TRACKING_MAP_IMAGES.almostThere}')` }}
        />
        <div className="absolute top-[40%] left-[45%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-12 h-12 rounded-full bg-primary/20 tracking-map-pulse" />
            <div className="w-6 h-6 rounded-full bg-surface-container-lowest shadow-lg border-2 border-primary flex items-center justify-center relative z-10">
              <div className="w-2 h-2 rounded-full bg-primary" />
            </div>
          </div>
          <div className="mt-1 bg-surface-container-lowest px-2 py-1 rounded-md shadow-sm text-label-sm">Home</div>
        </div>
        <div className="absolute top-[50%] left-[60%] -translate-x-1/2 -translate-y-1/2">
          <div className="w-10 h-10 rounded-full bg-surface-container-lowest shadow-lg border-2 border-primary flex items-center justify-center">
            <MaterialIcon name="directions_car" filled className="text-primary" />
          </div>
        </div>
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 800">
          <path d="M 240,400 Q 200,380 180,320" fill="none" stroke="#006c49" strokeDasharray="8,8" strokeWidth="4" className="opacity-80" />
        </svg>
      </main>

      <section className="absolute bottom-0 w-full z-30 bg-surface-container-lowest rounded-t-[24px] shadow-[0px_-10px_40px_rgba(0,0,0,0.08)] pb-safe">
        <div className="w-full flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 rounded-full bg-outline-variant/50" />
        </div>
        <div className="px-4 pb-6 pt-2 flex flex-col gap-6">
          <div>
            <h1 className="text-headline-md font-semibold text-on-surface mb-2">
              {order.courier.name} is almost there!
            </h1>
            <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary-container to-[#059669] rounded-full w-[95%]" />
            </div>
          </div>

          <div className="bg-surface-container-low rounded-xl p-4 flex gap-4 items-start">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <MaterialIcon name="door_front" filled className="text-primary text-lg" />
            </div>
            <div>
              <p className="text-label-md font-semibold text-on-surface">Courier will leave at door</p>
              <p className="text-body-sm text-on-surface-variant mt-1">Gate code: 1234</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-outline-variant/20 pt-4">
            <div className="flex items-center gap-4">
              <img src={order.courier.avatar} alt={order.courier.name} className="w-12 h-12 rounded-full object-cover border border-outline-variant/30" />
              <div>
                <span className="text-label-md font-semibold text-on-surface">{order.courier.name}</span>
                <div className="flex items-center gap-1 text-on-surface-variant">
                  <MaterialIcon name="star" className="text-[14px]" filled />
                  <span className="text-body-sm">{order.courier.rating}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="w-12 h-12 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center">
                <MaterialIcon name="call" />
              </button>
              <button type="button" className="w-12 h-12 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center">
                <MaterialIcon name="chat" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
