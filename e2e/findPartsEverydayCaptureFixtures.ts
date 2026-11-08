/**
 * Roomy 5179KZ everyday Find parts capture — values from find-parts-everyday-fleet-prompt.txt only.
 */
import type { FleetCar } from "../apps/fleet/src/components/vehicles/find-parts/fleetCar";

export const EVERYDAY_VEHICLE_ID = "veh-roomy-5179";
export const EVERYDAY_VARIANT_ID = "3cd9cbf3-0000-4000-8000-000000000001";
export const EVERYDAY_PLATE = "5179KZ";
export const EVERYDAY_LABEL = "2019 Toyota Roomy";

export const EVERYDAY_CAPTURE_FOLDERS = [
  "find_parts_which_car_is_it_for",
  "pick_another_car_maker_model_year",
  "which_roomy_2019_is_yours_2wd_or_4wd",
  "car_home_what_do_you_need_toyota_roomy",
  "brakes_for_your_roomy_front_rear_whole_car",
  "front_brake_pads_the_answer_04465_b1190",
  "parts_with_left_right_numbered_sets_roam_fleet",
  "every_car_the_front_pads_fit_cross_maker_matrix_roam_fleet",
  "trust_badge_popovers_verified_check_before_buying",
  "a_part_we_don_t_have_yet_ask_roam_to_find_it",
  "search_results_pads_no_results_state_toyota_roomy",
  "your_requests_tracking_status_roam_fleet",
  "states_loading_couldn_t_load_car_we_don_t_know_yet_offline",
  "phone_390px_car_home_part_answer_every_car_sheet",
] as const;

export type EverydayCaptureFolder = (typeof EVERYDAY_CAPTURE_FOLDERS)[number];

export function everydayFleetCars(): FleetCar[] {
  return [
    {
      vehicleId: EVERYDAY_VEHICLE_ID,
      licensePlate: EVERYDAY_PLATE,
      year: 2019,
      make: "Toyota",
      model: "Roomy",
    },
    {
      vehicleId: "veh-placeholder-tank",
      licensePlate: "PLATE",
      year: 2018,
      make: "Toyota",
      model: "Tank",
    },
    {
      vehicleId: "veh-placeholder-swift",
      licensePlate: "PLATE",
      year: 2019,
      make: "Suzuki",
      model: "Swift",
    },
  ];
}

const PADS_PART_ID = "part-pad-roomy-04465-b1190";

