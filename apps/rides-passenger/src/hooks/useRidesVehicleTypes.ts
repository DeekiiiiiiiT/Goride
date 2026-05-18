import { useCallback, useEffect, useState } from 'react';
import {
  activeVehicleTypes,
  fallbackVehicleTypes,
  type RidesVehicleTypeDto,
} from '@/types/vehicleTypes';
import { listVehicleTypes } from '@/admin/services/ridesAdminService';
import { ridesListVehicleTypes } from '@/services/ridesEdge';

type Options = {
  accessToken?: string;
  /** Admin list includes inactive types */
  admin?: boolean;
};

export function useRidesVehicleTypes({ accessToken, admin = false }: Options = {}) {
  const [types, setTypes] = useState<RidesVehicleTypeDto[]>(fallbackVehicleTypes());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (admin && accessToken) {
        const { vehicle_types } = await listVehicleTypes(accessToken);
        setTypes(vehicle_types);
      } else {
        const { vehicle_types } = await ridesListVehicleTypes();
        setTypes(vehicle_types);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load vehicle types');
      setTypes(fallbackVehicleTypes());
    } finally {
      setLoading(false);
    }
  }, [accessToken, admin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const active = admin ? types : activeVehicleTypes(types);

  return { types, active, loading, error, reload };
}
