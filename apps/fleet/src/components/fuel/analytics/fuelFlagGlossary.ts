/**
 * Single glossary keyed by flag_code — desk legend + resolve dialog share this.
 */
import { FUEL_FLAG_CATEGORY_LEGEND } from '../../../utils/fuelFillFlagClassify';

export type FuelFlagGlossaryEntry = {
  code: string;
  title: string;
  meaning: string;
};

/** Canonical meanings for classifier codes + common anomaly reason titles. */
export const FUEL_FLAG_BY_CODE: Record<string, FuelFlagGlossaryEntry> = {
  signal_exception: {
    code: 'signal_exception',
    title: 'Exception',
    meaning:
      'Hard problem fill — blocks Finalize until accepted with a note or edited.',
  },
  integrity_critical: {
    code: 'integrity_critical',
    title: 'Integrity critical',
    meaning: 'Auto rules said this fill is badly wrong.',
  },
  integrity_warning: {
    code: 'integrity_warning',
    title: 'Integrity warning',
    meaning: 'Suspicious but milder than critical.',
  },
  is_flagged: {
    code: 'is_flagged',
    title: 'Fill flagged',
    meaning: 'Generic capacity/outlier style flag on this fill.',
  },
  location_anomaly: {
    code: 'location_anomaly',
    title: 'Location anomaly',
    meaning: 'GPS/station match looks wrong for this fill.',
  },
  price_outlier: {
    code: 'price_outlier',
    title: 'Station median outlier',
    meaning: 'Paid $/L is high versus this station’s recent median for the period.',
  },
};

/** Plain-English lookup for resolve dialog — exact title or known anomaly phrases. */
export function plainEnglishForFlagReason(reason: string | undefined | null): string {
  const r = String(reason || '').trim();
  if (!r) {
    return 'This fill was flagged as a hard problem. Accept with a note if it is correct, or edit the fill.';
  }
  for (const entry of Object.values(FUEL_FLAG_BY_CODE)) {
    if (entry.title.toLowerCase() === r.toLowerCase()) return entry.meaning;
  }
  // Common backend anomalyReason strings
  const byTitle: Record<string, string> = {
    'tank overflow': 'One fill is bigger than the tank can hold.',
    'odometer regression':
      'The new reading is lower than the previous one — distance math cannot be trusted until fixed.',
    'high fuel consumption':
      'Fuel used was much higher than expected for the distance driven.',
    'approaching capacity': 'Tank is nearly full relative to capacity.',
    'fragmented purchase': 'Very small litre purchase — often a tip-off for odd behaviour.',
  };
  const hit = byTitle[r.toLowerCase()];
  if (hit) return hit;
  return `"${r}" — review the fill numbers, then accept with a note or edit.`;
}

/** Legacy grouped shape for analytics help UI — derived from legend + code map. */
export type FuelFlagGlossaryItem = { title: string; meaning: string };
export type FuelFlagGlossaryGroup = { heading: string; items: FuelFlagGlossaryItem[] };

export const FUEL_FLAG_GLOSSARY: FuelFlagGlossaryGroup[] = FUEL_FLAG_CATEGORY_LEGEND.map((cat) => ({
  heading: cat.title,
  items: cat.rows.map((row) => ({ title: row.flag, meaning: row.meaning })),
}));