function alsoFitsRows(): Array<Record<string, unknown>> {
  const rows = [
    { make: "Toyota", model: "Roomy", years: "2016–2020", difference: "2WD · 1.0 petrol", trust: "Confirmed", isYourCar: true },
    { make: "Toyota", model: "Roomy", years: "2020 on", difference: "2WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Toyota", model: "Roomy", years: "2016–2020", difference: "4WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Toyota", model: "Roomy", years: "2020 on", difference: "4WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Toyota", model: "Tank", years: "2016–2020", difference: "4WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Toyota", model: "Glanza", years: "2019–2022", difference: "2WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Toyota", model: "Glanza", years: "2022 on", difference: "2WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Daihatsu", model: "Thor", years: "2016–2022", difference: "2WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Daihatsu", model: "Thor", years: "2016–2022", difference: "4WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Daihatsu", model: "Materia", years: "2007–2010", difference: "1.3 petrol", trust: "Needs checking" },
    { make: "Daihatsu", model: "Sirion", years: "2006 on", difference: "1.3 petrol", trust: "Needs checking" },
    { make: "Subaru", model: "Justy", years: "2016–2022", difference: "2WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Subaru", model: "Justy", years: "2016–2022", difference: "4WD · 1.0 petrol", trust: "Confirmed" },
    { make: "Suzuki", model: "Swift", years: "2010–2016", trust: "Confirmed" },
    { make: "Suzuki", model: "Swift", years: "2012–2017", trust: "Confirmed" },
    { make: "Suzuki", model: "Swift", years: "2017–2020", trust: "Confirmed" },
    { make: "Suzuki", model: "Swift", years: "2017–2023", trust: "Confirmed" },
    { make: "Suzuki", model: "Swift", years: "2023 on", trust: "Confirmed" },
    { make: "Suzuki", model: "Baleno", years: "2015–2022", trust: "Confirmed" },
    { make: "Suzuki", model: "Baleno", years: "2016–2019", trust: "Confirmed" },
    { make: "Suzuki", model: "Baleno", years: "2022 on", trust: "Confirmed" },
    { make: "Suzuki", model: "Baleno", years: "2026 on", trust: "Confirmed" },
    { make: "Suzuki", model: "Ertiga", years: "2012–2018", trust: "Confirmed" },
    { make: "Suzuki", model: "Ertiga", years: "2018–2022", trust: "Confirmed" },
    { make: "Suzuki", model: "Swift", years: "2010–2013", trust: "Needs checking" },
    { make: "Suzuki", model: "Swift", years: "2013–2016", trust: "Needs checking" },
    { make: "Suzuki", model: "Swift", years: "2017–2023", difference: "1.2 petrol", trust: "Needs checking" },
    { make: "Suzuki", model: "Ertiga", years: "2022 on", trust: "Needs checking" },
    { make: "Mazda", model: "Demio", years: "2007–2014", difference: "1.3 petrol", trust: "Confirmed" },
    { make: "Mazda", model: "Demio", years: "2007–2011", difference: "1.3 petrol", trust: "Needs checking" },
    { make: "Mazda", model: "Demio", years: "2011–2014", difference: "1.3 petrol", trust: "Needs checking" },
    { make: "Perodua", model: "Myvi", years: "2011–2017", difference: "1.3 petrol", trust: "Confirmed" },
    { make: "Perodua", model: "Myvi", years: "2005–2011", difference: "1.0 petrol", trust: "Needs checking" },
    { make: "Ford", model: "Fiesta", years: "2010–2013", difference: "1.4 petrol", trust: "Needs checking" },
  ];
  return rows.map((row, i) => ({
    variantId: `fit-${i}`,
    chassis: "",
    engine: "",
    trustReason: row.trust === "Needs checking" ? "Listed in a parts catalogue" : null,
    evidenceUrl: null,
    linkType: "Direct",
    ...row,
    isYourCar: Boolean((row as { isYourCar?: boolean }).isYourCar),
  }));
}

export function everydayMyVehicles() {
  return {
    items: [
      {
        id: EVERYDAY_VEHICLE_ID,
        vehicle_id: EVERYDAY_VEHICLE_ID,
        plate: EVERYDAY_PLATE,
        label: EVERYDAY_LABEL,
        make: "Toyota",
        model: "Roomy",
        year: 2019,
        parts_on_shelf: 24,
        subtitle: "2WD",
        hub: "Fleet hub",
      },
      {
        id: "veh-placeholder-tank",
        vehicle_id: "veh-placeholder-tank",
        plate: "PLATE",
        label: "2018 Toyota Tank",
        make: "Toyota",
        model: "Tank",
        year: 2018,
      },
      {
        id: "veh-placeholder-swift",
        vehicle_id: "veh-placeholder-swift",
        plate: "PLATE",
        label: "2019 Suzuki Swift",
        make: "Suzuki",
        model: "Swift",
        year: 2019,
      },
    ],
  };
}

export function everydayVehicleContext() {
  return {
    label: EVERYDAY_LABEL,
    plate: EVERYDAY_PLATE,
    variantId: EVERYDAY_VARIANT_ID,
    year: 2019,
    version: "2WD",
    drivetrain: "2WD",
    specs: {
      brake_fluid: "Toyota 2500H-A",
      engine_oil_grade: "0W-20",
      engine_oil_capacity_with_filter_l: "3.1",
      brake_front_type: "Ventilated disc",
      brake_rear_type: "Drum",
    },
    carNeeds: [
      { key: "engine_oil_grade", label: "Engine oil", value: "0W-20", copy: "0W-20" },
      { key: "engine_oil_capacity", label: "Engine oil amount", value: "3.1 L with filter", copy: "3.1 L with filter" },
      { key: "brake_fluid", label: "Brake fluid", value: "Toyota 2500H-A", copy: "Toyota 2500H-A" },
    ],
  };
}

