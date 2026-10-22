/**
 * Fuel Brain classifier. One implementation, in fuel-core.
 * The 35% industry figure is a benchmark, not a billed floor.
 */
export {
  classifyFuelWeek,
  INDUSTRY_DEADHEAD_BENCHMARK_PCT as DEFAULT_INDUSTRY_FALLBACK_PCT,
  type ClassifyWeekInput as FuelBrainClassifyWeekInput,
  type ClassifyWeekResult as FuelBrainClassifyWeekResult,
} from '@roam/fuel-core/fuelBrainClassifyCore';
