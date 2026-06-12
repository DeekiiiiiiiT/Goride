import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { RideOfferCard } from './RideOfferCard';
import { ActiveRidePanel } from './ActiveRidePanel';
import { OnlineGaugeSlider } from './OnlineGaugeSlider';
import { shouldRetractOnlineSlider } from './rideDispatchUtils';

export function RideDispatchPage() {
  const {
    online,
    offers,
    activeRide,
    activeRideWaitTime,
    toggleOnline,
    accept,
    decline,
    advance,
    trackingError,
    gpsAccuracyM,
    isTracking,
  } = useRideDispatchContext();

  const showActiveRide = activeRide && isDriverActiveRideStatus(activeRide.status);
  const awaitingCashSettlement = activeRide?.status === 'awaiting_cash_settlement';
  const showActiveRidePanel = showActiveRide && !awaitingCashSettlement;
  const retractSlider = shouldRetractOnlineSlider(!!showActiveRide, offers.length);

  return (
    <>
      <div
        className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 px-4 py-6 max-w-lg mx-auto space-y-6 ${
          retractSlider ? 'driver-scroll-pad-nav-only' : 'driver-scroll-pad-for-slider'
        }`}
      >
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Passenger rides</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Roam passenger dispatch</p>
        </div>

        {!online && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Slide the gauge below to broadcast your location and receive ride offers.
          </p>
        )}

        {online && !showActiveRide && offers.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming offers</h2>
            <ul className="space-y-2">
              {offers.map((o) => (
                <RideOfferCard key={o.id} offer={o} onAccept={accept} onDecline={decline} />
              ))}
            </ul>
          </section>
        )}

        {showActiveRidePanel && (
          <ActiveRidePanel
            ride={activeRide}
            onAdvance={advance}
            trackingError={trackingError}
            gpsAccuracyM={gpsAccuracyM}
            isTracking={isTracking}
            waitTimeInfo={activeRideWaitTime}
          />
        )}

        {showActiveRide && !online && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Trip in progress — location sync resumes when you are online.
          </p>
        )}
      </div>

      <div
        className={`fixed left-0 right-0 z-[45] driver-online-slider-anchor transition-all duration-300 ease-out ${
          retractSlider ? 'driver-online-slider-retract' : ''
        }`}
        aria-hidden={retractSlider}
      >
        <OnlineGaugeSlider online={online} onToggle={toggleOnline} />
      </div>
    </>
  );
}
