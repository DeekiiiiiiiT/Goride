/**
 * Fleet vehicles for Fitness permit bucketing (full Vehicle rows).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import type { Vehicle } from '../../../types/vehicle';

export function useFleetVehiclesForFitness() {
  return useQuery({
    queryKey: ['expense-hub', 'fleet-vehicles-fitness'],
    queryFn: async (): Promise<Vehicle[]> => {
      const vehicles = await api.getVehicles();
      return (Array.isArray(vehicles) ? vehicles : []).filter(
        (v: Vehicle) => Boolean(v.id || v.licensePlate),
      );
    },
    staleTime: 60_000,
  });
}
