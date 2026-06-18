import type { DriverDispatchMode, DriverOfferWithRide } from '@roam/types/rides';

export type DispatchProductConfig = {
  dispatchMode: DriverDispatchMode;
  defaultBodyTypeSlug: string;
  filterOffer: (offer: DriverOfferWithRide) => boolean;
  filterTrip: (ride: { vehicle_option?: string | null }) => boolean;
};

export const RIDESHARE_DISPATCH_CONFIG: DispatchProductConfig = {
  dispatchMode: 'rideshare',
  defaultBodyTypeSlug: 'sedan',
  filterOffer: (offer) => {
    const vo = offer.ride?.vehicle_option?.trim().toLowerCase();
    return vo !== 'haulage';
  },
  filterTrip: (ride) => ride.vehicle_option?.trim().toLowerCase() !== 'haulage',
};

export const HAUL_DISPATCH_CONFIG: DispatchProductConfig = {
  dispatchMode: 'haulage',
  defaultBodyTypeSlug: 'cargo-van',
  filterOffer: (offer) => offer.ride?.vehicle_option?.trim().toLowerCase() === 'haulage',
  filterTrip: (ride) => ride.vehicle_option?.trim().toLowerCase() === 'haulage',
};
