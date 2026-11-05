import type { Page, Route } from "@playwright/test";
import { findPartsStitchPlainSections } from "./findPartsStitchFixture";
import type {
  AutoMatchConflictsResponse,
  PartMatchHealth,
  PartMatchSchedule,
} from "../apps/admin/src/services/partsAutoMatchApi";

export const AM_VEHICLE_ID = "a1111111-1111-4111-8111-111111111111";
export const AM_VARIANT_ID = "b2222222-2222-4222-8222-222222222222";
export const AM_COMPONENT_ID = "c3333333-3333-4333-8333-333333333333";
export const AM_PART_ID = "d4444444-4444-4444-8444-444444444444";
export const AM_CONFLICT_ID = "e5555555-5555-4555-8555-555555555555";
export const AM_CONFLICT_ID_2 = "e5555555-5555-4555-8555-555555555556";
export const AM_GROUP_ID_B = "22222222-2222-4222-8222-222222222222";
export const AM_PLATFORM_ID = "f6666666-6666-4666-8666-666666666666";
export const AM_PLATFORM_MZ_ID = "77777777-7777-4777-8777-777777777777";
export const AM_PLATFORM_FD_ID = "88888888-8888-4888-8888-888888888888";
export const AM_PLATFORM_TOY_XP130_ID = "99999999-9999-4999-8999-999999999999";
export const AM_PLATFORM_SUB_S300_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const AM_DERIVED_ID = "11111111-1111-4111-8111-111111111115";
export const AM_OE_ROW_ID = "11111111-1111-4111-8111-111111111113";
export const AM_GROUP_ID = "g1111111-1111-4111-8111-111111111111";

/** Stitch sample values that must not appear when mocks supply real-shaped data. */
export const AM_DOMINION_FORBIDDEN = [
  "1,428",
  "RECON V4.8.2",
  "Catalog integrity, reconciliation pipeline",
];

/** Stitch placeholder row copy only — hub footer text is intentional on AM-S4F (see find-parts-why-it-fits.html). */
export const AM_FLEET_FORBIDDEN = ['Result Row with "Why it fits" Match Intelligence'];

export type AutoMatchMockProfile = "default" | "empty" | "error" | "flagOff" | "allChecking" | "loading";

export type AutoMatchMockOptions = {
  profile?: AutoMatchMockProfile;
};

let activeProfile: AutoMatchMockProfile = "default";

