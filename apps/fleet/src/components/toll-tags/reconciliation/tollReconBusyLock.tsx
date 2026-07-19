/**
 * Thin domain wrapper over shared FleetBusyLock — existing call sites keep working.
 */
export {
  FleetBusyProvider as TollReconBusyProvider,
  useFleetBusy as useTollReconBusy,
} from '../../shared/FleetBusyLock';
