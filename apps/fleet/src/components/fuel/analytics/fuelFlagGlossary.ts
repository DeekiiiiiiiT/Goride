/** Plain-English glossary for Flagged Events Feed help (?). */

export type FuelFlagGlossaryItem = {
  title: string;
  meaning: string;
};

export type FuelFlagGlossaryGroup = {
  heading: string;
  items: FuelFlagGlossaryItem[];
};

export const FUEL_FLAG_GLOSSARY: FuelFlagGlossaryGroup[] = [
  {
    heading: 'Efficiency & leakage',
    items: [
      {
        title: 'Efficiency Crash',
        meaning:
          'This vehicle’s km per litre fell sharply compared with last week. Often points to misuse, a mechanical issue, or bad odometer data.',
      },
      {
        title: 'High Fuel Consumption',
        meaning:
          'Fuel used was much higher than expected for the distance driven. Worth checking trips, odometer, and whether personal driving is in the mix.',
      },
      {
        title: 'Confirmed Operational Leakage (Efficiency Gap)',
        meaning:
          'At a full-tank (or similar) fill, efficiency is clearly worse than it should be — stronger signal that fuel isn’t matching real work miles.',
      },
      {
        title: 'Elevated Consumption Variance',
        meaning:
          'Efficiency is drifting below normal, but not as severe as a confirmed leak. A watch item more than an emergency.',
      },
      {
        title: 'Predictive Leakage Alert: Extreme Mid-Cycle Drift',
        meaning:
          'Before the tank is full, mid-cycle efficiency looks badly off. Early warning so you can investigate before the next full fill.',
      },
      {
        title: 'Predictive Warning: Utilization/Efficiency Mismatch',
        meaning:
          'The tank is largely used and efficiency already looks wrong. Soft early warning that something may not add up.',
      },
    ],
  },
  {
    heading: 'Odometer',
    items: [
      {
        title: 'Odometer Regression',
        meaning:
          'The new reading is lower than the previous one. Usually a typo, wrong vehicle, or a reset — distance math cannot be trusted until fixed.',
      },
      {
        title: 'Odometer Gap Detected',
        meaning:
          'The jump between readings is larger than expected. Could mean missing fills, skipped logging, or an incorrect entry.',
      },
      {
        title: 'Odometer Stagnation',
        meaning:
          'The odometer did not change between fills. Unlikely if the car was working — often a copy-paste or entry mistake.',
      },
    ],
  },
  {
    heading: 'Tank & purchase behaviour',
    items: [
      {
        title: 'Tank Overfill Anomaly',
        meaning:
          'Litres pumped exceed what that vehicle’s tank can hold. Common causes: wrong vehicle, wrong litres, or a capacity setting that is too low.',
      },
      {
        title: 'Soft Anchor / Tank Overfill',
        meaning:
          'The system soft-closed a fuel cycle near capacity and still saw overfill-like volume. Review the fill size and tank capacity on the vehicle.',
      },
      {
        title: 'High Transaction Frequency',
        meaning:
          'The same fuel card was swiped unusually often in a short window. Linked admin+statement pairs count as one swipe — only unmatched swipes flag.',
      },
      {
        title: 'Fragmented Purchase',
        meaning:
          'A very small fill relative to tank size. Small top-ups can be legitimate, but repeated ones make usage harder to audit.',
      },
      {
        title: 'Approaching Capacity',
        meaning:
          'Fill volume in the current cycle is getting close to a full tank. A heads-up while the cycle nears close — not usually an alarm by itself.',
      },
    ],
  },
  {
    heading: 'Location & GPS',
    items: [
      {
        title: 'Spatial Identity Mismatch (Possible Spoof)',
        meaning:
          'The driver claim says they were at the pump, but server GPS does not agree. Treat as a location trust issue until reviewed.',
      },
      {
        title: 'Missing Deviation Reason',
        meaning:
          'The fill is far from a known station and no reason was given. Ask for context (cash station, private pump, GPS drift, etc.).',
      },
      {
        title: 'Extreme Proximity Deviation',
        meaning:
          'GPS puts this fill well outside the station geofence. Confirm whether the location is wrong or the station map needs an update.',
      },
    ],
  },
  {
    heading: 'Signal tiers',
    items: [
      {
        title: 'Observe',
        meaning: 'Logged for ops — does not block finalize or appear in the Exceptions header count.',
      },
      {
        title: 'Review',
        meaning: 'Queue item (unmatched card, same-day overlap). Warn on finalize; does not block.',
      },
      {
        title: 'Exception',
        meaning: 'Real problem — blocks finalize and counts in Transaction Logs "Exceptions".',
      },
    ],
  },
];
