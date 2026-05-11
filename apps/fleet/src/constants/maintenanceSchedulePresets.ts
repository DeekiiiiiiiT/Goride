/**
 * Shared A–D service intervals + checklist lines (fleet UI + Super Admin template quick-fill).
 * Description in templates is stored as newline-separated lines for checklist display downstream.
 */
export interface MaintenanceSchedulePreset {
  id: string;
  label: string;
  interval_miles: number;
  /** Suggested months for Super Admin quick-fill */
  interval_months: number;
  items: string[];
  sort_order: number;
}

export const MAINTENANCE_SCHEDULE_PRESETS: MaintenanceSchedulePreset[] = [
  {
    id: "A",
    label: "Basic Service (Every 5,000 km)",
    interval_miles: 5000,
    interval_months: 3,
    sort_order: 0,
    items: [
      "Replace Engine Oil (0W-20 or 5W-30)",
      "Replace Oil Filter",
      "Check Tire Pressures",
      "Top Up Window Washer Fluid",
      "Check Coolant Level",
      "Check Lights",
    ],
  },
  {
    id: "B",
    label: "Intermediate Service (Every 10,000 km)",
    interval_miles: 10000,
    interval_months: 6,
    sort_order: 1,
    items: [
      "Includes all Basic Service items",
      "Rotate Tires",
      "Inspect/Clean/Replace Engine Air Filter",
      "Replace Cabin A/C Filter",
      "Inspect Wiper Blades",
      "Inspect Brake Pads",
    ],
  },
  {
    id: "C",
    label: "Major Service (Every 40,000 km)",
    interval_miles: 40000,
    interval_months: 24,
    sort_order: 2,
    items: [
      "Includes all Intermediate Service items",
      "Drain & Refill CVT Transmission Fluid",
      "Flush & Replace Brake Fluid",
      "Inspect Drive/Serpentine Belt",
      "Inspect Suspension Bushings & Boots",
    ],
  },
  {
    id: "D",
    label: "Long-Term Service (Every 100,000 km)",
    interval_miles: 100000,
    interval_months: 60,
    sort_order: 3,
    items: ["Replace Spark Plugs (Iridium)", "Flush Radiator Coolant"],
  },
];
