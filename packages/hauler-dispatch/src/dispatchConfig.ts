import type { DriverDispatchMode, DriverOfferWithRide } from '@roam/types/rides';

export type DispatchUiConfig = {
  appName: string;
  permissionTitle: string;
  permissionDescription: string;
  showNativePermissionPlaceholders: boolean;
  idleOfflineMessage: string;
  waitingTitle: string;
  waitingDescription: string;
  goOnlineLabel: string;
};

export type DispatchProductConfig = {
  dispatchMode: DriverDispatchMode;
  defaultBodyTypeSlug: string;
  filterOffer: (offer: DriverOfferWithRide) => boolean;
  filterTrip: (ride: { vehicle_option?: string | null }) => boolean;
  ui: DispatchUiConfig;
};

const RIDESHARE_UI: DispatchUiConfig = {
  appName: 'Roam Driver',
  permissionTitle: 'Driver permissions',
  permissionDescription:
    'Keep Roam Driver open during trips. Allow location and notifications for offers and automatic trip updates.',
  showNativePermissionPlaceholders: true,
  idleOfflineMessage: 'Slide the gauge below to receive Roam ride requests from passengers nearby.',
  waitingTitle: 'Waiting for ride requests',
  waitingDescription: 'Stay on this screen. You will be notified when a passenger books nearby.',
  goOnlineLabel: 'Allow location & go online',
};

const HAUL_UI: DispatchUiConfig = {
  appName: 'Roam Haul',
  permissionTitle: 'Permissions',
  permissionDescription:
    'Allow location and notifications so we can match you with nearby freight jobs.',
  showNativePermissionPlaceholders: false,
  idleOfflineMessage: 'Go online when you are ready to accept freight jobs.',
  waitingTitle: 'Waiting for freight jobs',
  waitingDescription: 'You will be notified when a haulage job is available nearby.',
  goOnlineLabel: 'Go online',
};

export const RIDESHARE_DISPATCH_CONFIG: DispatchProductConfig = {
  dispatchMode: 'rideshare',
  defaultBodyTypeSlug: 'sedan',
  filterOffer: (offer) => {
    const vo = offer.ride?.vehicle_option?.trim().toLowerCase();
    return vo !== 'haulage';
  },
  filterTrip: (ride) => ride.vehicle_option?.trim().toLowerCase() !== 'haulage',
  ui: RIDESHARE_UI,
};

export const HAUL_DISPATCH_CONFIG: DispatchProductConfig = {
  dispatchMode: 'haulage',
  defaultBodyTypeSlug: 'cargo-van',
  filterOffer: (offer) => offer.ride?.vehicle_option?.trim().toLowerCase() === 'haulage',
  filterTrip: (ride) => ride.vehicle_option?.trim().toLowerCase() === 'haulage',
  ui: HAUL_UI,
};