async function mockNetworkDelay() {
  if (activeProfile === "loading") {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
}

export function partMatchHealthFixture(vehicleId?: string | null): PartMatchHealth {
  const flagOff = activeProfile === "flagOff";
  const engineVersion = 8;
  const normVersion = 1;
  const errorCount24h = activeProfile === "error" ? 1 : 0;
  const lastError24h = errorCount24h
    ? {
        run_id: "11111111-1111-4111-8111-111111111113",
        kind: "worker-node-03",
        started_at: new Date(Date.now() - 7200_000).toISOString(),
        finished_at: new Date(Date.now() - 7100_000).toISOString(),
        error: "timed out on legacy platform index table during parallel hash pass",
      }
    : null;
  return {
    engineVersion,
    normVersion,
    normMode: "strict",
    engineHash: `#F${engineVersion}${normVersion}-99A`,
    enabled: !flagOff,
    derived: activeProfile === "empty"
      ? { live: 0, needsChecking: 0, suppressed: 0 }
      : { live: 12, needsChecking: activeProfile === "allChecking" ? 12 : 1, suppressed: 0 },
    tierBreakdown: activeProfile === "empty" ? {} : { "1": 8, "2": 3, "3": 1 },
    openConflicts: activeProfile === "empty"
      ? {}
      : { oe_ambiguous: 2, position_side_mismatch: 1, index_wear_sensor: 1 },
    lastRun: activeProfile === "empty"
      ? null
      : {
          run_id: "11111111-1111-4111-8111-111111111112",
          kind: "nightly",
          started_at: "2026-11-02T03:00:00.000Z",
          finished_at: new Date(Date.now() - 3600_000).toISOString(),
          error: activeProfile === "error" ? "nightly worker timed out" : null,
          duration_ms: 72000,
          rows_scanned: 428,
        },
    errorCount24h,
    lastError24h,
    unresolvedPositionReports: activeProfile === "empty" ? 0 : 3,
  };
}

export function partMatchScheduleFixture(): PartMatchSchedule {
  return {
    nextRun: new Date(Date.now() + 6 * 3600_000).toISOString(),
    cron: "0 3 * * *",
    jobname: "part-match-nightly",
    intervalLabel: "Daily at 03:00 UTC",
  };
}

export function autoMatchConflictsFixture(): AutoMatchConflictsResponse {
  if (activeProfile === "empty") {
    return {
      rows: [],
      filteredCount: 0,
      totalsByType: {},
      totalsByStatus: { open: 0, kept: 0, removed: 0, superseded: 0 },
      totalCount: 0,
    };
  }
  const foundAt = "2026-11-01T12:00:00.000Z";
  const foundAt2 = "2026-10-31T12:00:00.000Z";
  const geometryImage =
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAQuQgRNUb4QZBAPG0LGe6RHF4tzfchPX6LjkhmeWvmpFDPDBDbi1T1m_HArJOF6HDjVC0bBlA1YB1dCvu0c6nLPFl7ndjDd2iJACvhSgcng5_kVHjRiVscof5wCKCuQj4J6wbfISR2z1s5OJ14TGlLsilzFthUSM53Zl9YASg8S80Vge2G9j7qj5mWBLZ3KnokLrrLzGbYPuHpPZJOhyza6djeSNS1ijOq1NFf1No";
  const sharedGroups = [
    { group_id: AM_GROUP_ID, group_code: "BRK-0012", subtitle: "Akebono AN-761WK & Toyota 04465-B1190" },
    { group_id: AM_GROUP_ID_B, group_code: "BRK-0031", subtitle: "MK Kashiyama D0051M-01-J" },
  ];
  const oeExtras = {
    vehicle_spec_line: "Chassis: DBA-M900A · 1KR-FE 1.0L Petrol",
    involved_groups: sharedGroups,
    number_label: "Factory OE: 04465-B1190",
    number_source_url: "https://toyota-epc.jp/",
    number_source_host: "toyota-epc.jp",
    geometry_verification: {
      title: "Akebono AN-761WK Spec",
      image_url: geometryImage,
      spec_line: "Width: 108.5mm · Height: 44.0mm · Thickness: 15.0mm. Confirm thickness tolerance before Keep commit.",
    },
  };
  return {
    rows: [
      {
        id: AM_CONFLICT_ID,
        code: "CNF-8820",
        conflict_type: "oe_ambiguous",
        status: "open",
        vehicle_catalog_id: AM_VEHICLE_ID,
        vehicle_label: "Toyota Roomy M900A",
        part_name: "Front brake pad set",
        group_code: "BRK-0012",
        interchange_group_id: AM_GROUP_ID,
        part_id: AM_PART_ID,
        matched_key: "04465-B1190",
        detail: {
          vehicle_oe_number_id: AM_OE_ROW_ID,
          oe_number_norm: "04465B1190",
          group_ids: [AM_GROUP_ID, AM_GROUP_ID_B],
          position: "front",
          side: "both",
        },
        computed_at: foundAt,
        found_at: foundAt,
        ...oeExtras,
      },
      {
        id: AM_CONFLICT_ID_2,
        code: "CNF-8821",
        conflict_type: "oe_ambiguous",
        status: "open",
        vehicle_catalog_id: AM_VEHICLE_ID,
        vehicle_label: "Toyota Tank M900A",
        group_code: "BRK-0012",
        interchange_group_id: AM_GROUP_ID,
        matched_key: "04465-B1190",
        manual_listing_group_code: "BRK-0031",
        detail: {
          vehicle_oe_number_id: AM_OE_ROW_ID,
          oe_number_norm: "04465B1190",
          group_ids: [AM_GROUP_ID, AM_GROUP_ID_B],
          position: "front",
          side: "both",
        },
        computed_at: foundAt,
        found_at: foundAt,
      },
      {
        id: "11111111-1111-4111-8111-111111111120",
        code: "CNF-8830",
        conflict_type: "position_side_mismatch",
        status: "kept",
        vehicle_catalog_id: AM_VEHICLE_ID,
        vehicle_label: "Subaru Justy M900F",
        part_name: "Bosch 0 986 494 999",
        group_code: "BRK-0044",
        interchange_group_id: AM_GROUP_ID_B,
        matched_key: "04465-B1190",
        resolution_note: "Confirmed via Akebono 2024 catalogue",
        resolved_by_display: "Deeki T (Owner)",
        resolved_at: "2026-10-31T12:00:00.000Z",
        detail: {
          expected: { position: "front", side: "both" },
          actual: { position: "rear", side: "both" },
        },
        computed_at: foundAt2,
        found_at: foundAt2,
      },
      {
        id: "11111111-1111-4111-8111-111111111121",
        code: "CNF-8840",
        conflict_type: "index_wear_sensor",
        status: "removed",
        vehicle_catalog_id: null,
        vehicle_label: "—",
        part_name: "MK Kashiyama D0051M-01-J",
        group_code: "BRK-0031",
        matched_key: "WVA:24551",
        detail: {
          index_type: "wva",
          value: "24551",
          sensor_a: true,
          sensor_b: false,
        },
        computed_at: "2026-10-29T12:00:00.000Z",
        found_at: "2026-10-29T12:00:00.000Z",
      },
    ],
    filteredCount: 4,
    totalsByType: {
      oe_ambiguous: 2,
      position_side_mismatch: 1,
      index_wear_sensor: 1,
      part_type_mismatch: 0,
      index_merge_proposed: 0,
      system_link: 0,
    },
    totalsByStatus: {
      open: 2,
      kept: 1,
      removed: 1,
      superseded: 0,
    },
    totalCount: 4,
  };
}

export function vehicleCatalogListFixture() {
  return {
    items: [
      {
        id: AM_VEHICLE_ID,
        make: "Toyota",
        model: "Roomy",
        chassis_code: "M900A",
        catalog_trim: "Pre-Facelift",
        trim_series: "Custom G",
        full_model_code: "M900A-BGBGE",
        engine_code: "1KR-FE",
        engine_displacement_cc: 996,
        production_start_year: 2016,
        production_end_year: 2020,
        platform_id: AM_PLATFORM_ID,
        body_type: "Mini MPV",
        fuel_type: "petrol",
        market: "JDM Spec",
      },
    ],
    total: 1,
  };
}

export function partOeReferencesFixture() {
  if (activeProfile === "empty") {
    return { rows: [] };
  }
  return {
    rows: [
      {
        id: "11111111-1111-4111-8111-111111111117",
        part_id: AM_PART_ID,
        reference_type: "replaces",
        oe_brand: "Toyota",
        oe_number: "04465-B1191",
        oe_number_norm: "04465B1191",
        evidence_url: "https://toyota-epc.jp/part/04465-B1191",
        supersession_note: "04465-B1190 → 04465-B1191 · fully interchangeable",
        created_at: "2026-10-01T12:00:00.000Z",
        created_by: null,
      },
      {
        id: "11111111-1111-4111-8111-111111111118",
        part_id: AM_PART_ID,
        reference_type: "cross_ref",
        oe_brand: "Mazda",
        oe_number: "DFY1-33-28ZA",
        oe_number_norm: "DFY13328ZA",
        evidence_url: "https://mazda-parts.org/dfy1-33-28za",
        created_at: "2026-10-02T12:00:00.000Z",
        created_by: null,
      },
      {
        id: "11111111-1111-4111-8111-111111111119",
        part_id: AM_PART_ID,
        reference_type: "cross_ref",
        oe_brand: "Ford",
        oe_number: "1 438 867",
        oe_number_norm: "1438867",
        evidence_url: "https://ford-parts.eu/1438867",
        created_at: "2026-10-03T12:00:00.000Z",
        created_by: null,
      },
    ],
  };
}

export function partIndexNumbersFixture() {
  if (activeProfile === "empty") {
    return { rows: [] };
  }
  return {
    rows: [
      {
        id: "11111111-1111-4111-8111-111111111120",
        part_id: AM_PART_ID,
        index_type: "wva",
        value: "24551",
        value_norm: "24551",
        wear_sensor: "none",
        evidence_url: "https://ec.europa.eu/ece90/wva/24551",
        created_at: "2026-10-01T08:00:00.000Z",
        created_by: null,
      },
      {
        id: "11111111-1111-4111-8111-111111111121",
        part_id: AM_PART_ID,
        index_type: "fmsi",
        value: "D1454",
        value_norm: "D1454",
        wear_sensor: "none",
        evidence_url: "https://fmsi.org/d1454",
        created_at: "2026-10-01T09:00:00.000Z",
        created_by: null,
      },
    ],
  };
}

const AM_COMPONENT_BRAKE_SHOES = "a9000006-0000-4000-8000-000000000021";
const AM_COMPONENT_BRAKE_ROTOR = "a9000006-0000-4000-8000-000000000022";
const AM_COMPONENT_OIL_FILTER = "a9000006-0000-4000-8000-000000000023";
const AM_COMPONENT_CABIN_FILTER = "a9000006-0000-4000-8000-000000000024";
const AM_COMPONENT_STRUTS = "a9000006-0000-4000-8000-000000000025";

export function vehicleOeNumbersFixture() {
  if (activeProfile === "empty") {
    return { rows: [], lastRun: null, platformCode: null };
  }
  const rows = [
    {
      id: AM_OE_ROW_ID,
      maintenance_component_id: AM_COMPONENT_ID,
      oe_brand: "Toyota",
      oe_number: "04465-B1190",
      oe_number_norm: "04465B1190",
      position: "front",
      side: "both",
      year_from: 2016,
      year_to: 2020,
      part_type_name: "Brake pads",
      op_code: "0446-BRK",
      catalog_area_ids: ["brakes"],
      match_count: 3,
      matching: false,
      supersession_note: "Changed to 04465-B1191 · fully interchangeable",
      evidence_url: "https://toyota-epc.jp/part/04465-B1190",
    },
    {
      id: "11111111-1111-4111-8111-111111111121",
      maintenance_component_id: AM_COMPONENT_BRAKE_SHOES,
      oe_brand: "Toyota",
      oe_number: "04495-B1010",
      oe_number_norm: "04495B1010",
      position: "rear",
      side: "both",
      year_from: 2016,
      year_to: 2020,
      part_type_name: "Brake shoes / drums",
      op_code: "0449-SHU",
      catalog_area_ids: ["brakes"],
      match_count: 2,
      matching: false,
      evidence_url: "https://toyota-epc.jp/part/04495-B1010",
    },
    {
      id: "11111111-1111-4111-8111-111111111122",
      maintenance_component_id: AM_COMPONENT_BRAKE_ROTOR,
      oe_brand: "Toyota",
      oe_number: "43512-B1050",
      oe_number_norm: "43512B1050",
      position: "front",
      side: "both",
      year_from: 2016,
      year_to: 2020,
      part_type_name: "Brake rotor",
      op_code: "4351-DSK",
      catalog_area_ids: ["brakes"],
      match_count: 0,
      matching: true,
      evidence_url: "https://amayama.com/parts/43512-B1050",
    },
    {
      id: "11111111-1111-4111-8111-111111111123",
      maintenance_component_id: AM_COMPONENT_OIL_FILTER,
      oe_brand: "Toyota",
      oe_number: "04152-40060",
      oe_number_norm: "0415240060",
      position: null,
      side: null,
      year_from: null,
      year_to: null,
      part_type_name: "Oil filter",
      op_code: "0415-FLT",
      catalog_area_ids: ["filters"],
      match_count: 5,
      matching: false,
      evidence_url: "https://toyota-epc.jp/part/04152-40060",
    },
    {
      id: "11111111-1111-4111-8111-111111111124",
      maintenance_component_id: AM_COMPONENT_CABIN_FILTER,
      oe_brand: "Toyota",
      oe_number: "87139-52040",
      oe_number_norm: "8713952040",
      position: null,
      side: null,
      year_from: 2016,
      year_to: 2020,
      part_type_name: "Cabin air filter",
      op_code: "8713-HVAC",
      catalog_area_ids: ["filters"],
      match_count: 4,
      matching: false,
      evidence_url: "https://partsouq.com/toyota/87139-52040",
    },
  ];
  return {
    rows,
    areaChips: [
      { id: "all", label: "All", count: rows.length },
      { id: "brakes", label: "Brakes", count: 3 },
      { id: "engine", label: "Engine", count: 0 },
      { id: "filters", label: "Filters", count: 2 },
      { id: "suspension", label: "Suspension", count: 0 },
      { id: "fluids", label: "Fluids", count: 0 },
    ],
    lastRun: partMatchHealthFixture(AM_VEHICLE_ID).lastRun ?? null,
    platformCode: "DAI-M900",
  };
}

export function vehicleDerivedFitsFixture() {
  if (activeProfile === "empty") {
    return { rows: [] };
  }
  return {
    rows: [
      {
        id: AM_DERIVED_ID,
        vehicle_catalog_id: AM_VEHICLE_ID,
        interchange_group_id: AM_GROUP_ID,
        vehicle_oe_number_id: AM_OE_ROW_ID,
        status: activeProfile === "allChecking" ? "needs_checking" : "live",
        matched_keys: ["04465-B1190"],
        computed_at: "2026-11-02T11:00:00.000Z",
        part_name: "Front brake pad set",
        matched_key: "04465-B1190",
        match_status: activeProfile === "allChecking" ? "needs_checking" : "live",
        conflict_id: null,
      },
    ],
  };
}

export function vehicleOeRevisionsFixture() {
  if (activeProfile === "empty") {
    return { rows: [] };
  }
  return {
    rows: [
      {
        id: `${AM_OE_ROW_ID}:oe_number`,
        vehicle_oe_number_id: AM_OE_ROW_ID,
        created_at: "2026-11-01T09:00:00.000Z",
        field_name: "oe_number",
        old_value: "04465-B1190",
        new_value: "04465-B1191",
      },
    ],
  };
}

export function vehiclePlatformsFixture() {
  if (activeProfile === "empty") {
    return { platforms: [], items: [], source: "vehicle_platform" };
  }
  const platforms = [
    {
      id: AM_PLATFORM_ID,
      code: "DAI-M900",
      label: "Daihatsu M900 family",
      name: "Daihatsu M900 family",
      maker: "Daihatsu",
      carCount: 3,
      linkCount: 2,
      car_count: 3,
      link_count: 2,
      body_class: "subcompact_tall_wagon",
      market: "JDM",
      sisterModels: ["Toyota Roomy", "Daihatsu Thor", "Subaru Justy"],
      linkedPlatformHint: "1 linked platform",
    },
    {
      id: AM_PLATFORM_MZ_ID,
      code: "MZ-DE",
      label: "Mazda DE platform",
      maker: "Mazda",
      carCount: 2,
      linkCount: 1,
      car_count: 2,
      link_count: 1,
      sisterModels: ["Mazda 2", "Demio"],
      linkedPlatformHint: "1 linked (FD-GLOBAL-B)",
    },
    {
      id: AM_PLATFORM_FD_ID,
      code: "FD-GLOBAL-B",
      label: "Ford Global B car family",
      maker: "Ford",
      carCount: 3,
      linkCount: 1,
      car_count: 3,
      link_count: 1,
      sisterModels: ["Ford Fiesta", "B-Max", "EcoSport"],
      linkedPlatformHint: "1 linked (MZ-DE)",
    },
  ];
  return { platforms, items: platforms, source: "vehicle_platform" };
}

function platformSisterVehiclesFixture() {
  return [
    {
      id: AM_VEHICLE_ID,
      make: "Toyota",
      model: "Roomy",
      chassis_code: "M900A",
      catalog_trim: "Pre-Facelift Custom G",
      trim_series: "Custom G",
      engine_code: "1KR-FE",
      engine_displacement_cc: 996,
      drivetrain: "FF",
      production_start_year: 2016,
      production_end_year: 2020,
      platform_id: AM_PLATFORM_ID,
      platform_role: "primary",
      body_type: "Subcompact tall wagon",
      verified_fitment_count: 35,
      inheritance_pct: 100,
    },
    {
      id: "b2222222-2222-4222-8222-222222222223",
      make: "Daihatsu",
      model: "Thor",
      chassis_code: "M900S",
      catalog_trim: "Badge twin",
      engine_code: "1KR-FE",
      engine_displacement_cc: 996,
      production_start_year: 2016,
      production_end_year: 2020,
      platform_id: AM_PLATFORM_ID,
      platform_role: "sister",
      body_type: "Subcompact tall wagon",
      verified_fitment_count: 35,
      inheritance_pct: 100,
    },
    {
      id: "b2222222-2222-4222-8222-222222222224",
      make: "Subaru",
      model: "Justy",
      chassis_code: "M900F",
      catalog_trim: "OEM supply",
      engine_code: "1KR-FE",
      engine_displacement_cc: 996,
      production_start_year: 2016,
      production_end_year: 2020,
      platform_id: AM_PLATFORM_ID,
      platform_role: "donor",
      body_type: "Subcompact tall wagon",
      verified_fitment_count: 35,
      inheritance_pct: 100,
    },
  ];
}

export function adminPlatformDetailFixture() {
  const list = vehiclePlatformsFixture();
  const platform = list.platforms[0];
  if (!platform) {
    return { platform: null, links: [], vehicles: [], source: "vehicle_platform" };
  }
  return {
    platform: {
      ...platform,
      primary_key: "900-M900-JDM",
      label: "Daihatsu M900 family",
    },
    links: [
      {
        id: "11111111-1111-4111-8111-111111111130",
        platform_a_id: AM_PLATFORM_MZ_ID,
        platform_b_id: AM_PLATFORM_FD_ID,
        platform_a_code: "MZ-DE",
        platform_b_code: "FD-GLOBAL-B",
        other_label: "Mazda DE ⇄ Ford Global B",
        maintenance_component_id: AM_COMPONENT_ID,
        component_name: "Brake pads",
        scope: "component",
        position: "front",
        side: "both",
        platform_a_year_from: 2007,
        platform_a_year_to: 2014,
        platform_b_year_from: 2008,
        platform_b_year_to: 2017,
        evidence_url: "https://ford-epc.com/brake-pads/mz-de-fd-global-b",
        status: "verified",
      },
      {
        id: "11111111-1111-4111-8111-111111111131",
        platform_a_id: AM_PLATFORM_ID,
        platform_b_id: AM_PLATFORM_TOY_XP130_ID,
        platform_a_code: "DAI-M900",
        platform_b_code: "TOY-XP130",
        other_label: "Toyota XP130 Yaris",
        maintenance_component_id: AM_COMPONENT_CABIN_FILTER,
        component_name: "Cabin air filter",
        scope: "component",
        position: null,
        side: null,
        platform_a_year_from: 2016,
        platform_a_year_to: 2020,
        platform_b_year_from: 2011,
        platform_b_year_to: 2020,
        evidence_url: "https://denso-aftermarket.jp/catalog/cabin-filter-xp130",
        status: "verified",
      },
      {
        id: "11111111-1111-4111-8111-111111111132",
        platform_a_id: AM_PLATFORM_ID,
        platform_b_id: AM_PLATFORM_SUB_S300_ID,
        platform_a_code: "DAI-M900",
        platform_b_code: "SUB-S300",
        other_label: "Subaru Stella / Hijet",
        maintenance_component_id: AM_COMPONENT_STRUTS,
        component_name: "Front suspension struts",
        scope: "system",
        position: "front",
        side: "both",
        platform_a_year_from: 2016,
        platform_a_year_to: 2020,
        platform_b_year_from: 2014,
        platform_b_year_to: 2021,
        evidence_url: "https://kyb.co.jp/tech/m900-strut-cross",
        status: "needs_checking",
        conflict_status: "open",
      },
    ],
    vehicles: platformSisterVehiclesFixture(),
    cars: platformSisterVehiclesFixture(),
    car_count: 3,
    link_count: 3,
    body_class: "subcompact_tall_wagon",
    market: "JDM",
    source: "vehicle_platform",
  };
}

export function findPartsResultFixture() {
  const picked = {
    id: AM_VARIANT_ID,
    make: "Toyota",
    model: "Roomy",
    chassis_code: "M900A",
    engine_code: "1KR-FE",
    production_start_year: 2016,
    production_end_year: 2020,
    drivetrain: "2WD",
  };
  return {
    mode: "tiered" as const,
    car: { make: "Toyota", model: "Roomy", year: 2018, label: "Toyota Roomy 2018" },
    askVariant: false,
    pickedVariantId: AM_VARIANT_ID,
    variants: [picked],
    picked,
    sections: activeProfile === "empty"
      ? []
      : findPartsStitchPlainSections().map((section) => ({
        tier: section.tier,
        label: section.plainLabel,
        sisterNames: section.plainReason || null,
        items: section.items.map((item) => ({
          ...item,
          status: activeProfile === "allChecking" ? "needs_checking" : item.status,
        })),
      })),
    plainSections: activeProfile === "empty"
      ? []
      : findPartsStitchPlainSections().map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          status: activeProfile === "allChecking" ? "needs_checking" as const : item.status,
        })),
      })),
    emptyTiers: activeProfile === "empty" ? [1, 2, 3, 4, 5] : [],
    bestPick: null,
    coverage: { essentials: 4, essentialsTotal: 6, specs: 2, specsTotal: 4, otherParts: 8 },
    databaseNodeGroups: 5,
    universalToleranceMm: 0.05,
    universal_part: { tolerance_mm: 0.05 },
    platformLabel: "DAI-M900 (SHARED 3X)",
    axleLabel: "DISC / VENTILATED",
  };
}

