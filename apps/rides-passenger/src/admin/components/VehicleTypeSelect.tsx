import React from 'react';
import { Loader2 } from 'lucide-react';
import { DEFAULT_VEHICLE_OPTION } from '@/types/vehicleTypes';
import { TransportOptionPicker } from '@/components/TransportOptionPicker';
import { useVehicleTypesContext } from '../context/VehicleTypesContext';

type Props = {
  value: string;
  onChange: (slug: string) => void;
};

export function VehicleTypeSelect({ value, onChange }: Props) {
  const { services, loading, active } = useVehicleTypesContext();
  const selected = value || DEFAULT_VEHICLE_OPTION;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">Service</label>
      {loading && active.length === 0 ? (
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </p>
      ) : (
        <TransportOptionPicker
          vehicles={[]}
          services={services}
          selected={selected}
          onSelect={onChange}
          variant="admin"
        />
      )}
    </div>
  );
}
