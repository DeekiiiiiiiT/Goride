import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  HandHeart,
  KeyRound,
  Receipt,
  Shield,
  Star,
  User,
  X,
} from 'lucide-react';
import type { ActivityTripHistoryItem } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import { ActivityTripReceiptSheet } from '@/components/activity/ActivityTripReceiptSheet';
import { bookerVisibleAddress, shouldHideLocationsForBooker } from '@/lib/shadowBookerPrivacy';
import {
  formatActivityDateLabel,
  formatActivityTime24,
  rideDropoffTime,
  ridePickupTime,
} from '@/lib/activityTripDetailsUtils';
import { ridesGetRequest } from '@/services/ridesEdge';
import {
  ERROR,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SECONDARY,
  SURFACE_CONTAINER_HIGH,
  SURFACE_CONTAINER_HIGHEST,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const DEFAULT_DRIVER_PHOTO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBH-yrLnF5H96JI5vmdUL7ar3XVEK9dGmV4biRNlIpVuMcCDTPx1ArjC5bZVNIcEPHtJ3qg2YzEXmF_UZ50Qt1-PDFsFGmLQ3RvkqCWCHL3NrpxNf0o3IrzCVdVy6JG7il4r6NO6WXeSyDaTBqi9vZAhlSx8gFpiBYBn6p8Vn7_DW_wqulILDSMxAlLkHeYTz3hUrlkLrr2i3OXj2aTjG4j3jxpS-w1K3fTBaOF0xA9KxBBETUI_Qr7zIOx1A8UsfQFQJaK62PvhylX';

const GLASS_CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.85)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(0, 109, 67, 0.1)',
};

type ActivityTripDetailsSheetProps = {
  trip: ActivityTripHistoryItem | null;
  onClose: () => void;
};

function statusBadgeLabel(status: ActivityTripHistoryItem['status']): string {
  return status === 'completed' ? 'Completed' : 'Cancelled';
}

function HelpRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  showDivider = true,
}: {
  icon: typeof KeyRound;
  title: string;
  subtitle: string;
  onClick: () => void;
  showDivider?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between p-4 text-left touch-manipulation transition-colors active:bg-[rgba(0,109,67,0.05)]"
      style={{ borderBottom: showDivider ? `1px solid ${OUTLINE_VARIANT}1a` : undefined }}
    >
      <span className="flex min-w-0 items-center gap-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: SURFACE_CONTAINER_HIGHEST, color: ON_SURFACE_VARIANT }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold" style={{ color: ON_SURFACE }}>{title}</span>
          <span className="mt-0.5 block text-[11px] leading-tight" style={{ color: SECONDARY }}>
            {subtitle}
          </span>
        </span>
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 transition-transform group-active:translate-x-0.5"
        style={{ color: OUTLINE_VARIANT }}
        aria-hidden
      />
    </button>
  );
}

