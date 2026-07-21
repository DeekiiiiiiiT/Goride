/**
 * Vehicle options for Expense Hub multi-selects.
 * Wraps api.getVehicles() in react-query; label = plate — make model.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';

export type VehicleOption = {
  id: string;
  label: string;
};

export function useVehicleOptions() {
  return useQuery({
    queryKey: ['expense-hub', 'vehicle-options'],
    queryFn: async (): Promise<VehicleOption[]> => {
      const vehicles = await api.getVehicles();
      return (Array.isArray(vehicles) ? vehicles : [])
        .map((v: { id?: string; licensePlate?: string; make?: string; model?: string }) => {
          const id = v.id || v.licensePlate || '';
          const name = [v.make, v.model].filter(Boolean).join(' ');
          return {
            id,
            label: name ? `${v.licensePlate || id} — ${name}` : v.licensePlate || id,
          };
        })
        .filter((v: VehicleOption) => Boolean(v.id))
        .sort((a: VehicleOption, b: VehicleOption) => a.label.localeCompare(b.label));
    },
    staleTime: 60_000,
  });
}
