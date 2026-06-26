import {
  VENUE_STYLE_DESCRIPTIONS,
  VENUE_STYLE_LABELS,
  VENUE_TEMPLATE_PRESETS,
} from '../../lib/venue-ops-presets';
import type { JobStation, VenueStyle } from '../../types/team';
import { STATION_LABELS } from '../../types/team';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface VenueTemplatePickerProps {
  selectedStyle: VenueStyle | null;
  onSelect: (style: Exclude<VenueStyle, 'custom'>) => void;
  disabled?: boolean;
}

const TEMPLATE_STYLES = Object.keys(VENUE_TEMPLATE_PRESETS) as Exclude<VenueStyle, 'custom'>[];

function stationSummary(stations: JobStation[]) {
  return stations.map((s) => STATION_LABELS[s]).join(' · ');
}

export default function VenueTemplatePicker({
  selectedStyle,
  onSelect,
  disabled = false,
}: VenueTemplatePickerProps) {
  return (
    <section className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <div>
        <h3 className="text-title-md font-semibold text-on-background">Venue template</h3>
        <p className="mt-inset-xs text-body-sm text-on-surface-variant">
          Pick a layout that matches how you run service. You can fine-tune stations below.
        </p>
      </div>
      <div className="grid gap-inset-sm sm:grid-cols-2">
        {TEMPLATE_STYLES.map((style) => {
          const selected = selectedStyle === style;
          const stations = VENUE_TEMPLATE_PRESETS[style];
          return (
            <button
              key={style}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(style)}
              className={`rounded-lg border p-inset-md text-left transition-colors ${
                selected
                  ? 'border-primary-container bg-primary-container/10'
                  : 'border-outline-variant bg-surface hover:border-primary-container/30'
              }`}
            >
              <div className="flex items-start justify-between gap-inset-sm">
                <span className="text-body-sm font-semibold text-on-background">
                  {VENUE_STYLE_LABELS[style]}
                </span>
                {selected && (
                  <MaterialIcon name="check_circle" className="shrink-0 text-primary" size={20} />
                )}
              </div>
              <p className="mt-inset-xs text-label-sm text-on-surface-variant">
                {VENUE_STYLE_DESCRIPTIONS[style]}
              </p>
              <p className="mt-inset-sm text-label-sm text-on-surface-variant/80">
                {stationSummary(stations)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
