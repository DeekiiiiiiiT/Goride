import { useState } from 'react';
import type { JobStation, VenueStyle } from '../../types/team';
import { useVenueOps } from '../../hooks/useVenueOps';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import VenueTemplatePicker from './VenueTemplatePicker';
import StationToggles from './StationToggles';

interface OperationsHubProps {
  merchantId: string;
  onBack?: () => void;
}

export default function OperationsHub({ merchantId, onBack }: OperationsHubProps) {
  const { venueOps, updateVenueOps, applyTemplate, isSaving, useApi } = useVenueOps(merchantId);
  const [localStations, setLocalStations] = useState<JobStation[] | null>(null);
  const enabledStations = localStations ?? venueOps.enabledStations;

  const handleTemplateSelect = (style: Exclude<VenueStyle, 'custom'>) => {
    applyTemplate(style);
    setLocalStations(null);
  };

  const handleStationsChange = (stations: JobStation[]) => {
    setLocalStations(stations);
    updateVenueOps({ enabledStations: stations, venueStyle: 'custom' });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      {onBack && (
        <header className="safe-t shrink-0 border-b border-outline-variant bg-surface">
          <div className="flex h-14 items-center gap-inset-sm px-margin-mobile md:px-margin-tablet">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container-high"
              aria-label="Back to account"
            >
              <MaterialIcon name="arrow_back" />
            </button>
            <h1 className="text-headline-md font-bold text-on-surface">Operations Hub</h1>
          </div>
        </header>
      )}
      <main className={`flex-1 overflow-auto ${onBack ? 'pb-[var(--app-bottom-nav-total)]' : ''}`}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-inset-lg p-margin-mobile md:p-margin-tablet">
      {!useApi && (
        <p className="rounded-lg border border-outline-variant bg-surface-container-low px-inset-md py-inset-sm text-body-sm text-on-surface-variant">
          Preview mode — turn on the venue operations flag in dev settings to save to your store.
        </p>
      )}
      <VenueTemplatePicker
        selectedStyle={venueOps.venueStyle}
        onSelect={handleTemplateSelect}
        disabled={isSaving}
      />
      <StationToggles
        enabledStations={enabledStations}
        onChange={handleStationsChange}
        disabled={isSaving}
      />
        </div>
      </main>
    </div>
  );
}
