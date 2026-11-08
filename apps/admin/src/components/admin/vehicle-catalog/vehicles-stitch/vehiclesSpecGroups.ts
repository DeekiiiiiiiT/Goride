export type SpecGroupId = "fluids" | "wipers_lights" | "tyres" | "battery" | "brakes";

export type SpecGroupDef = {
  id: SpecGroupId;
  title: string;
  icon: string;
  keys: string[];
};

/** All catalog spec rows for Vehicles V5 (+ front/rear brakes from vehicle_catalog columns). */
export const VEHICLE_SPEC_GROUP_DEFS: SpecGroupDef[] = [
  {
    id: "fluids",
    title: "Fluids & lubricants",
    icon: "opacity",
    keys: [
      "engine_oil_grade",
      "engine_oil_capacity_with_filter_l",
      "transmission_fluid",
      "coolant_type",
      "brake_fluid",
    ],
  },
  {
    id: "wipers_lights",
    title: "Wipers & lights",
    icon: "lightbulb",
    keys: [
      "wiper_driver_mm",
      "wiper_passenger_mm",
      "wiper_rear_mm",
      "wiper_connector",
      "headlight_low_bulb",
      "headlight_high_bulb",
      "tail_bulb",
      "indicator_bulb",
      "fog_bulb",
    ],
  },
  {
    id: "tyres",
    title: "Tyres & wheels",
    icon: "tire_repair",
    keys: ["tire_size"],
  },
  {
    id: "battery",
    title: "Battery",
    icon: "battery_charging_full",
    keys: ["battery_jis"],
  },
  {
    id: "brakes",
    title: "Brakes",
    icon: "disc_full",
    keys: ["front_brakes", "rear_brakes"],
  },
];

export function specSourcePill(reach: string | null | undefined): string {
  const r = (reach ?? "").toLowerCase();
  if (!r || r === "variant") return "This car";
  if (r.includes("engine")) return "All 1KR-FE engines";
  if (r.includes("platform")) return "All on this platform";
  return "This car";
}

export function allSpecKeysOrdered(): string[] {
  return VEHICLE_SPEC_GROUP_DEFS.flatMap((g) => g.keys);
}
