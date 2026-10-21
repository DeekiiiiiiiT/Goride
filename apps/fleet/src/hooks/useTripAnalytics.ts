import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import {
  analyticsFilterBody,
  type TripAnalyticsState,
} from '../components/trips/analytics/tripAnalyticsModel';

export function useTripAnalytics(state: TripAnalyticsState, page: number, pageSize = 25) {
  const queryClient = useQueryClient();
  const filters = analyticsFilterBody(state);
  const analytics = useQuery({
    queryKey: ['trip-analytics', filters, state.measure],
    queryFn: () => api.getTripAnalytics({
      filters,
      measure: state.measure,
      refresh: false,
      sections: ['kpis', 'volume', 'heatmap', 'cancellations', 'economics', 'geo', 'anomalies', 'coverage', 'funnel'],
    }),
    staleTime: 60_000,
  });

  const table = useQuery({
    queryKey: ['trip-analytics-table', filters, page, pageSize],
    queryFn: () => api.getTripsFiltered({
      startDate: filters.startDate,
      endDate: filters.endDate,
      platform: filters.platforms[0],
      platforms: filters.platforms,
      driverId: filters.driverId,
      vehicleId: filters.vehicleId,
      status: filters.status,
      paymentMethod: filters.paymentMethod || undefined,
      zone: filters.zone || undefined,
      tripType: state.tripType || undefined,
      hour: filters.hour,
      dow: filters.dow,
      compare: filters.compare,
      population: 'rideshare',
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  });

  return {
    analytics,
    table,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trip-analytics'] });
      await queryClient.invalidateQueries({ queryKey: ['trip-analytics-table'] });
    },
  };
}
