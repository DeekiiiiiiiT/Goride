import React from 'react';
import {
  DEFAULT_RIDES_VEHICLE_TYPE,
  RIDES_VEHICLE_TYPES,
  vehicleCapacityDisplay,
  type RidesVehicleTypeSlug,
} from '@roam/business-config';

type Props = {
  value: string;
  onChange: (slug: string) => void;
};

export function VehicleTypeSelect({ value, onChange }: Props) {
  const selected = (value || DEFAULT_RIDES_VEHICLE_TYPE) as RidesVehicleTypeSlug;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">Vehicle type</label>
      <div className="space-y-2">
        {RIDES_VEHICLE_TYPES.map((v) => {
          const active = selected === v.slug;
          return (
            <button
              key={v.slug}
              type="button"
              onClick={() => onChange(v.slug)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-medium text-sm ${active ? 'text-emerald-200' : 'text-white'}`}>
                  {v.label}
                </span>
                <span className="text-[11px] text-slate-500 shrink-0">
                  {vehicleCapacityDisplay(v)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{v.description}</p>
              {v.slug === 'courier' && (
                <p className="text-[11px] text-slate-500 mt-1">Send a package</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function vehicleTypeTableLabel(slug: string): string {
  const hit = RIDES_VEHICLE_TYPES.find((v) => v.slug === slug);
  if (hit) return hit.label;
  if (slug === 'standard') return 'UberX (legacy)';
  return slug;
}