function masterCatalogRows() {
  return [
    {
      partId: "d4444444-4444-4444-8444-444444444441",
      groupId: AM_GROUP_ID,
      name: "Disc Brake Pad Set",
      number: "D0048M-02",
      brand: "MK Kashiyama",
      tier: 1,
      assembly: "Brake pads",
      fittedCars: "Toyota Roomy",
      versionCount: 12,
      status: "verified",
      wva: "21670",
      fitCount: 12,
      updatedAt: null,
    },
    {
      partId: AM_PART_ID,
      groupId: AM_GROUP_ID,
      name: "Brake pads",
      number: "D0051M-01-J",
      brand: "MK Kashiyama",
      tier: 1,
      assembly: "Brake pads",
      fittedCars: "Toyota Roomy",
      versionCount: 3,
      status: "needs_checking",
      wva: "24551",
      fitCount: 35,
      updatedAt: null,
    },
    {
      partId: "d4444444-4444-4444-8444-444444444443",
      groupId: AM_GROUP_ID,
      name: "Heavy Duty Ceramic",
      number: "D0054M-01",
      brand: "MK Kashiyama",
      tier: 1,
      assembly: "Brake pads",
      fittedCars: "Toyota Roomy",
      versionCount: 4,
      status: "verified",
      wva: "24602",
      fitCount: 4,
      updatedAt: null,
    },
    {
      partId: "d4444444-4444-4444-8444-444444444444",
      groupId: AM_GROUP_ID,
      name: "Prime Axle Brake Pads",
      number: "P 16 013",
      brand: "Brembo",
      tier: 4,
      assembly: "Brake pads",
      fittedCars: "Toyota Roomy",
      versionCount: 3,
      status: "verified",
      wva: "24551",
      fitCount: 3,
      updatedAt: null,
    },
  ];
}

