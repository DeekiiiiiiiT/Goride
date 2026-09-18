/**
 * Flag meanings + “what to check” — desk overlay, resolve dialog, legend share this.
 */
import { FUEL_FLAG_CATEGORY_LEGEND } from '../../../utils/fuelFillFlagClassify';

export type FuelFlagGlossaryEntry = {
  code: string;
  title: string;
  meaning: string;
};

export type FuelFlagCheckGuide = {
  /** One short line: what the app noticed. */
  summary: string;
  /** Concrete things the user should verify. */
  checks: string[];
};

/** Canonical meanings for classifier codes + common anomaly reason titles. */
export const FUEL_FLAG_BY_CODE: Record<string, FuelFlagGlossaryEntry> = {
  signal_exception: {
    code: 'signal_exception',
    title: 'Exception',
    meaning: 'Hard problem fill — blocks Finalize until accepted with a note or edited.',
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

const DEFAULT_CHECKS: string[] = [
  'Open the fill and confirm date, liters, $ amount, and payment source match the receipt/card',
  'Confirm the correct vehicle and driver are on this fill',
  'If the numbers are wrong → Edit fill; if they are right → Accept with a short note',
];

/** Guides keyed by normalized anomaly title / classifier title. */
const FLAG_CHECK_GUIDES: Record<string, FuelFlagCheckGuide> = {
  'approaching capacity': {
    summary: 'This purchase is almost as large as the vehicle’s full tank size.',
    checks: [
      'Open the vehicle profile and confirm tank capacity (liters) is the real tank size — not blank or a guess',
      'Confirm the liters on this fill match the gas-card / receipt (typo or wrong unit can inflate liters)',
      'Ask the driver: was the tank nearly empty before this stop, or was this a normal top-up?',
      'If capacity + liters look correct, Accept — large legitimate fill-ups do happen',
    ],
  },
  'fragmented purchase': {
    summary: 'This purchase is a very small share of the tank (tiny top-up).',
    checks: [
      'Confirm liters on the fill match the receipt (not a partial card auth or split charge)',
      'Ask if the driver meant to buy a small top-up, or if another fill for the same stop is missing',
      'Watch for a pattern of many tiny card taps in a short window (possible jerry-can / second tank)',
      'If it was an intentional small top-up, Accept with a note',
    ],
  },
  'tank overflow': {
    summary: 'One fill is bigger than the tank can physically hold.',
    checks: [
      'Confirm tank capacity on the vehicle is correct',
      'Confirm liters on this fill match the receipt (extra zero / wrong decimal is common)',
      'If liters are real and larger than capacity → wrong vehicle on the fill, or fuel went into something else (jerry can / second vehicle)',
      'Fix capacity or Edit the fill; only Accept if you verified the story in writing',
    ],
  },
  'tank overfill anomaly': {
    summary: 'Fuel stacked into this tank cycle went past what the tank can hold.',
    checks: [
      'Confirm tank capacity on the vehicle is correct',
      'Review recent fills in this cycle — a missed “full” close or duplicate import can stack liters too high',
      'Confirm each fill’s liters match receipts (no double-imported card rows)',
      'Fix capacity / edit bad fills; Accept only after the stack makes physical sense',
    ],
  },
  'soft anchor / tank overfill': {
    summary: 'Running total since the last full tank is over capacity (soft overfill).',
    checks: [
      'Confirm tank capacity on the vehicle',
      'Look for a missed full-tank fill that should have closed the prior cycle',
      'Check for duplicate card imports adding extra liters',
      'Edit or re-import bad rows; Accept only if the overfill is explained',
    ],
  },
  'high fuel consumption': {
    summary: 'Liters used vs km driven look much worse than this vehicle usually gets.',
    checks: [
      'Confirm odometer readings around this fill are real (not typed wrong or stuck)',
      'Confirm liters on intervening fills match receipts',
      'Ask about idling, towing, AC, traffic, or personal/off-platform km that would burn more fuel',
      'If distance or liters are wrong → Edit; if the trip really was inefficient → Accept with a note',
    ],
  },
  'high fuel consumption detected': {
    summary: 'Liters used vs km driven look much worse than this vehicle usually gets.',
    checks: [
      'Confirm odometer readings around this fill are real (not typed wrong or stuck)',
      'Confirm liters on intervening fills match receipts',
      'Ask about idling, towing, AC, traffic, or personal/off-platform km that would burn more fuel',
      'If distance or liters are wrong → Edit; if the trip really was inefficient → Accept with a note',
    ],
  },
  'high transaction frequency': {
    summary: 'This gas card was used many times in a short window.',
    checks: [
      'Open neighboring fills the same day — are they real separate stops or duplicate card posts?',
      'Ask the driver why so many taps (split payment, pump restart, second container)',
      'Confirm each fill’s vehicle/plate is correct',
      'Delete/edit duplicates; Accept a real multi-stop day with a note',
    ],
  },
  'high fuel velocity ($/km)': {
    summary: 'Dollars spent per km look unusually high for this stretch.',
    checks: [
      'Confirm $ amount and liters match the receipt',
      'Confirm odometer advanced between fills (zero/low km with high $ is the red flag)',
      'Check for personal/off-platform driving not reflected in trips',
      'Edit bad odometer/$ rows; Accept only if spend vs distance is explained',
    ],
  },
  'odometer regression': {
    summary: 'This odometer reading is lower than the previous one — distance math breaks.',
    checks: [
      'Open this fill and the previous fill — which reading is wrong?',
      'Check for a typo, swapped digits, or a photo/OCR misread',
      'Ask if the cluster was replaced / rolled back (rare but real)',
      'Edit the wrong reading; do not Accept until the sequence goes forward again',
    ],
  },
  'odometer gap detected': {
    summary: 'Odometer jumped farther than expected between fills.',
    checks: [
      'Confirm both readings (before and after) match dash photos / known truth',
      'Ask if someone drove a long personal/off-platform stretch between fills',
      'Check for a skipped fill that should sit in the gap',
      'Edit bad readings or Accept with a note if the long gap is real',
    ],
  },
  'odometer stagnation': {
    summary: 'Odometer barely moved (or did not move) between fills.',
    checks: [
      'Confirm the driver actually entered a new reading (not copied from last time)',
      'Confirm both fills belong to the same vehicle',
      'Ask if the vehicle sat idle while someone else fueled, or a wrong plate was used',
      'Edit the stuck reading; Accept only if zero-km between fills is intentional and explained',
    ],
  },
  'location anomaly': {
    summary: 'Where the fill says it happened does not match GPS / known station for this stop.',
    checks: [
      'Confirm station name / merchant on the card matches where the driver says they fueled',
      'Check for a wrong station link or old merchant alias on the fill',
      'Ask if the card was used at a different pump brand than the mapped station',
      'Fix the station link or Accept with a note if the driver confirms the stop',
    ],
  },
  'spatial identity mismatch (possible spoof)': {
    summary: 'Card merchant / GPS identity for this fill looks inconsistent (possible wrong location).',
    checks: [
      'Compare card merchant name to the mapped station on the fill',
      'Ask the driver which station they used that day',
      'Fix a bad station match rather than Accepting blindly',
      'Accept only if merchant + driver story line up',
    ],
  },
  'station median outlier': {
    summary: 'Price per liter is high vs what this station usually charges lately.',
    checks: [
      'Confirm $/L and total $ match the receipt (not a mis-typed amount)',
      'Confirm liters are correct — wrong liters make $/L look extreme',
      'Check if this was premium fuel, a different product, or a fee-heavy pump',
      'Edit wrong numbers; Accept if the receipt really was that expensive',
    ],
  },
  exception: {
    summary: 'This fill is a hard exception and will block Finalize until you handle it.',
    checks: [
      'Read the specific reason on the fill (overflow, odometer, etc.) and follow that checklist',
      'Confirm liters, $, odometer, vehicle, and station against the receipt',
      'Edit anything wrong; Accept with an 8+ character note only if the fill is truly correct',
    ],
  },
  'exception fill': {
    summary: 'This fill is a hard exception and will block Finalize until you handle it.',
    checks: [
      'Read the specific reason on the fill and follow that checklist',
      'Confirm liters, $, odometer, vehicle, and station against the receipt',
      'Edit anything wrong; Accept with an 8+ character note only if the fill is truly correct',
    ],
  },
  'integrity critical': {
    summary: 'Auto rules marked this fill as badly wrong.',
    checks: [
      'Read the named reason on the badge and use that checklist',
      'Verify liters, $, odometer, and vehicle on the fill',
      'Edit to fix; Accept with a note only after you can explain why the rule fired',
    ],
  },
  'integrity warning': {
    summary: 'Auto rules marked this fill as suspicious (not a hard block by itself).',
    checks: [
      'Read the named reason on the badge and use that checklist',
      'Spot-check liters, $, and odometer',
      'Accept if normal; Edit if something is off',
    ],
  },
  'fill flagged': {
    summary: 'This fill was flagged for capacity or outlier-style review.',
    checks: [
      'Open the fill details and note which specific reason badge is listed',
      'Use that reason’s checklist (capacity, tiny purchase, price, etc.)',
      'Accept or Edit once you know which story applies',
    ],
  },
  isflagged: {
    summary: 'This fill was flagged for capacity or outlier-style review.',
    checks: [
      'Open the fill details and note which specific reason badge is listed',
      'Use that reason’s checklist (capacity, tiny purchase, price, etc.)',
      'Accept or Edit once you know which story applies',
    ],
  },
};

function normalizeFlagKey(reason: string): string {
  return reason
    .trim()
    .toLowerCase()
    .replace(/:$/, '')
    .replace(/\s+/g, ' ');
}

/** Strip trailing detail after a colon for keys like "Tank Overflow: Single transaction…". */
function guideKeysForReason(reason: string): string[] {
  const full = normalizeFlagKey(reason);
  const keys = [full];
  const colon = full.indexOf(':');
  if (colon > 0) keys.push(full.slice(0, colon).trim());
  // Semicolon-joined multi reasons — try each piece
  for (const part of full.split(';')) {
    const p = part.trim();
    if (p) keys.push(p);
  }
  return keys;
}

export function flagCheckGuideForReason(reason: string | undefined | null): FuelFlagCheckGuide {
  const r = String(reason || '').trim();
  if (!r) {
    return {
      summary: 'This fill was flagged as a hard problem.',
      checks: DEFAULT_CHECKS,
    };
  }

  for (const entry of Object.values(FUEL_FLAG_BY_CODE)) {
    if (entry.title.toLowerCase() === r.toLowerCase()) {
      const keyed = FLAG_CHECK_GUIDES[normalizeFlagKey(entry.title)];
      if (keyed) return keyed;
      return { summary: entry.meaning, checks: DEFAULT_CHECKS };
    }
  }

  for (const key of guideKeysForReason(r)) {
    const hit = FLAG_CHECK_GUIDES[key];
    if (hit) return hit;
  }

  // Partial contains for compound backend strings
  for (const [key, guide] of Object.entries(FLAG_CHECK_GUIDES)) {
    if (normalizeFlagKey(r).includes(key)) return guide;
  }

  return {
    summary: `"${r}" — review this fill before you Accept.`,
    checks: DEFAULT_CHECKS,
  };
}

/** Plain-English one-liner (legacy callers). Prefer flagCheckGuideForReason in UI. */
export function plainEnglishForFlagReason(reason: string | undefined | null): string {
  return flagCheckGuideForReason(reason).summary;
}

/** Legacy grouped shape for analytics help UI — derived from legend + code map. */
export type FuelFlagGlossaryItem = { title: string; meaning: string; checks?: string[] };
export type FuelFlagGlossaryGroup = { heading: string; items: FuelFlagGlossaryItem[] };

export const FUEL_FLAG_GLOSSARY: FuelFlagGlossaryGroup[] = FUEL_FLAG_CATEGORY_LEGEND.map((cat) => {
  const fromRows = cat.rows.map((row) => {
    const guide = flagCheckGuideForReason(row.flag);
    return {
      title: row.flag,
      meaning: guide.summary,
      checks: guide.checks,
    };
  });
  const fromBullets = (cat.bullets || [])
    .map((b) => {
      const title = b.split('—')[0]?.trim() || b;
      if (fromRows.some((r) => r.title.toLowerCase() === title.toLowerCase())) return null;
      const guide = flagCheckGuideForReason(title);
      return {
        title,
        meaning: guide.summary,
        checks: guide.checks,
      };
    })
    // Null narrow only — predicate on FuelFlagGlossaryItem fails because checks? is optional.
    .filter((x): x is NonNullable<typeof x> => x != null);
  return {
    heading: cat.title,
    items: [...fromRows, ...fromBullets],
  };
});
