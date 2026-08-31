/**
 * Dominion re-exports Fleet's canonical fuel cycle engine (Phase 4 de-fork).
 * Do not reintroduce a local fork.
 */
export { calculateFuelCycles } from '@fleet/utils/fuelCycleEngine';
export type { FuelCycle } from '../types/fuel';