export function masterPartFixture() {
  return {
    partId: AM_PART_ID,
    groupId: AM_GROUP_ID,
    groupCode: "GRP-WVA-24551",
    groupRevision: 89,
    name: "Brake pads",
    number: "D0051M-01-J",
    brand: "MK Kashiyama",
    manufacturer: "MK Kashiyama",
    oemPartNumber: "D0051M-01-J",
    partType: "Brake pads",
    position: "front",
    side: "both",
    tier: 1,
    status: "needs_checking",
    evidenceUrl: "https://example.com/evidence",
    note: "Catalogue note on file.",
    wva: "24551",
    fitCount: 35,
    indexRevision: 89,
    indexGroupCode: "GRP-WVA-24551",
    indexGroupHeadline: "Grouped with 2 other parts by WVA 24551",
    indexBadge: "Same WVA 24551 as MK Kashiyama D0051M-01-J",
    wvaPeerLabels: ["Brembo P 16 013", "Bosch 0 986 494 999"],
    provenanceHash: "98fa10b0",
    schemaVersion: "2",
    fits: [
      {
        variantId: AM_VARIANT_ID,
        make: "Toyota",
        model: "Roomy",
        chassis: "M900A",
        years: "2016–2020",
        linkType: "DIRECT",
        position: "front",
        side: "both",
        via: "direct",
      },
      {
        variantId: "c3333333-3333-4333-8333-333333333334",
        make: "Toyota",
        model: "Tank",
        chassis: "M900A",
        years: "2016–2020",
        linkType: "DIRECT",
        position: "front",
        side: "both",
        via: "direct",
      },
      {
        variantId: "c3333333-3333-4333-8333-333333333335",
        make: "Daihatsu",
        model: "Thor",
        chassis: "M900S",
        years: "2016–present",
        linkType: "DIRECT",
        position: "front",
        side: "both",
        via: "sister",
      },
    ],
  };
}