export function everydayVehicleOptions() {
  return {
    makes: ["Toyota", "Honda", "Nissan", "Suzuki", "Mazda", "Mitsubishi", "Daihatsu", "Subaru"],
    models: ["Roomy", "Tank", "Glanza", "Corolla", "Probox", "Hiace", "Vitz", "Axio"],
    years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
    versions: [
      { id: EVERYDAY_VARIANT_ID, plainLabel: "2WD · 1.0 petrol", codeLine: "" },
      { id: "variant-roomy-4wd", plainLabel: "4WD · 1.0 petrol", codeLine: "" },
    ],
    modelsByMake: {
      Toyota: [
        { model: "Roomy", yearRange: "2016 – today" },
        { model: "Tank", modelYears: "2016 – 2020" },
        { model: "Glanza", yearRange: "2019 – today" },
      ],
    },
  };
}

const BRAKE_TYPE_IDS = {
  pads: "cmp-brake-pads",
  disc: "cmp-brake-disc",
  caliper: "cmp-brake-caliper",
  hose: "cmp-brake-hose-front",
  abs: "cmp-abs-sensor",
  shoes: "cmp-brake-shoes",
  drum: "cmp-brake-drum",
  cylinder: "cmp-wheel-cylinder",
  rearHose: "cmp-brake-hose-rear",
  cable: "cmp-handbrake-cable",
  master: "cmp-master-cylinder",
  fluid: "cmp-brake-fluid",
} as const;

export function everydayBrowse() {
  const areas = [
    { id: "area-brakes", plainName: "Brakes", name: "Brakes", count: 12, icon: "brakes" },
    { id: "area-engine", plainName: "Engine & oil", name: "Engine & oil", count: 2, icon: "gears" },
    { id: "area-filters", plainName: "Filters", name: "Filters", count: 0, icon: "oil" },
    { id: "area-fluids", plainName: "Fluids", name: "Fluids", count: 1, icon: "droplet" },
    { id: "area-suspension", plainName: "Suspension & steering", name: "Suspension & steering", count: 0, icon: "suspension" },
    { id: "area-lights", plainName: "Lights & wipers", name: "Lights & wipers", count: 1, icon: "highlight" },
    { id: "area-battery", plainName: "Battery & electrical", name: "Battery & electrical", count: 0, icon: "bolt" },
    { id: "area-cooling", plainName: "Cooling", name: "Cooling", count: 0, icon: "wind" },
  ];
  return {
    systems: areas.map((a) => ({
      ...a,
      components: a.id === "area-brakes" ? [
        { id: BRAKE_TYPE_IDS.pads, plainName: "Brake pads", name: "Brake pads", count: 1, positionAware: true },
        { id: BRAKE_TYPE_IDS.shoes, plainName: "Brake shoes", name: "Brake shoes", count: 1, positionAware: false },
      ] : [],
    })),
    common: [
      { id: BRAKE_TYPE_IDS.pads, plainName: "Brake pads", name: "Brake pads", count: 1, positionAware: true },
      { id: "cmp-oil-filter", plainName: "Oil filter", name: "Oil filter", count: 1, positionAware: false },
    ],
    areas,
  };
}

export function everydayBrakesOverview() {
  const mk = (id: string, name: string, section: "front" | "rear" | "whole", onFile: boolean, desc: string) => ({
    id,
    name,
    opCode: id,
    description: desc,
    section,
    brakeRole: section === "whole" ? "system" : section === "front" ? "disc" : "drum",
    onFile,
    onFileCount: onFile ? 1 : 0,
  });
  const types = [
    mk(BRAKE_TYPE_IDS.pads, "Brake pads", "front", true, "Squeeze the disc to slow the front wheels"),
    mk(BRAKE_TYPE_IDS.disc, "Brake disc", "front", true, "The disc the pads squeeze"),
    mk(BRAKE_TYPE_IDS.caliper, "Brake calipers", "front", true, "One for each front wheel"),
    mk(BRAKE_TYPE_IDS.hose, "Brake hoses", "front", true, "Carry fluid to the brakes"),
    mk(BRAKE_TYPE_IDS.abs, "Wheel-speed sensors (ABS)", "front", true, "Tell the ABS how fast each wheel spins"),
    mk(BRAKE_TYPE_IDS.shoes, "Brake shoes", "rear", true, "Press out inside the drum to slow the rear wheels"),
    mk(BRAKE_TYPE_IDS.drum, "Brake drum", "rear", true, "The drum the shoes press inside"),
    mk(BRAKE_TYPE_IDS.cylinder, "Wheel cylinders", "rear", true, "One for each rear wheel"),
    mk(BRAKE_TYPE_IDS.rearHose, "Brake hose", "rear", true, "Carries fluid to the rear brakes"),
    mk(BRAKE_TYPE_IDS.cable, "Handbrake cables", "rear", true, "Three cables on your Roomy"),
    mk(BRAKE_TYPE_IDS.fluid, "Brake fluid", "whole", true, "Hydraulic fluid for the whole brake system"),
    mk(BRAKE_TYPE_IDS.master, "Master cylinder", "whole", true, "Pushes fluid when you press the pedal"),
  ];
  const front = types.filter((t) => t.section === "front");
  const rear = types.filter((t) => t.section === "rear");
  const whole = types.filter((t) => t.section === "whole");
  const verifiedOf = (list: typeof types) => list.filter((t) => t.onFile).length;
  return {
    variantId: EVERYDAY_VARIANT_ID,
    vehicleYear: 2019,
    hasBrakeSpecs: true,
    frontSetup: "Disc setup",
    rearSetup: "Drum setup",
    groups: {
      front: { setup: "Disc setup", componentCount: front.length, verifiedCount: verifiedOf(front), types: front },
      rear: { setup: "Drum setup", componentCount: rear.length, verifiedCount: verifiedOf(rear), types: rear },
      whole: { setup: "Whole vehicle", componentCount: whole.length, verifiedCount: verifiedOf(whole), types: whole },
    },
    types,
  };
}

