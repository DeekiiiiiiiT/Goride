/** Stitch FP3–FP12 visual capture fixtures (e2e only — not shipped in app bundle). */

export const STITCH_VISUAL_VEHICLE_ID = "veh-stitch-visual";
export const STITCH_VISUAL_VARIANT_ID = "3cd9cbf3-0000-4000-8000-stitch00001";
export const STITCH_VISUAL_PLATE = "5179KZ";
export const STITCH_VISUAL_LABEL = "2019 Toyota Roomy";
export const STITCH_VISUAL_COMPONENT_ID = "cmp-brake-pad";

const AREA_ROWS: Array<{ id: string; plainName: string; count: number; icon: string }> = [
  { id: "sys-battery", plainName: "Battery & electrical", count: 3, icon: "bolt" },
  { id: "sys-belts", plainName: "Belts & hoses", count: 2, icon: "belt" },
  { id: "sys-brakes", plainName: "Brakes", count: 8, icon: "brakes" },
  { id: "sys-engine", plainName: "Engine", count: 5, icon: "gears" },
  { id: "sys-filters", plainName: "Filters", count: 4, icon: "oil" },
  { id: "sys-fluids", plainName: "Fluids", count: 6, icon: "droplet" },
  { id: "sys-hvac", plainName: "HVAC", count: 1, icon: "wind" },
  { id: "sys-lighting", plainName: "Lighting & visibility", count: 5, icon: "highlight" },
  { id: "sys-suspension", plainName: "Suspension & steering", count: 2, icon: "suspension" },
  { id: "sys-tires", plainName: "Tires & wheels", count: 4, icon: "tires" },
  { id: "sys-transmission", plainName: "Transmission", count: 3, icon: "gears" },
];

export function stitchVisualBrowse() {
  return {
    systems: AREA_ROWS.map((row) => ({
      id: row.id,
      plainName: row.plainName,
      name: row.plainName,
      count: row.count,
      icon: row.icon,
      components: row.id === "sys-brakes"
        ? [{
          id: STITCH_VISUAL_COMPONENT_ID,
          plainName: "Front brake pad set",
          name: "Front brake pad set",
          count: 8,
          positionAware: true,
        }]
        : [],
    })),
    common: [
      { id: "cmp-oil", plainName: "Oil filter cartridge", name: "Oil filter cartridge", count: 2, positionAware: false },
      { id: "cmp-air", plainName: "Engine air filter", name: "Engine air filter", count: 1, positionAware: false },
      { id: "cmp-stitch-fp8", plainName: "Intake panel", name: "Intake panel", count: 0, positionAware: false },
    ],
  };
}

export function stitchVisualVehicleContext() {
  return {
    label: STITCH_VISUAL_LABEL,
    plate: STITCH_VISUAL_PLATE,
    variantId: STITCH_VISUAL_VARIANT_ID,
    version: "Pre-Facelift · 1KR-FE · 2WD",
    odometer: 84200,
    lastService: "Fixture brake service",
    health_pct: 91,
    hub_label: "Kingston East Hub",
    trim: "Pre-Facelift · 1KR-FE · 2WD",
    orgShortCode: "KIN-FLEET",
    specs: {
      trim_series: "Pre-Facelift",
      engine_code: "1KR-FE",
      engine_displacement_l: 0.996,
      drivetrain: "2WD",
      chassis_code: "M900A-BGBGE",
      engineFilterLine: "1KR-FE (996 cc I3)",
    },
    latestNote: null,
    alternateTrimsLine: "",
  };
}

export function stitchVisualActivity() {
  return {
    requests: {
      total: 2,
      items: [
        {
          id: "req-stitch-1",
          need_text: "Front brake pad set",
          status: "open",
          created_at: "2026-07-12T12:00:00Z",
        },
        {
          id: "req-stitch-2",
          need_text: "Alternator serpentine belt",
          status: "sourcing",
          created_at: "2026-07-13T14:40:00Z",
        },
      ],
    },
    quotes: { total: 0, items: [] },
    repeatAlerts: { total: 0, items: [] },
    warrantyClaims: { total: 0, items: [] },
    cores: { total: 0, items: [] },
  };
}

export function stitchVisualFindSections() {
  return {
    standard_ref: "JIS D4411-2015",
    sections: [
      {
        tier: 1,
        label: "Made for your car",
        items: [{
          tier: 1,
          position: "rear",
          part: {
            id: "part-stitch-oem-1",
            name: "Rear brake shoe kit (drum)",
            brand: "Toyota",
            manufacturer: "Toyota",
            oem_part_number: "04495-B2400",
            maintenance_component_id: STITCH_VISUAL_COMPONENT_ID,
            standard_ref: "JIS D4411-2015",
          },
          verified: true,
          matchPct: 100,
          specs: [
            { key: "Drum Diameter", value: "180.0 mm" },
            { key: "Lining", value: "Semi-Metallic" },
          ],
          interchange: "Daihatsu: 04495-B2360 · Subaru: 04495-B2400",
          offers: [{ supplier_name: "OEM channel", landedCostJmd: 12400, lead_time_days: 2 }],
        }],
      },
      {
        tier: 3,
        label: "Direct cross-reference",
        items: [{
          tier: 3,
          part: {
            id: "part-stitch-xref-1",
            name: "Rear brake shoe kit (drum)",
            brand: "Blue Print",
            oem_part_number: "ADT34155",
            maintenance_component_id: STITCH_VISUAL_COMPONENT_ID,
          },
          matchPct: 92,
          specs: [{ key: "Weight", value: "1.140 kg" }],
        }],
      },
    ],
    car: { label: STITCH_VISUAL_LABEL, plate: STITCH_VISUAL_PLATE },
    chassis: "M900A",
    trimBadge: "Pre-Facelift",
    linked: true,
  };
}
