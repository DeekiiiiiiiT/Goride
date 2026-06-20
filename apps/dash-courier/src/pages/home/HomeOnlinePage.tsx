import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { BusyZoneShader } from '@/components/map/BusyZoneShader';
import { LocationRippleShader } from '@/components/map/LocationRippleShader';

const KINGSTON_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCji4y249H5Or2pgZf6Z-yVTxpcz2_hVTZlUJENMXmFd1OgyQE1rcNDoF1NsEFNidUWi4VE_9zUClLEPRmuQLgtRYYp3PBXoomeK-8kwDU-0iOiQ_O81fkvXC_jRbTr2Cba6oFfjG5bHalysHHROuZVscaBZEvK94A5gfOWVlWo2V9_hehkEwxmqjREGW-0Re7h0VZ48XSZxLAsWhke8QBgS8ZiAH_UZO68WQR96QQSECUeyXpO7rMBMaDSyx9aMdCsxPILycfvtHY';

type HomeOnlinePageProps = {
  onRequestEndDash: () => void;
  onOfferReceived?: () => void;
  onViewPromotions?: () => void;
  mapOffset?: { x: number; y: number };
};

export function HomeOnlinePage({
  onRequestEndDash,
  onOfferReceived,
  onViewPromotions,
  mapOffset = { x: 50, y: 50 },
}: HomeOnlinePageProps) {
  React.useEffect(() => {
    const timer = window.setTimeout(() => onOfferReceived?.(), 5000);
    return () => window.clearTimeout(timer);
  }, [onOfferReceived]);

  return (
    <main className="relative w-full flex-1 min-h-[calc(100dvh-var(--app-bottom-nav-total)-3.5rem)] flex flex-col bg-surface-variant overflow-hidden md:rounded-xl md:mx-auto md:max-w-xl md:my-2 md:min-h-[calc(100dvh-1rem)]">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-90 mix-blend-multiply transition-[background-position] duration-1000"
        style={{
          backgroundImage: `url('${KINGSTON_MAP}')`,
          backgroundPosition: `${mapOffset.x}% ${mapOffset.y}%`,
        }}
        aria-hidden
      />

      <div className="relative z-10 flex-1 flex flex-col justify-between p-[var(--spacing-edge)] pb-6 pointer-events-none">
        <div className="space-y-2 w-full max-w-md mx-auto pointer-events-auto pt-2">
          <div className="bg-surface/95 backdrop-blur-md rounded-xl shadow-lg border border-surface-dim p-4 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center shrink-0">
              <MaterialIcon name="radar" className="text-primary" filled />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-on-surface">You&apos;re online</h2>
              <p className="text-sm text-muted mt-1">Waiting for delivery offers...</p>
            </div>
            <div className="w-8 flex justify-center pt-1">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDuration: '1.5s' }} />
            </div>
          </div>

          <button
            type="button"
            onClick={onViewPromotions}
            className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg shadow-sm p-2 flex items-center gap-2 overflow-hidden relative w-full text-left active:scale-[0.98] transition-transform"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-warning" />
            <span className="text-lg pl-1">🔥</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#B45309] flex-1">
              Peak Pay: +J$50 per delivery until 8pm
            </span>
          </button>
        </div>

        <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-32 h-32 flex items-center justify-center -translate-y-8">
            <LocationRippleShader />
            <div className="relative z-10 w-6 h-6 bg-secondary text-on-secondary rounded-full shadow-[0_4px_12px_rgba(113,46,221,0.5)] border-2 border-surface flex items-center justify-center">
              <div className="w-2 h-2 bg-surface rounded-full" />
            </div>
          </div>

          <BusyZoneShader className="top-[30%] right-[15%]" />
        </div>

        <div className="w-full max-w-md mx-auto space-y-4 pointer-events-auto">
          <div className="bg-surface rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-surface-container-high p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] text-muted uppercase tracking-wider font-medium">Today&apos;s Shift</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-primary bg-primary-container/20 px-2 py-1 rounded-md">
                4h 12m
              </span>
            </div>
            <div className="flex divide-x divide-outline-variant/30">
              <div className="flex-1 pr-4">
                <p className="text-sm text-muted">Earned</p>
                <p className="text-xl font-semibold text-on-surface mt-1">J$2,450</p>
              </div>
              <div className="flex-1 pl-4">
                <p className="text-sm text-muted">Deliveries</p>
                <p className="text-xl font-semibold text-on-surface mt-1">6</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onRequestEndDash}
            className="w-full h-14 bg-surface-container hover:bg-surface-container-high text-on-surface-variant text-xs font-semibold uppercase tracking-wide rounded-xl border border-outline-variant transition-colors flex items-center justify-center shadow-sm pointer-events-auto"
          >
            Go Offline
          </button>
        </div>
      </div>
    </main>
  );
}