export function ActivityTripDetailsSheet({ trip, onClose }: ActivityTripDetailsSheetProps) {
  const navigate = useNavigate();
  const [showReceipt, setShowReceipt] = useState(false);
  const rideId = trip?.ride_id ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['activity', 'trip-detail', rideId],
    enabled: Boolean(rideId),
    queryFn: () => ridesGetRequest(rideId!),
    staleTime: 60_000,
  });

  if (!trip) return null;

  const ride = data?.ride;
  const assignedDriver = data?.assigned_driver ?? null;
  const hideLocations = shouldHideLocationsForBooker(trip.roam_mode, trip.participant_role);
  const pickupAddress = hideLocations
    ? null
    : bookerVisibleAddress(trip.roam_mode, trip.participant_role, ride?.pickup_address ?? trip.pickup_address);
  const dropoffAddress = hideLocations
    ? null
    : bookerVisibleAddress(trip.roam_mode, trip.participant_role, ride?.dropoff_address ?? trip.dropoff_address);

  const pickupAt = ride ? ridePickupTime(ride) : null;
  const dropoffAt = ride ? rideDropoffTime(ride) : null;
  const pickupTime = formatActivityTime24(pickupAt);
  const dropoffTime = formatActivityTime24(dropoffAt);

  const fare = formatMoneyMinor(
    ride?.fare_final_minor ?? ride?.fare_estimate_minor ?? trip.fare_estimate_minor,
    ride?.currency ?? trip.currency ?? 'JMD',
  ).replace(/^[A-Z]{3}\s+/i, '').trim();

  const fareDisplay = fare.startsWith('$') || fare.startsWith('JMD') ? fare : `$${fare}`;
  const tripDateLabel = formatActivityDateLabel(trip.ended_at || trip.created_at);

  const driverName = assignedDriver?.display_name?.trim() || 'Your driver';
  const driverPhoto = assignedDriver?.profile_photo_url?.trim() || DEFAULT_DRIVER_PHOTO;
  const vehicleLabel = assignedDriver?.vehicle_label?.trim()
    || (ride ? vehicleTypeLabel(ride.vehicle_option) : 'Roam vehicle');
  const plate = assignedDriver?.license_plate?.trim();
  const vehicleLine = plate ? `${vehicleLabel} • ${plate}` : vehicleLabel;

  const openReceipt = () => {
    if (hideLocations && trip.roam_mode === 'shadow_roam') {
      onClose();
      navigate(`/shadow-trip/${trip.ride_id}/receipt`);
      return;
    }
    if (!ride) return;
    setShowReceipt(true);
  };

  const notifySoon = (label: string) => {
    toast.message(label, { description: 'Coming soon' });
  };

  if (showReceipt && ride) {
    return (
      <ActivityTripReceiptSheet
        trip={trip}
        ride={ride}
        onBack={() => setShowReceipt(false)}
      />
    );
  }

  const isCompleted = trip.status === 'completed';

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col safe-t safe-x"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-trip-details-title"
    >
      <header
        className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between px-5 shadow-sm"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full touch-manipulation transition-colors active:scale-95"
          style={{ color: PRIMARY }}
          aria-label="Back to activity"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="text-base font-bold tracking-tight" style={{ color: PRIMARY }}>
          Activity
        </h1>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full touch-manipulation transition-colors active:scale-95"
          style={{ color: PRIMARY }}
          aria-label="Close trip details"
        >
          <X className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
      </header>

      <main className="mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto px-5 pb-28 pt-5">
        {isLoading ? (
          <p className="py-12 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>Loading trip…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>Could not load trip details.</p>
        ) : (
          <div className="space-y-5">
            <section>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h2 id="activity-trip-details-title" className="text-lg font-bold" style={{ color: ON_SURFACE }}>
                  Trip details
                </h2>
                <span
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: isCompleted ? 'color-mix(in srgb, var(--passenger-primary) 10%, transparent)' : SURFACE_CONTAINER_HIGH,
                    color: isCompleted ? PRIMARY : ON_SURFACE_VARIANT,
                  }}
                >
                  {statusBadgeLabel(trip.status)}
                </span>
              </div>
              <p className="text-[2rem] font-extrabold leading-none tracking-tight tabular-nums" style={{ color: ON_SURFACE }}>
                {fareDisplay}
              </p>
              {tripDateLabel ? (
                <p className="mt-1 text-sm" style={{ color: SECONDARY }}>{tripDateLabel}</p>
              ) : null}
            </section>

            {pickupAddress || dropoffAddress ? (
              <section className="rounded-[1.5rem] p-5 shadow-sm" style={GLASS_CARD_STYLE}>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1 py-1">
                    <span
                      className="relative h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: PRIMARY }}
                      aria-hidden
                    />
                    <div
                      className="w-0.5 flex-1 rounded-full"
                      style={{ backgroundColor: `${OUTLINE_VARIANT}66`, minHeight: '2.5rem' }}
                      aria-hidden
                    />
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: ERROR }}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: SECONDARY }}>
                        Pickup{pickupTime ? ` • ${pickupTime}` : ''}
                      </p>
                      <p className="truncate text-sm font-semibold" style={{ color: ON_SURFACE }}>
                        {pickupAddress ?? 'Pickup location'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: SECONDARY }}>
                        Drop-off{dropoffTime ? ` • ${dropoffTime}` : ''}
                      </p>
                      <p className="truncate text-sm font-semibold" style={{ color: ON_SURFACE }}>
                        {dropoffAddress ?? 'Drop-off location'}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Location details are not shown for this trip.
              </p>
            )}

            {!hideLocations ? (
              <section
                className="relative flex items-center gap-4 overflow-hidden rounded-[1.5rem] p-4 shadow-sm"
                style={GLASS_CARD_STYLE}
              >
                <div
                  className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full blur-2xl"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--passenger-primary) 5%, transparent)' }}
                  aria-hidden
                />
                <div
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2"
                  style={{ borderColor: 'color-mix(in srgb, var(--passenger-primary) 20%, transparent)' }}
                >
                  {assignedDriver ? (
                    <img src={driverPhoto} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center"
                      style={{ backgroundColor: SURFACE_CONTAINER_HIGH }}
                    >
                      <User className="h-6 w-6" style={{ color: ON_SURFACE_VARIANT }} aria-hidden />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold leading-tight" style={{ color: ON_SURFACE }}>
                    {driverName}
                  </h3>
                  <p className="truncate text-xs" style={{ color: SECONDARY }}>{vehicleLine}</p>
                </div>
                <button
                  type="button"
                  onClick={openReceipt}
                  disabled={!ride}
                  className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white touch-manipulation transition-transform active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: ON_SURFACE }}
                >
                  <Receipt className="h-[18px] w-[18px]" aria-hidden />
                  Receipt
                </button>
              </section>
            ) : (
              <button
                type="button"
                onClick={openReceipt}
                disabled={!ride}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white touch-manipulation active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: ON_SURFACE }}
              >
                <Receipt className="h-[18px] w-[18px]" aria-hidden />
                Receipt
              </button>
            )}

            {isCompleted ? (
              <section className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => notifySoon('Add tip')}
                  className="flex items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-medium touch-manipulation transition-colors active:scale-95"
                  style={{
                    backgroundColor: SURFACE_CONTAINER_HIGH,
                    borderColor: `${OUTLINE_VARIANT}4d`,
                    color: ON_SURFACE,
                  }}
                >
                  <HandHeart className="h-5 w-5" style={{ color: PRIMARY }} aria-hidden />
                  Add Tip
                </button>
                <button
                  type="button"
                  onClick={() => notifySoon('Rate trip')}
                  className="flex items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-medium touch-manipulation transition-colors active:scale-95"
                  style={{
                    backgroundColor: SURFACE_CONTAINER_HIGH,
                    borderColor: `${OUTLINE_VARIANT}4d`,
                    color: ON_SURFACE,
                  }}
                >
                  <Star className="h-5 w-5 fill-current" style={{ color: PRIMARY }} aria-hidden />
                  Rate Trip
                </button>
              </section>
            ) : null}

            <section>
              <h4
                className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest"
                style={{ color: SECONDARY }}
              >
                Help &amp; Safety
              </h4>
              <div className="overflow-hidden rounded-[1.5rem] shadow-sm" style={GLASS_CARD_STYLE}>
                <HelpRow
                  icon={KeyRound}
                  title="Find lost item"
                  subtitle="Connect with your driver regarding left items"
                  onClick={() => notifySoon('Find lost item')}
                />
                <HelpRow
                  icon={Shield}
                  title="Report safety issue"
                  subtitle="Instant support for on-road incidents"
                  onClick={() => notifySoon('Report safety issue')}
                />
                <HelpRow
                  icon={CircleHelp}
                  title="Customer Support"
                  subtitle="General inquiries and fare disputes"
                  onClick={() => {
                    onClose();
                    navigate('/account/support');
                  }}
                  showDivider={false}
                />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