function padFindSections() {
  return {
    sections: [{
      tier: 1,
      label: "Verified",
      items: [{
        groupId: "grp-pad",
        part: {
          id: PADS_PART_ID,
          name: "Front brake pads",
          manufacturer: "Toyota",
          oem_part_number: "04465-B1190",
          catalog_decision: "confirmed",
        },
        brandNumbers: [
          { partId: "bn1", brand: "Daihatsu", number: "04465-B1320", trust: "Confirmed" },
          { partId: "bn2", brand: "NiBK", number: "PN5562", trust: "Confirmed" },
          { partId: "bn3", brand: "SB", number: "BP25562", trust: "Confirmed" },
          { partId: "bn4", brand: "Brembo", number: "P 16 013", trust: "Confirmed" },
          { partId: "bn5", brand: "Akebono", number: "AN-754WK", trust: "Confirmed" },
        ],
        position: "front",
      }],
    }],
  };
}

export function everydayFind(componentId?: string) {
  const base = {
    linked: true,
    askVariant: false,
    pickedVariantId: EVERYDAY_VARIANT_ID,
    car: { make: "Toyota", model: "Roomy", year: 2019, label: EVERYDAY_LABEL },
    candidates: [
      { id: EVERYDAY_VARIANT_ID, plainLabel: "2WD", codeLine: "" },
      { id: "variant-roomy-4wd", plainLabel: "4WD", codeLine: "" },
    ],
  };
  if (componentId === BRAKE_TYPE_IDS.pads) return { ...base, ...padFindSections() };
  if (componentId === BRAKE_TYPE_IDS.caliper) {
    return {
      ...base,
      sections: [{
        items: [
          { groupId: "c-r", part: { id: "p-cal-r", name: "Right front caliper", oem_part_number: "47730-B1021", catalog_decision: "confirmed" }, position: "front", side: "right" },
          { groupId: "c-l", part: { id: "p-cal-l", name: "Left front caliper", oem_part_number: "47750-B1021", catalog_decision: "confirmed" }, position: "front", side: "left" },
        ],
      }],
    };
  }
  if (componentId === BRAKE_TYPE_IDS.cable) {
    return {
      ...base,
      sections: [{
        items: [
          { groupId: "c1", catalogue_number: 1, part: { id: "p-c1", name: "Front cable (cable 1)", oem_part_number: "46410-B1011", catalog_decision: "confirmed" } },
          { groupId: "c2", catalogue_number: 2, part: { id: "p-c2", name: "Rear cable 2", oem_part_number: "46420-B1090", catalog_decision: "confirmed" } },
          { groupId: "c3", catalogue_number: 3, part: { id: "p-c3", name: "Rear cable 3", oem_part_number: "46430-B1090", catalog_decision: "confirmed" } },
        ],
      }],
    };
  }
  if (componentId === BRAKE_TYPE_IDS.shoes) {
    return {
      ...base,
      sections: [{
        items: [
          { groupId: "sh1", part: { id: "p-sh-v", name: "Rear brake shoes", oem_part_number: "04495-B2430", catalog_decision: "confirmed" } },
          { groupId: "sh2", part: { id: "p-sh-o", name: "Rear brake shoes (older number)", oem_part_number: "04495-B2400", catalog_decision: "pending" } },
        ],
      }],
    };
  }
  return { ...base, sections: [] };
}

