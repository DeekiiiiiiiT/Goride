import type { Page, Route } from "@playwright/test";

export const AM_VEHICLE_ID = "a1111111-1111-4111-8111-111111111111";
export const AM_VARIANT_ID = "b2222222-2222-4222-8222-222222222222";
export const AM_COMPONENT_ID = "c3333333-3333-4333-8333-333333333333";
export const AM_PART_ID = "d4444444-4444-4444-8444-444444444444";
export const AM_CONFLICT_ID = "e5555555-5555-4555-8555-555555555555";
export const AM_PLATFORM_ID = "f6666666-6666-4666-8666-666666666666";

/** Stitch sample values that must not appear when mocks supply real-shaped data. */
export const AM_DOMINION_FORBIDDEN = [
  "1,428",
  "RECON V4.8.2",
  "AUTOMATED MATCHING ENGINE SUBSYSTEM",
  "Active in master catalog",
  "Catalog integrity, reconciliation pipeline",
  "TOYOTA ROOMY (M900A)",
];

export const AM_FLEET_FORBIDDEN = [
  "Kingston Hub #01",
  "Result Row with \"Why it fits\" Match Intelligence",
];

export function partMatchHealthFixture(vehicleId?: string | null) {
  return {
    engineVersion: 2,
    normVersion: 1,
    enabled: false,
    derived: { live: 12, needsChecking: 2, suppressed: 1 },
    openConflicts: vehicleId ? { oe_ambiguous: 1 } : { oe_ambiguous: 1, system_link: 0 },
    lastRun: {
      run_id: "11111111-1111-4111-8111-111111111112",
      kind: "nightly",
      started_at: "2026-11-02T03:00:00.000Z",
      finished_at: new Date(Date.now() - 3600_000).toISOString(),
      error: null,
      duration_ms: 72000,
      rows_scanned: 428,
    },
    errorCount24h: 0,
    unresolvedPositionReports: 2,
  };
}

export function partMatchScheduleFixture() {
  return {
    nextRun: new Date(Date.now() + 6 * 3600_000).toISOString(),
    cron: "0 3 * * *",
    jobname: "part-match-nightly",
  };
}

