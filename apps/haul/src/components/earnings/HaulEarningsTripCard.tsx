import React from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import {
  formatTripDateTime,
  manifestItemCount,
  manifestSummary,
  placeCode,
  shortPlace,
  tripFare,
} from '../../utils/haulEarningsFormat';
import { formatRideKm } from '../../utils/haulRideFormat';
import { HaulSwipeableRow } from '../ui/HaulSwipeableRow';

type Props = {
  trip: RideRequestRow;
  onSelect: (trip: RideRequestRow) => void;
};

export function HaulEarningsTripCard({ trip, onSelect }: Props) {
  const pickup = shortPlace(trip.pickup_address);
  const dropoff = shortPlace(trip.dropoff_address);
  const items = manifestItemCount(trip);

  return (
    <HaulSwipeableRow onSwipeAction={() => onSelect(trip)} actionLabel="View job details">
      <button
        type="button"
        onClick={() => onSelect(trip)}
        className="w-full rounded-lg border border-[#534434] bg-[#171f33] p-4 text-left transition-colors hover:border-[#ffc174]/50 active:scale-[0.99]"
      >
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffc174]/20 text-[#ffc174]">
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
          </div>
          <span className="text-sm text-[#d8c3ad]">{formatTripDateTime(trip)}</span>
        </div>
        <span className="text-xl font-bold text-[#dae2fd]">{tripFare(trip)}</span>
      </div>
      <div className="relative pl-11">
        <div className="absolute top-2 bottom-6 left-4 border-l border-dashed border-[#534434]" />
        <div className="relative mb-4">
          <span className="material-symbols-outlined absolute -left-10 top-0 bg-[#171f33] text-base text-[#d8c3ad]">
            my_location
          </span>
          <p className="text-sm font-medium text-[#dae2fd]">{pickup}</p>
          <p className="text-xs text-[#d8c3ad]">Origin</p>
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute -left-10 top-0 bg-[#171f33] text-base text-[#ffc174]" style={{ fontVariationSettings: "'FILL' 1" }}>
            location_on
          </span>
          <p className="text-sm font-medium text-[#dae2fd]">{dropoff}</p>
          <p className="text-xs text-[#d8c3ad]">Destination</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {items > 0 ? (
            <span className="flex items-center gap-1 rounded border border-[#534434] bg-[#0b1326] px-2 py-1 text-xs text-[#d8c3ad]">
              <span className="material-symbols-outlined text-xs">inventory_2</span>
              {items} item{items === 1 ? '' : 's'}
            </span>
          ) : null}
          {trip.distance_estimate_km != null ? (
            <span className="flex items-center gap-1 rounded border border-[#534434] bg-[#0b1326] px-2 py-1 text-xs text-[#d8c3ad]">
              <span className="material-symbols-outlined text-xs">route</span>
              {formatRideKm(trip.distance_estimate_km)}
            </span>
          ) : null}
        </div>
      </div>
      </button>
    </HaulSwipeableRow>
  );
}

type HistoryProps = {
  trip: RideRequestRow;
  onSelect: (trip: RideRequestRow) => void;
};

export function HaulEarningsHistoryCard({ trip, onSelect }: HistoryProps) {
  const fromCode = placeCode(trip.pickup_address);
  const toCode = placeCode(trip.dropoff_address);
  const summary = manifestSummary(trip);

  return (
    <button
      type="button"
      onClick={() => onSelect(trip)}
      className="flex w-full flex-col gap-4 rounded-lg border border-[#2d3449] bg-[#171f33] p-4 text-left transition-colors hover:border-[#ffc174]/50 md:flex-row md:items-center"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2 text-xs text-[#d8c3ad]">
          <span className="material-symbols-outlined text-base">calendar_today</span>
          {formatTripDateTime(trip)}
          <span className="mx-1 h-1 w-1 rounded-full bg-[#534434]" />
          <span className="flex items-center gap-1 text-[#30c88f]">
            <span className="h-2 w-2 rounded-full bg-[#30c88f]" />
            Completed
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-lg font-semibold text-[#dae2fd]">{fromCode}</p>
            <p className="text-[10px] text-[#d8c3ad]">{shortPlace(trip.pickup_address)}</p>
          </div>
          <div className="flex flex-1 items-center">
            <div className="h-px flex-1 bg-[#2d3449]" />
            <span className="material-symbols-outlined mx-1 text-[#a08e7a]">local_shipping</span>
            <div className="h-px flex-1 bg-[#2d3449]" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-[#dae2fd]">{toCode}</p>
            <p className="text-[10px] text-[#d8c3ad]">{shortPlace(trip.dropoff_address)}</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-[#d8c3ad]">{summary}</p>
      </div>
      <div className="flex items-end justify-between border-t border-[#2d3449] pt-3 md:flex-col md:border-t-0 md:border-l md:pt-0 md:pl-4">
        <span className="text-2xl font-bold text-[#ffc174]">{tripFare(trip)}</span>
        <div className="flex text-[#f59e0b]">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
              star
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
