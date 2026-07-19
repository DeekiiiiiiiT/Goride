/**
 * Thin domain wrapper over shared FleetBusyLock — existing call sites keep working.
 */
export {
  FleetBusyProvider as FuelReconBusyProvider,
  useFleetBusy as useFuelReconBusy,
} from '../../shared/FleetBusyLock';
