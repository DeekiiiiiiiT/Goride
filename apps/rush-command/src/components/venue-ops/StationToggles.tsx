import { useState } from 'react';
import {
  JOB_STATION_OPTIONS,
  type JobStation,
} from '../../types/team';
import { ALL_JOB_STATIONS } from '../../lib/venue-ops-presets';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import StationExplainerSheet from './StationExplainerSheet';

interface StationTogglesProps {
  enabledStations: JobStation[];
  onChange: (stations: JobStation[]) => void;
  disabled?: boolean;
}

export default function StationToggles({
  enabledStations,
  onChange,
  disabled = false,
}: StationTogglesProps) {
  const [explainerStation, setExplainerStation] = useState<JobStation | null>(null);
  const enabled = new Set(enabledStations);

  const toggle = (station: JobStation) => {
    if (disabled) return;
    const next = new Set(enabled);
    if (next.has(station)) {
      if (next.size <= 1) return;
      next.delete(station);
    } else {
      next.add(station);
    }
    onChange(ALL_JOB_STATIONS.filter((s) => next.has(s)));
  };

  return (
    <>
      <section className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
        <div>
          <h3 className="text-title-md font-semibold text-on-background">Active stations</h3>
          <p className="mt-inset-xs text-body-sm text-on-surface-variant">
            Turn on the tablet views your floor team needs. At least one station must stay on.
          </p>
        </div>
        <div className="space-y-inset-sm">
          {JOB_STATION_OPTIONS.map((option) => {
            const isOn = enabled.has(option.value);
            return (
              <div
                key={option.value}
                className="flex items-center justify-between gap-inset-md rounded-lg border border-outline-variant px-inset-md py-inset-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-semibold text-on-background">
                    {option.label}
                  </p>
                  <p className="text-label-sm text-on-surface-variant">{option.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setExplainerStation(option.value)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-variant"
                    aria-label={`About ${option.label}`}
                  >
                    <MaterialIcon name="info" size={20} />
                  </button>
                  <label className="flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={isOn}
                      disabled={disabled || (isOn && enabled.size <= 1)}
                      onChange={() => toggle(option.value)}
                      className="h-5 w-5"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <StationExplainerSheet
        station={explainerStation}
        onClose={() => setExplainerStation(null)}
      />
    </>
  );
}