function engineDisabledResponse() {
  return { error: "Parts auto-match is disabled." };
}

async function fulfillCatalogAdmin(route: Route) {
  await mockNetworkDelay();
  const url = route.request().url();
  const method = route.request().method();
  if (activeProfile === "error" && method === "GET" && url.includes("/admin/catalog/parts/master/")) {
    await route.fulfill({ status: 500, json: { error: "master part unavailable" } });
    return;
  }
  if (activeProfile === "error" && method === "GET" && url.includes("/admin/catalog/find-parts") && !url.includes("export")) {
    await route.fulfill({ status: 500, json: { error: "find-parts unavailable" } });
    return;
  }
  if (url.includes("/admin/catalog/find-parts/coverage")) {
    await route.fulfill({
      json: { variantId: AM_VARIANT_ID, areas: [{ id: "brakes", count: activeProfile === "empty" ? 0 : 4 }] },
    });
    return;
  }
  if (url.includes("/admin/catalog/find-parts")) {
    await route.fulfill({ json: findPartsResultFixture() });
    return;
  }
  if (url.includes("/admin/catalog/parts/master/")) {
    await route.fulfill({ json: masterPartFixture() });
    return;
  }
  if (url.includes("/admin/catalog/overview") || url.includes("/admin/catalog/parts-overview")) {
    await route.fulfill({
      json: {
        vehicles: 120,
        partsOnFile: 450,
        fitmentsOnFile: 35,
        vehiclesWithParts: 80,
        waiting: 2,
        matchTypesOff: activeProfile === "flagOff",
      },
    });
    return;
  }
  if (url.includes("/admin/catalog/parts/master") && !url.match(/\/master\/[^/?]+$/)) {
    const catalogRows = masterCatalogRows();
    const oemRows = catalogRows.filter((row) => row.tier === 1);
    const aftermarketRows = catalogRows.filter((row) => row.tier === 4);
    await route.fulfill({
      json: {
        rows: activeProfile === "empty" ? [] : catalogRows,
        total: activeProfile === "empty" ? 0 : 35,
        chips: { all: activeProfile === "empty" ? 0 : 35, oem: 3, sister: 0, engine: 0, aftermarket: 1, universal: 0 },
        groups: activeProfile === "empty"
          ? { oem: [], engine: [], aftermarket: [], sister: [], universal: [] }
          : { oem: oemRows, engine: [], aftermarket: aftermarketRows, sister: [], universal: [] },
        facets: { brands: [], assemblies: [], statusCounts: { all: 4, verified: 3, needs_checking: 1 } },
      },
    });
    return;
  }
  if (url.includes("/admin/catalog/vehicle-options")) {
    await route.fulfill({
      json: {
        makes: ["Toyota"],
        models: ["Roomy"],
        years: [2018],
        variants: findPartsResultFixture().variants,
      },
    });
    return;
  }
  if (url.includes("/admin/catalog/symptoms")) {
    await route.fulfill({ json: { symptoms: [] } });
    return;
  }
  if (url.includes("/admin/vehicle-catalog-pending-requests")) {
    await route.fulfill({ json: { items: [], total: 0 } });
    return;
  }
  if (url.includes("/admin/vehicle-catalog-pending")) {
    await route.fulfill({ json: { items: [], total: 0 } });
    return;
  }
  if (url.includes("/admin/catalog/parts-browse") || url.includes("/parts/browse")) {
    const brakeComponents = [
      { id: AM_COMPONENT_ID, plainName: "Brake pads", positionAware: true },
      { id: AM_COMPONENT_BRAKE_SHOES, plainName: "Brake shoes / drums", positionAware: true },
      { id: AM_COMPONENT_BRAKE_ROTOR, plainName: "Brake rotor", positionAware: true },
      { id: AM_COMPONENT_STRUTS, plainName: "Front suspension struts", positionAware: true },
    ];
    const filterComponents = [
      { id: AM_COMPONENT_OIL_FILTER, plainName: "Oil filter", positionAware: false },
      { id: AM_COMPONENT_CABIN_FILTER, plainName: "Cabin air filter", positionAware: false },
    ];
    await route.fulfill({
      json: {
        systems: [
          { id: "brakes", plainName: "Brakes", icon: null, components: brakeComponents },
          { id: "filters", plainName: "Filters", icon: null, components: filterComponents },
        ],
        areas: [
          { id: "brakes", label: "Brakes", components: brakeComponents.map((c) => ({ id: c.id, label: c.plainName })) },
          { id: "filters", label: "Filters", components: filterComponents.map((c) => ({ id: c.id, label: c.plainName })) },
        ],
        common: [],
      },
    });
    return;
  }
  if (url.includes("/admin/catalog/spec-keys")) {
    await route.fulfill({ json: { items: [] } });
    return;
  }
  if (method === "GET" && url.includes("/admin/catalog/")) {
    await route.fulfill({ json: {} });
    return;
  }
  await route.continue();
}

