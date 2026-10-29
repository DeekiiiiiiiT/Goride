import { useQuery } from "@tanstack/react-query";
import { fetchStationAnalytics, type AnalyticsFilters } from "./stationAnalyticsApi";

export function useStationAnalytics(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["station-analytics", filters.grade, filters.week, filters.pcode, filters.brand],
    queryFn: () => fetchStationAnalytics(filters),
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
}
