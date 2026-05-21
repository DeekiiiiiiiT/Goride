import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { TransportOptionPicker } from '@/components/TransportOptionPicker';
import { useVehicleTypesContext } from '../context/VehicleTypesContext';

type Props = {
  value: string;
  onChange: (slug: string) => void;
};

export function VehicleTypeSelect({ value, onChange }: Props) {
  const { services, loading, active } = useVehicleTypesContext();
  const serviceSlugs = new Set(services.map((s) => s.slug));
  const selected =
    value && serviceSlugs.has(value) ? value : services[0]?.slug ?? '';

  useEffect(() => {
    if (selected && selected !== value) onChange(selected);
  }, [selected, value, onChange]);

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
