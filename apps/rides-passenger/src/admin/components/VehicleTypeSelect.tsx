import React from 'react';
import { Loader2 } from 'lucide-react';
import { DEFAULT_VEHICLE_OPTION, vehicleCapacityDisplay } from '@/types/vehicleTypes';
import { useVehicleTypesContext } from '../context/VehicleTypesContext';

type Props = {
  value: string;
  onChange: (slug: string) => void;
};

export function VehicleTypeSelect({ value, onChange }: Props) {
  const { active, loading } = useVehicleTypesContext();
  const selected = value || DEFAULT_VEHICLE_OPTION;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">Vehicle type</label>
      {loading && active.length === 0 ? (
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading types…
        </p>
      ) : (
        <div className="space-y-2">
          {active.map((v) => {
            const isActive = selected === v.slug;
            return (
              <button
                key={v.slug}
                type="button"
                onClick={() => onChange(v.slug)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`font-medium text-sm ${isActive ? 'text-emerald-200' : 'text-white'}`}
                  >
                    {v.label}
                  </span>
                  <span className="text-[11px] text-slate-500 shrink-0">
                    {vehicleCapacityDisplay(v)}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{v.description}</p>
                {v.tagline && <p className="text-[11px] text-slate-500 mt-1">{v.tagline}</p>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
