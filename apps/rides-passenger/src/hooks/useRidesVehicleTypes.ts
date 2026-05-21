import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  activeVehicleTypes,
  fallbackVehicleTypes,
  inferSolutionKind,
  type RidesVehicleTypeDto,
} from '@/types/vehicleTypes';

import { listVehicleTypes } from '@/admin/services/ridesAdminService';
import { ridesListVehicleTypes } from '@/services/ridesEdge';

function normalizeList(rows: RidesVehicleTypeDto[]): RidesVehicleTypeDto[] {
  return rows.map((t) => ({
    ...t,
    solution_kind: inferSolutionKind(t.slug, t.solution_kind),
  }));
}

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
        setTypes(normalizeList(vehicle_types));
      } else {
        const res = await ridesListVehicleTypes();
        const rows = res.services ?? res.vehicle_types ?? [];
        setTypes(normalizeList(rows));
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

  const active = useMemo(
    () => (admin ? types : activeVehicleTypes(types)),
    [types, admin],
  );

  return { types, active, loading, error, reload };
}
