/**
 * Fuel Brain classify for Fleet UI — local mirror only.
 * Internal Edge secrets must NEVER be VITE_-prefixed (secrets audit Wave 0).
 */

import type { FuelBrainClassifyWeekInput, FuelBrainClassifyWeekResult } from '@roam/types/fuelBrain';
import { classifyFuelWeek } from '../utils/fuelBrainClassify';

/**
 * Classify a driver/vehicle week via the local mirror (same algorithm as Edge).
 * Remote Edge classify requires a server-held secret — never call from the browser.
 */
export async function classifyWeekForRecon(
  input: FuelBrainClassifyWeekInput,
): Promise<FuelBrainClassifyWeekResult> {
  return classifyFuelWeek(input);
}