export function autoMatchConflictsFixture() {
  return {
    rows: [
      {
        id: AM_CONFLICT_ID,
        code: "AMC-E2E-1",
        conflict_type: "oe_ambiguous",
        status: "open",
        vehicle_catalog_id: AM_VEHICLE_ID,
        vehicle_label: "Toyota Roomy M900A",
        part_name: "Front brake pad set",
        interchange_group_id: "g1111111-1111-4111-8111-111111111111",
        part_id: AM_PART_ID,
        matched_key: "D0051M-01-J",
        detail: { group_ids: ["g1111111-1111-4111-8111-111111111111"] },
        computed_at: "2026-11-02T12:00:00.000Z",
      },
    ],
    filteredCount: 1,
    totalsByType: {
      oe_ambiguous: 2,
      system_link: 1,
      index_merge_proposed: 0,
    },
    totalsByStatus: {
      open: 3,
      kept: 1,
      removed: 0,
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

export function vehicleOeNumbersFixture() {
  return {
    rows: [
      {
        id: "11111111-1111-4111-8111-111111111113",
        oe_brand: "Toyota",
        oe_number: "D0051M-01-J",
        part_type_name: "Brake pad set",
        position: "front",
        side: "both",
        year_from: 2016,
        year_to: 2020,
        match_count: 3,
      },
    ],
    lastRun: partMatchHealthFixture(AM_VEHICLE_ID).lastRun,
  };
}

export function vehiclePlatformsFixture() {
  return {
    items: [
      {
        id: AM_PLATFORM_ID,
        code: "DAI-M900",
        label: "Daihatsu M900 shared platform",
        maker: "Daihatsu",
        carCount: 3,
      },
    ],
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
    sections: [
      {
        tier: 1,
        label: "Made for your car",
        items: [
          {
            partId: AM_PART_ID,
            brand: "Toyota",
            number: "D0051M-01-J",
            name: "Front brake pad set",
            reason: "Same factory number on file for this car.",
            status: "live",
            fit_source: "derived",
            via: "engine",
            reason_code: "oe_number_match",
            position: "front",
            side: "both",
            wva: "12345",
          },
        ],
      },
    ],
    plainSections: [
      {
        tier: 1,
        plainLabel: "Made for your car",
        plainReason: "Toyota Roomy shares the M900A platform.",
        items: [
          {
            partId: AM_PART_ID,
            brand: "Toyota",
            number: "D0051M-01-J",
            name: "Front brake pad set",
            reason: "Same factory number on file for this car.",
            status: "live",
            fit_source: "derived",
            via: "engine",
            reason_code: "oe_number_match",
            position: "front",
            side: "both",
          },
        ],
      },
    ],
    emptyTiers: [2, 3, 4],
    bestPick: null,
    coverage: { essentials: 4, essentialsTotal: 6, specs: 2, specsTotal: 4, otherParts: 8 },
  };
}

export function masterPartFixture() {
  return {
    partId: AM_PART_ID,
    groupId: "g1111111-1111-4111-8111-111111111111",
    groupCode: "GRP-M900-BRK",
    groupRevision: 2,
    name: "Front brake pad set",
    number: "D0051M-01-J",
    brand: "MK Kashiyama",
    manufacturer: "Toyota",
    oemPartNumber: "D0051M-01-J",
    partType: "Brake pads",
    position: "front",
    side: "both",
    tier: 1,
    status: "verified",
    evidenceUrl: "https://example.com/evidence",
    note: "Catalogue note on file.",
    wva: "24551",
    fitCount: 35,
    indexRevision: 2,
    provenanceHash: "a1b2c3d4",
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
    ],
  };
}

async function fulfillCatalogAdmin(route: Route) {
  const url = route.request().url();
  const method = route.request().method();
  if (url.includes("/admin/catalog/find-parts/coverage")) {
    await route.fulfill({
      json: { variantId: AM_VARIANT_ID, areas: [{ id: "brakes", count: 4 }] },
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
  if (url.includes("/admin/catalog/overview")) {
    await route.fulfill({
      json: {
        vehicles: 120,
        partsOnFile: 450,
        fitmentsOnFile: 890,
        vehiclesWithParts: 80,
        waiting: 2,
        matchTypesOff: false,
      },
    });
    return;
  }
  if (url.includes("/admin/catalog/parts/search") || url.includes("/admin/catalog/master-search")) {
    await route.fulfill({
      json: {
        items: [
          {
            partId: AM_PART_ID,
            name: "Front brake pad set",
            manufacturer: "Toyota",
            oemPartNumber: "D0051M-01-J",
            tier: 1,
            status: "verified",
          },
        ],
        total: 1,
        counts: { all: 1, oem: 1, sister: 0, engine: 0, aftermarket: 0, universal: 0 },
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
  if (url.includes("/admin/catalog/parts-browse")) {
    await route.fulfill({
      json: {
        areas: [{ id: "brakes", label: "Brakes", components: [{ id: AM_COMPONENT_ID, label: "Brake pads" }] }],
      },
    });
    return;
  }
  if (method === "GET" && url.includes("/admin/catalog/")) {
    await route.fulfill({ json: {} });
    return;
  }
  await route.continue();
}

async function fulfillFleetCoreAdmin(route: Route) {
  const url = route.request().url();
  const method = route.request().method();
  if (url.includes("/admin/auto-match/health")) {
    await route.fulfill({ json: partMatchHealthFixture(new URL(url).searchParams.get("vehicleId")) });
    return;
  }
  if (url.includes("/admin/auto-match/schedule")) {
    await route.fulfill({ json: partMatchScheduleFixture() });
    return;
  }
  if (url.includes("/admin/auto-match/conflicts/heatmap")) {
    await route.fulfill({
      json: { byType: { oe_ambiguous: 2 }, byVehicle: { [AM_VEHICLE_ID]: 1 }, openCount: 2 },
    });
    return;
  }
  if (url.includes("/admin/auto-match/conflicts") && method === "GET") {
    await route.fulfill({ json: autoMatchConflictsFixture() });
    return;
  }
  if (url.includes("/admin/auto-match/conflicts/") && url.includes("/resolve") && method === "POST") {
    await route.fulfill({ json: { ok: true } });
    return;
  }
  if (url.includes("/admin/auto-match/runs")) {
    await route.fulfill({ json: { rows: [partMatchHealthFixture().lastRun] } });
    return;
  }
  if (url.includes("/admin/auto-match/catalog/completeness")) {
    await route.fulfill({ json: { vehicleCount: 120, vehiclesWithOeNumbers: 80, platformLinkCount: 12 } });
    return;
  }
  if (url.includes("/admin/auto-match/position-reports/export")) {
    await route.fulfill({ body: "id,reason\n1,test", contentType: "text/csv" });
    return;
  }
  if (url.includes("/admin/auto-match/position-reports")) {
    await route.fulfill({
      json: {
        rows: [
          { id: "11111111-1111-4111-8111-111111111114", original_position: "FL", original_side: null, reason: "parser", confidence: 0.82 },
        ],
      },
    });
    return;
  }
  if (url.includes("/admin/auto-match/run-audit") && method === "POST") {
    await route.fulfill({ json: { ok: true } });
    return;
  }
  if (url.includes("/admin/auto-match/keep-batch") && method === "POST") {
    await route.fulfill({ json: { ok: true } });
    return;
  }
  if (url.includes("/admin/platform-feature-flags/parts_auto_match_enabled") && method === "PATCH") {
    await route.fulfill({ json: { ok: true, enabled: true } });
    return;
  }
  if (url.includes("/admin/vehicles/") && url.includes("/oe-numbers")) {
    await route.fulfill({ json: vehicleOeNumbersFixture() });
    return;
  }
  if (url.includes("/admin/vehicle-catalog") && method === "GET") {
    await route.fulfill({ json: vehicleCatalogListFixture() });
    return;
  }
  if (url.includes("/admin/vehicle-platforms") || url.includes("/admin/auto-match/platforms")) {
    await route.fulfill({ json: vehiclePlatformsFixture() });
    return;
  }
  if (url.includes("/admin/auto-match/platform") && method === "GET") {
    await route.fulfill({
      json: {
        platform: vehiclePlatformsFixture().items[0],
        vehicles: vehicleCatalogListFixture().items,
        links: [],
        linkCount: 2,
      },
    });
    return;
  }
  if (url.includes("/admin/parts/") && (url.includes("/oe-references") || url.includes("/index-numbers") || url.includes("/approvals"))) {
    await route.fulfill({ json: { rows: [] } });
    return;
  }
  if (url.includes("/admin/catalog/find-parts/export") && method === "GET") {
    await route.fulfill({ body: "tier,part_id\n1,test", contentType: "text/csv" });
    return;
  }
  if (url.includes("/admin/catalog/find-parts/rematch") && method === "POST") {
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

export async function installDominionAutoMatchMocks(page: Page) {
  await page.route("**/functions/v1/fleet-core/**", fulfillFleetCoreAdmin);
  await page.route("**/__sb/functions/v1/fleet-core/**", fulfillFleetCoreAdmin);
  await page.route("**/fleet-core/**", fulfillFleetCoreAdmin);
  await page.route("**/functions/v1/platform-catalog/**", fulfillCatalogAdmin);
  await page.route("**/platform-catalog/**", fulfillCatalogAdmin);
}
