import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DeliveryMap } from '@/components/map/DeliveryMap';
import { SlideToArrive } from '@/components/delivery/SlideToArrive';
import { NavigationPickerSheet } from '@/components/ui/NavigationPickerSheet';
import type { ActiveDelivery } from '@/lib/mockActiveDelivery';
import { openPhoneCall, openSmsMessage, toDialablePhone } from '@/lib/contactLinks';
import { openNavigationApp } from '@/lib/navigationUrls';
import { realDispatchProvider } from '@/services/courierDispatch/RealDispatchProvider';
import { useCourierRoute } from '@/hooks/useCourierRoute';

type EnRoutePageProps = {
  delivery: ActiveDelivery;
  onArrived: () => void;
};

function formatTurnDistance(meters?: number): string {
  if (meters == null || !Number.isFinite(meters)) return '';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function EnRoutePage({ delivery, onArrived }: EnRoutePageProps) {
  const [navPickerOpen, setNavPickerOpen] = useState(false);
  const customerPhone = toDialablePhone(delivery.customerPhone);
  const gps = realDispatchProvider.getLastCoords();
  const route = useCourierRoute({
    fromLat: gps.lat,
    fromLng: gps.lng,
    toLat: delivery.dropoffLat,
    toLng: delivery.dropoffLng,
  });

  const turnDistance = formatTurnDistance(route.nextTurnDistanceM) ||
    delivery.dropoffTurnDistance ||
    `${delivery.dropoffDistanceKm} km`;
  const turnInstruction = route.nextTurnInstruction || delivery.dropoffTurnInstruction;
  const etaMinutes = route.durationMinutes ?? delivery.dropoffEtaMinutes;
  const distanceKm = route.distanceKm ?? delivery.dropoffDistanceKm;

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      <div className="absolute inset-0 z-0 bg-surface-variant">
        <DeliveryMap
          className="h-full w-full"
          courierLat={gps.lat}
          courierLng={gps.lng}
          destinationLat={delivery.dropoffLat}
          destinationLng={delivery.dropoffLng}
          destinationLabel={delivery.customerFirstName || 'Customer'}
          routePolyline={route.polyline}
          interactive={false}
        />
      </div>

      <div className="relative z-20 flex flex-col w-full flex-1">
        <div className="w-full bg-inverse-surface shadow-md rounded-b-[24px] pt-safe pb-4 px-[var(--spacing-edge)] flex items-center gap-4">
          <div className="w-12 h-12 bg-surface/10 rounded-full flex items-center justify-center shrink-0">
            <MaterialIcon name="near_me" className="text-inverse-on-surface text-[32px]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[28px] leading-9 font-bold text-inverse-on-surface mb-1">
              {turnDistance}
            </div>
            <div className="text-sm text-surface-variant opacity-80 truncate">
              {turnInstruction}
            </div>
          </div>
        </div>

        <div className="mx-[var(--spacing-edge)] mt-6 bg-surface rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.08)] p-4 border border-outline-variant/20 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary-fixed rounded-full w-fit">
            <MaterialIcon name="visibility" className="text-sm text-secondary" />
            <span className="text-[11px] text-secondary tracking-wide font-medium">
              {delivery.customerFirstName} can see your location
            </span>
          </div>
          <div className="flex justify-between items-start pt-1 gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted uppercase tracking-wider mb-0.5">Deliver to</div>
              <div className="text-xl font-semibold text-on-surface">{delivery.customerFirstName}</div>
              <div className="text-sm text-on-surface-variant mt-1 leading-snug">{delivery.dropoffAddress}</div>
            </div>
            <div className="flex flex-col items-end shrink-0 border-l border-outline-variant/30 pl-4">
              <div className="text-2xl font-semibold text-primary">{etaMinutes} min</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted mt-0.5">
                ({distanceKm} km)
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="w-full bg-surface rounded-t-[32px] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] pt-3 pb-safe border-t border-outline-variant/10">
          <div className="w-12 h-1.5 bg-outline-variant/50 rounded-full mx-auto mb-5" />
          <div className="px-[var(--spacing-edge)] flex flex-col gap-6 pb-4">
            <div className="bg-surface-bright rounded-xl p-4 border border-outline-variant/30 flex gap-4 items-start">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center shrink-0">
                <MaterialIcon name="speaker_notes" className="text-tertiary text-lg" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                  Delivery Instructions
                </div>
                <div className="text-sm text-on-surface font-medium leading-relaxed">
                  {delivery.deliveryInstructions}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {customerPhone && (
                <button
                  type="button"
                  onClick={() => openPhoneCall(customerPhone)}
                  className="flex-1 h-[52px] bg-secondary-fixed text-on-secondary-fixed-variant rounded-xl flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide active:scale-95"
                >
                  <MaterialIcon name="call" className="text-xl" filled />
                  Call
                </button>
              )}
              {customerPhone && (
                <button
                  type="button"
                  onClick={() => openSmsMessage(customerPhone, `Hi, your Roam Rush courier is nearby.`)}
                  className="flex-1 h-[52px] bg-secondary-fixed text-on-secondary-fixed-variant rounded-xl flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide active:scale-95"
                >
                  <MaterialIcon name="chat" className="text-xl" filled />
                  Message
                </button>
              )}
              <button
                type="button"
                aria-label="Open in Maps"
                onClick={() => setNavPickerOpen(true)}
                className={`${customerPhone ? 'w-[52px]' : 'flex-1'} h-[52px] bg-surface-container border border-outline-variant/50 text-on-surface rounded-xl flex items-center justify-center gap-2 active:scale-95`}
              >
                <MaterialIcon name="map" className="text-[22px]" />
                {!customerPhone && (
                  <span className="text-xs font-semibold uppercase tracking-wide">Open in Maps</span>
                )}
              </button>
            </div>

            <SlideToArrive variant="en-route" onComplete={onArrived} />
          </div>
        </div>
      </div>

      <NavigationPickerSheet
        open={navPickerOpen}
        destination={delivery.customerFirstName || 'Customer'}
        onSelect={(app) => {
          openNavigationApp(app as 'google' | 'waze' | 'apple', {
            lat: delivery.dropoffLat,
            lng: delivery.dropoffLng,
            address: delivery.dropoffAddress,
          });
          setNavPickerOpen(false);
        }}
        onClose={() => setNavPickerOpen(false)}
      />
    </div>
  );
}