export function everydayPartsLookup(partId?: string) {
  if (partId === PADS_PART_ID || !partId) {
    const fits = alsoFitsRows();
    return {
      reference: {
        partId: PADS_PART_ID,
        brand: "Toyota",
        number: "04465-B1190",
        name: "Front brake pads",
        trust: "Confirmed",
        position: "front",
      },
      brandNumbers: [
        { partId: "bn1", brand: "Daihatsu", number: "04465-B1320", trust: "Confirmed" },
        { partId: "bn2", brand: "NiBK", number: "PN5562", trust: "Confirmed" },
        { partId: "bn3", brand: "SB", number: "BP25562", trust: "Confirmed" },
        { partId: "bn4", brand: "Brembo", number: "P 16 013", trust: "Confirmed" },
        { partId: "bn5", brand: "Akebono", number: "AN-754WK", trust: "Confirmed" },
      ],
      alsoFits: fits,
      alsoFitsCount: fits.length,
      sources: [
        { label: "Toyota parts catalogue", url: "https://partsouq.com/" },
        { label: "SB brake catalogue", url: "https://www.sbparts.jp/" },
      ],
    };
  }
  return everydayPartsLookup(PADS_PART_ID);
}

export function everydayActivity() {
  return {
    requests: {
      total: 3,
      items: [
        {
          id: "req-looking",
          need_text: "Rear shock absorbers",
          status: "looking",
          created_at: "2026-11-01T10:00:00Z",
          vehicle_label: EVERYDAY_LABEL,
          plate: EVERYDAY_PLATE,
        },
        {
          id: "req-added",
          need_text: "Front brake pads",
          status: "added",
          created_at: "2026-10-28T10:00:00Z",
          vehicle_label: EVERYDAY_LABEL,
          plate: EVERYDAY_PLATE,
          part_id: PADS_PART_ID,
          maintenance_component_id: BRAKE_TYPE_IDS.pads,
        },
        {
          id: "req-cant",
          need_text: "Turbo hose",
          status: "cant_find",
          cant_find_reason: "No matching hose in catalogues for this year.",
          created_at: "2026-10-20T10:00:00Z",
          vehicle_label: EVERYDAY_LABEL,
          plate: EVERYDAY_PLATE,
        },
      ],
    },
    quotes: { total: 0, items: [] },
    repeatAlerts: { total: 0, items: [] },
    warrantyClaims: { total: 0, items: [] },
    cores: { total: 0, items: [] },
  };
}

export function everydayTerm(q: string) {
  const lower = q.toLowerCase();
  if (lower.includes("pad")) {
    return {
      hits: [{ componentId: BRAKE_TYPE_IDS.pads, plainName: "Front brake pads", trust: "Confirmed", number: "04465-B1190", hint: "" }],
    };
  }
  if (lower.includes("shoe")) {
    return {
      hits: [{ componentId: BRAKE_TYPE_IDS.shoes, plainName: "Rear brake shoes", trust: "Confirmed", number: "04495-B2430", hint: "Your Roomy uses brake shoes at the back, not pads." }],
    };
  }
  return { hits: [] };
}

export function fleetCoreEverydayFixtures() {
  return {
    myVehicles: everydayMyVehicles(),
    vehicleOptions: everydayVehicleOptions(),
    vehicleContext: everydayVehicleContext(),
    browse: everydayBrowse(),
    activity: everydayActivity(),
    term: { hits: [] },
    symptoms: { problems: [] },
    savedSearches: { items: [] },
    brakesOverview: everydayBrakesOverview(),
    find: everydayFind(),
    fitHints: {
      hasSideSpecificListings: true,
      countsByPosition: { front: 1, rear: 1 },
      labelsByPosition: { front: "Front", rear: "Rear" },
    },
    lookup: everydayPartsLookup(),
    makers: [
      "Toyota",
      "Daihatsu",
      "Subaru",
      "Suzuki",
      "Mazda",
      "Perodua",
      "Ford",
      "Honda",
      "Nissan",
      "Mitsubishi",
    ].map((make) => ({ make, logoUrl: null as string | null })),
  };
}
