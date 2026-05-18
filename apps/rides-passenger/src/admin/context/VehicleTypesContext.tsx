import React, { createContext, useContext } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { useRidesVehicleTypes } from '@/hooks/useRidesVehicleTypes';
import type { RidesVehicleTypeDto } from '@/types/vehicleTypes';

type OutletContext = { session: Session; role: string | undefined };

type VehicleTypesContextValue = {
  types: RidesVehicleTypeDto[];
  active: RidesVehicleTypeDto[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  vehicleTypeTableLabel: (slug: string) => string;
};

const VehicleTypesContext = createContext<VehicleTypesContextValue | null>(null);

export function VehicleTypesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useOutletContext<OutletContext>();
  const { types, active, loading, error, reload } = useRidesVehicleTypes({
    accessToken: session.access_token,
    admin: true,
  });

  const vehicleTypeTableLabel = (slug: string) => {
    const hit = types.find((t) => t.slug === slug);
    if (hit) return hit.label;
    if (slug === 'standard') return 'UberX (legacy)';
    return slug;
  };

  return (
    <VehicleTypesContext.Provider
      value={{ types, active, loading, error, reload, vehicleTypeTableLabel }}
    >
      {children}
    </VehicleTypesContext.Provider>
  );
}

export function useVehicleTypesContext(): VehicleTypesContextValue {
  const ctx = useContext(VehicleTypesContext);
  if (!ctx) {
    throw new Error('useVehicleTypesContext must be used within VehicleTypesProvider');
  }
  return ctx;
}