async function fulfillFleetCoreAdmin(route: Route) {
  await mockNetworkDelay();
  const url = route.request().url();
  const method = route.request().method();

  if (activeProfile === "error") {
    if (url.includes("/admin/auto-match/health") || url.includes("/admin/auto-match/schedule")) {
      await route.fulfill({ status: 500, json: { error: "health probe failed" } });
      return;
    }
    if (method === "GET" && url.includes("/admin/auto-match/conflicts")) {
      await route.fulfill({ status: 500, json: { error: "conflicts unavailable" } });
      return;
    }
    if (method === "GET" && url.match(/\/admin\/auto-match\/platforms\/[^/]+(\?|$)/)) {
      await route.fulfill({ status: 500, json: { error: "platform detail unavailable" } });
      return;
    }
  }

  if (url.includes("/admin/auto-match/health")) {
    await route.fulfill({ json: partMatchHealthFixture(new URL(url).searchParams.get("vehicleId")) });
    return;
  }
  if (url.includes("/admin/auto-match/schedule")) {
    await route.fulfill({ json: partMatchScheduleFixture() });
    return;
  }
  if (url.includes("/admin/auto-match/conflicts/heatmap")) {
    const empty = activeProfile === "empty";
    await route.fulfill({
      json: {
        byType: empty ? {} : { oe_ambiguous: 2 },
        byVehicle: empty ? {} : { [AM_VEHICLE_ID]: 1 },
        openCount: empty ? 0 : 4,
      },
    });
    return;
  }
  if (url.includes("/admin/auto-match/conflicts") && method === "GET") {
    const reqUrl = new URL(url);
    const payload = autoMatchConflictsFixture();
    const statusFilter = reqUrl.searchParams.get("status");
    const typeFilter = reqUrl.searchParams.get("type");
    const q = (reqUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    let rows = payload.rows;
    if (statusFilter) rows = rows.filter((r) => String(r.status) === statusFilter);
    if (typeFilter) rows = rows.filter((r) => String(r.conflict_type) === typeFilter);
    if (q) {
      rows = rows.filter((r) =>
        JSON.stringify(r).toLowerCase().includes(q),
      );
    }
    await route.fulfill({ json: { ...payload, rows, filteredCount: rows.length } });
    return;
  }
  if (url.includes("/admin/auto-match/conflicts/resolve-batch") && method === "POST") {
    if (activeProfile === "flagOff") {
      await route.fulfill({ status: 403, json: engineDisabledResponse() });
      return;
    }
    await route.fulfill({ json: { ok: true, resolved: 1 } });
    return;
  }
  if (url.includes("/admin/auto-match/conflicts/") && url.includes("/unmerge-same-part") && method === "POST") {
    if (activeProfile === "flagOff") {
      await route.fulfill({ status: 403, json: engineDisabledResponse() });
      return;
    }
    await route.fulfill({ json: { ok: true } });
    return;
  }
  if (url.includes("/admin/auto-match/conflicts/") && url.includes("/resolve") && method === "POST") {
    if (activeProfile === "flagOff") {
      await route.fulfill({ status: 403, json: engineDisabledResponse() });
      return;
    }
    await route.fulfill({ json: { ok: true } });
    return;
  }
  if (url.includes("/admin/auto-match/runs")) {
    const last = partMatchHealthFixture().lastRun;
    await route.fulfill({ json: { rows: last ? [last] : [] } });
    return;
  }
  if (url.includes("/admin/auto-match/catalog/completeness")) {
    await route.fulfill({
      json: activeProfile === "empty"
        ? { vehicleCount: 0, vehiclesWithOeNumbers: 0, platformLinkCount: 0, groups: 0, parts: 0, listings: 0, derived: 0, openConflicts: 0, unresolvedPositionReports: 0 }
        : {
            vehicleCount: 120,
            vehiclesWithOeNumbers: 80,
            vehiclesMissingOe: 40,
            platformLinkCount: 12,
            groups: 48,
            parts: 320,
            partsWithSpecAttributes: 293,
            listings: 890,
            derived: 17,
            openConflicts: 4,
            unresolvedPositionReports: 3,
          },
    });
    return;
  }
  if (url.includes("/admin/auto-match/catalog/validation-exceptions")) {
    await route.fulfill({
      json: activeProfile === "empty"
        ? { rows: [] }
        : {
            rows: [
              {
                id: "11111111-1111-4111-8111-111111111130",
                code: "MISMATCHED_THREAD_PITCH",
                detail: { message: "M12x1.25 parsed as standard M12x1.5" },
                affected_ref: "LUG-N-HON-091",
                source: "OEM Fitment Feed",
                severity: "medium",
                created_at: "2026-11-01T12:00:00.000Z",
              },
            ],
          },
    });
    return;
  }
  if (url.includes("/admin/auto-match/position-reports/export")) {
    await route.fulfill({ body: "id,reason\n1,position_unmapped", contentType: "text/csv" });
    return;
  }
  if (url.includes("/admin/auto-match/position-reports")) {
    const pending = !url.includes("pending=0");
    const defaultRows = [
      {
        id: "11111111-1111-4111-8111-111111111114",
        table_name: "part_listing",
        row_id: "11111111-1111-4111-8111-111111111115",
        original_position: "XYZ",
        original_side: null,
        reason: "unmapped",
        created_at: "2026-11-02T03:00:00.000Z",
        resolved_at: null,
      },
      {
        id: "11111111-1111-4111-8111-111111111116",
        table_name: "part_listing_exclusion",
        row_id: "11111111-1111-4111-8111-111111111117",
        original_position: "FRT-LH/RH",
        original_side: null,
        reason: "unmapped",
        created_at: "2026-11-02T03:00:00.000Z",
        resolved_at: null,
      },
      {
        id: "11111111-1111-4111-8111-111111111118",
        table_name: "part_listing",
        row_id: "11111111-1111-4111-8111-111111111119",
        original_position: "ANY_AXLE_B",
        original_side: "both",
        reason: "duplicate_after_normalization",
        survivor_id: "11111111-1111-4111-8111-111111111120",
        created_at: "2026-11-01T21:18:00.000Z",
        resolved_at: null,
      },
    ];
    const historyRows = [
      {
        id: "11111111-1111-4111-8111-111111111121",
        table_name: "part_listing",
        row_id: "11111111-1111-4111-8111-111111111122",
        original_position: "F/R-BOTH",
        original_side: null,
        reason: "unmapped",
        resolution_source: "manual",
        resolved_by: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        resolved_at: "2026-11-02T01:14:00.000Z",
        created_at: "2026-11-01T12:00:00.000Z",
      },
    ];
    await route.fulfill({
      json: {
        rows: activeProfile === "empty"
          ? []
          : pending
            ? defaultRows
            : historyRows,
      },
    });
    return;
  }
  if (url.includes("/admin/auto-match/run-audit") && method === "POST") {
    if (activeProfile === "flagOff") {
      await route.fulfill({ status: 403, json: engineDisabledResponse() });
      return;
    }
    await route.fulfill({ json: { ok: true } });
    return;
  }
  if (url.includes("/admin/auto-match/keep-batch") && method === "POST") {
    if (activeProfile === "flagOff") {
      await route.fulfill({ status: 403, json: engineDisabledResponse() });
      return;
    }
    await route.fulfill({ json: { ok: true } });
    return;
  }
  if (url.includes("/admin/auto-match/derived/remove-batch") && method === "POST") {
    if (activeProfile === "flagOff") {
      await route.fulfill({ status: 403, json: engineDisabledResponse() });
      return;
    }
    const body = (await route.request().postDataJSON().catch(() => ({}))) as { derivedIds?: string[] };
    await route.fulfill({ json: { ok: true, removed: body.derivedIds?.length ?? 0 } });
    return;
  }
  if (url.includes("/admin/platform-feature-flags/parts_auto_match_enabled") && method === "PATCH") {
    await route.fulfill({ json: { ok: true, enabled: true } });
    return;
  }
  if (url.includes("/derived-fits") && method === "GET") {
    if (activeProfile === "flagOff") {
      await route.fulfill({ status: 403, json: engineDisabledResponse() });
      return;
    }
    await route.fulfill({ json: vehicleDerivedFitsFixture() });
    return;
  }
  if (url.includes("/revisions") && method === "GET" && url.includes("/vehicles/")) {
    await route.fulfill({ json: vehicleOeRevisionsFixture() });
    return;
  }
  if (url.includes("/oe-numbers/normalize") && method === "POST") {
    let body: { oe_number?: string } = {};
    try {
      body = (await route.request().postDataJSON()) as { oe_number?: string };
    } catch {
      body = {};
    }
    const raw = String(body.oe_number ?? "");
    await route.fulfill({
      json: { oe_number_norm: raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() },
    });
    return;
  }
  if (url.includes("/admin/vehicles/") && url.includes("/oe-numbers")) {
    if (activeProfile === "error") {
      await route.fulfill({ status: 500, json: { error: "oe numbers unavailable" } });
      return;
    }
    await route.fulfill({ json: vehicleOeNumbersFixture() });
    return;
  }
  if (url.includes("/admin/vehicle-catalog") && method === "GET") {
    await route.fulfill({ json: vehicleCatalogListFixture() });
    return;
  }
  if (url.match(/\/admin\/auto-match\/platforms\/[^/]+\/export(\?|$)/) && method === "GET") {
    const detail = adminPlatformDetailFixture();
    await route.fulfill({
      json: { platformId: AM_PLATFORM_ID, links: detail.links ?? [], format: "matrix" },
    });
    return;
  }
  if (url.match(/\/admin\/auto-match\/platforms\/[^/]+(\?|$)/) && method === "GET") {
    await route.fulfill({ json: adminPlatformDetailFixture() });
    return;
  }
  if (url.match(/\/admin\/auto-match\/platforms\/[^/]+\/links(\?|$)/) && method === "POST") {
    await route.fulfill({ json: { row: { id: "11111111-1111-4111-8111-111111111199" } } });
    return;
  }
  if (url.includes("/admin/vehicle-platforms") || url.includes("/admin/auto-match/platforms")) {
    await route.fulfill({ json: vehiclePlatformsFixture() });
    return;
  }
  if (url.includes("/admin/parts/") && url.includes("/oe-references")) {
    await route.fulfill({ json: partOeReferencesFixture() });
    return;
  }
  if (url.includes("/admin/parts/") && url.includes("/index-numbers")) {
    await route.fulfill({ json: partIndexNumbersFixture() });
    return;
  }
  if (url.includes("/admin/parts/") && url.includes("/approvals")) {
    await route.fulfill({ json: { rows: [] } });
    return;
  }
  if (url.includes("/admin/catalog/find-parts/export") && method === "GET") {
    await route.fulfill({ body: "tier,part_id\n1,test", contentType: "text/csv" });
    return;
  }
  if (url.includes("/admin/catalog/find-parts/rematch") && method === "POST") {
    if (activeProfile === "flagOff") {
      await route.fulfill({ status: 403, json: engineDisabledResponse() });
      return;
    }
    await route.fulfill({ json: { ok: true } });
    return;
  }
  if (url.includes("/admin/catalog/")) {
    await fulfillCatalogAdmin(route);
    return;
  }
  if (method === "GET" && (url.includes("/platform-status") || url.includes("/team/access"))) {
    await route.fulfill({ json: { maintenanceMode: false, portal: true, role: "platform_owner" } });
    return;
  }
  await route.continue();
}

export async function installDominionAutoMatchMocks(page: Page, options: AutoMatchMockOptions = {}) {
  activeProfile = options.profile ?? "default";
  await page.route("**/functions/v1/fleet-core/**", fulfillFleetCoreAdmin);
  await page.route("**/__sb/functions/v1/fleet-core/**", fulfillFleetCoreAdmin);
  await page.route("**/fleet-core/**", fulfillFleetCoreAdmin);
  await page.route("**/functions/v1/platform-catalog/**", fulfillCatalogAdmin);
  await page.route("**/platform-catalog/**", fulfillCatalogAdmin);
}
