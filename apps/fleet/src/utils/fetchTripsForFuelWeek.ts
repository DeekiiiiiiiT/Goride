/**
 * Paginated trip fetch for fuel weeks — never silently stop at page 1 (C5c).
 */
import { api } from '../services/api';
import type { Trip } from '../types/data';

/** Page size for getTripsFiltered. */
export const FUEL_TRIPS_PAGE_SIZE = 1500;
/** Hard safety cap — if hit, callers must set tripsTruncated and show a banner. */
export const FUEL_TRIPS_HARD_MAX = 15_000;

export type FetchTripsForFuelWeekResult = {
  trips: Trip[];
  tripsTruncated: boolean;
};

export async function fetchTripsForFuelWeekPaged(
  weekStartYmd: string,
  weekEndYmd: string,
  opts?: { pageSize?: number; hardMax?: number },
): Promise<FetchTripsForFuelWeekResult> {
  const pageSize = opts?.pageSize ?? FUEL_TRIPS_PAGE_SIZE;
  const hardMax = opts?.hardMax ?? FUEL_TRIPS_HARD_MAX;
  const trips: Trip[] = [];
  let offset = 0;
  let tripsTruncated = false;

  for (;;) {
    const response = await api.getTripsFiltered({
      startDate: weekStartYmd,
      endDate: weekEndYmd,
      limit: pageSize,
      offset,
    });
    const page = Array.isArray(response?.data) ? (response.data as Trip[]) : [];
    trips.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
    if (trips.length >= hardMax) {
      tripsTruncated = true;
      break;
    }
  }

  return { trips, tripsTruncated };
}
