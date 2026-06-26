import { JOB_STATION_OPTIONS, type JobStation, type VenueStyle } from '../types/team';

/** Default enabled stations when none configured (matches backend). */
export const DEFAULT_ENABLED_STATIONS: JobStation[] = [
  'counter',
  'kitchen',
  'manager',
  'pos',
];

/** Template presets — must stay in sync with `merchantVenueOps.ts`. */
export const VENUE_TEMPLATE_PRESETS: Record<Exclude<VenueStyle, 'custom'>, JobStation[]> = {
  fast_food: ['pos', 'kitchen', 'counter', 'drive_thru', 'manager'],
  sports_bar: ['pos', 'bar', 'kitchen', 'expo', 'counter', 'manager'],
  fine_dining: ['pos', 'kitchen', 'expo', 'manager'],
  cafe: ['pos', 'kitchen', 'manager'],
  ghost_kitchen: ['kitchen', 'counter', 'manager'],
  delivery_only: ['kitchen', 'counter', 'manager'],
};

export const VENUE_STYLE_LABELS: Record<VenueStyle, string> = {
  fast_food: 'Fast food',
  sports_bar: 'Sports bar',
  fine_dining: 'Fine dining',
  cafe: 'Café',
  ghost_kitchen: 'Ghost kitchen',
  delivery_only: 'Delivery only',
  custom: 'Custom',
};

export const VENUE_STYLE_DESCRIPTIONS: Record<Exclude<VenueStyle, 'custom'>, string> = {
  fast_food: 'Counter service, drive-thru lane, and kitchen line',
  sports_bar: 'Bar drinks, expo pass, and full floor coverage',
  fine_dining: 'Table service with expo assembly',
  cafe: 'Quick counter and kitchen prep',
  ghost_kitchen: 'Delivery and pickup only — no dine-in POS',
  delivery_only: 'Roam delivery handoff and kitchen',
};

export const ALL_JOB_STATIONS: JobStation[] = JOB_STATION_OPTIONS.map((entry) => entry.value);

export interface VenueOpsData {
  venueStyle: VenueStyle | null;
  enabledStations: JobStation[];
  templatePresets: { venueStyle: Exclude<VenueStyle, 'custom'>; enabledStations: JobStation[] }[];
}

export const FIXTURE_VENUE_OPS: VenueOpsData = {
  venueStyle: 'fast_food',
  enabledStations: [...DEFAULT_ENABLED_STATIONS],
  templatePresets: Object.entries(VENUE_TEMPLATE_PRESETS).map(([venueStyle, enabledStations]) => ({
    venueStyle: venueStyle as Exclude<VenueStyle, 'custom'>,
    enabledStations,
  })),
};

export interface PrepStation {
  id: string;
  name: string;
  sortOrder: number;
}

export const FIXTURE_PREP_STATIONS: PrepStation[] = [
  { id: 'prep-grill', name: 'Grill', sortOrder: 0 },
  { id: 'prep-fry', name: 'Fry', sortOrder: 1 },
  { id: 'prep-cold', name: 'Cold', sortOrder: 2 },
];
