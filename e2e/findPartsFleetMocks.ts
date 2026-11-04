import type { Page, Route } from "@playwright/test";
import type { FleetCar } from "../apps/fleet/src/components/vehicles/find-parts/CarStep";
import type { PartsActivity } from "../apps/fleet/src/components/vehicles/find-parts/PartsActivityPanel";
import {
  findPartsFixtureBrowse,
  findPartsFixtureFindSections,
  findPartsFixtureOffer,
  findPartsFixturePart,
  findPartsFixtureVehicle,
  findPartsFixtureVersions,
} from "../apps/fleet/src/components/vehicles/find-parts/findPartsFixtures";
import {
  STITCH_VISUAL_LABEL,
  STITCH_VISUAL_PLATE,
  STITCH_VISUAL_VEHICLE_ID,
  stitchVisualActivity,
  stitchVisualBrowse,
  stitchVisualFitHints,
  stitchVisualVehicleContext,
} from "./findPartsStitchVisualFixtures";
import { stitchAutoMatchFindResult } from "./findPartsStitchAutoMatchFixtures";

export { FIND_PARTS_FORBIDDEN_SAMPLES } from "../apps/fleet/src/components/vehicles/find-parts/findParts.noSample.banned";

export const fleetTeamAccessFixture = {
  portal: true,
  role: "fleet_owner",
  staffRole: null,
  organizationId: "org-fixture-1",
  productLine: "fleet" as const,
  pendingInvite: null,
  pendingTransfer: null,
  outgoingTransfer: null,
};

export const fleetPlatformStatusFixture = {
  maintenanceMode: false,
  maintenanceMessage: "",
  platformName: "Roam Fleet",
};

export function fleetAuthSession() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access = `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aal: "aal2",
    sub: "11111111-1111-4111-8111-111111111111",
    role: "authenticated",
    exp: 4_000_000_000,
    app_metadata: { role: "fleet_owner" },
  })}.sig`;
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    app_metadata: { role: "fleet_owner" },
    user_metadata: { full_name: "Fixture Owner", productLine: "fleet" },
  };
  return {
    access_token: access,
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}

/** Supabase storage key varies with VITE_SUPABASE_URL — seed common keys for local + CI. */
export async function seedFleetAuthSession(page: Page, session: ReturnType<typeof fleetAuthSession>) {
  await page.addInitScript((stored) => {
    const payload = JSON.stringify(stored);
    localStorage.setItem("sb-example-auth-token", payload);
    localStorage.setItem("sb-csfllzzastacofsvcdsc-auth-token", payload);
  }, session);
}

export function fleetCorePartsFixtures(cars: FleetCar[] = []) {
  const vehicle = findPartsFixtureVehicle;
  return {
    myVehicles: {
      items: [{
        ...vehicle,
        vehicle_id: cars[0]?.vehicleId || vehicle.vehicle_id,
        plate: cars[0]?.licensePlate || vehicle.plate,
        label: cars[0] ? [cars[0].year, cars[0].make, cars[0].model].filter(Boolean).join(" ") : vehicle.label,
      }],
    },
    vehicleOptions: { makes: ["Nissan"], models: ["Note"], years: [2016], versions: findPartsFixtureVersions },
    term: { hits: [], components: [], synonyms: [], parts: [] },
    activity: {
      requests: { total: 2, items: [{ id: "req-1", need_text: "Fixture front pads", status: "open" }, { id: "req-2", need_text: "Fixture alternator", status: "sourcing" }] },
      quotes: { total: 1, items: [{ id: "q-1", reference: "FIX-Q-001", supplier: "Fixture Motors", total_jmd: 9999 }] },
      repeatAlerts: { total: 1, items: [{ id: "alert-1", title: "Fixture wear alert", detail: "Repeat pad wear" }] },
      warrantyClaims: { total: 0, items: [] },
      cores: { total: 1, items: [{ id: "core-1", summary: "Fixture core credit" }] },
    },
    find: {
      sections: findPartsFixtureFindSections,
      car: { label: vehicle.label },
      chassis: "FIX-300",
      trimBadge: "FIX-VAR",
      linked: true,
    },
    vehicleContext: {
      label: vehicle.label,
      plate: vehicle.plate,
      odometer: 84000,
      lastService: "Fixture service",
      health_pct: 94,
      hub_label: "Fixture hub",
      trim: "Pre-Facelift · 1KR-FE · 2WD",
      chassis_code: "M900A",
      orgShortCode: "KIN-FLEET",
      engineFilterLine: "1KR-FE 1.0L",
      latestNote: null,
      alternateTrimsLine: "",
    },
    browse: findPartsFixtureBrowse,
    symptoms: { problems: [{ id: "sym-1", name: "Fixture squeal", positionAware: true }] },
    savedSearches: { items: [] },
    fitHints: {
      hasSideSpecificListings: false,
      countsByPosition: { front: 2, rear: 0 },
      labelsByPosition: { front: "Front brake pad set" },
    },
  };
}

/** Stitch-aligned mocks for FP3–FP12 live PNG capture (see findPartsStitchVisualFixtures.ts). */
export function fleetCoreStitchVisualFixtures() {
  const base = fleetCorePartsFixtures([{
    vehicleId: STITCH_VISUAL_VEHICLE_ID,
    licensePlate: STITCH_VISUAL_PLATE,
    year: "2019",
    make: "Toyota",
    model: "Roomy",
  } as FleetCar]);
  const find = stitchAutoMatchFindResult();
  return {
    ...base,
    myVehicles: {
      items: [{
        id: STITCH_VISUAL_VEHICLE_ID,
        vehicle_id: STITCH_VISUAL_VEHICLE_ID,
        plate: STITCH_VISUAL_PLATE,
        label: STITCH_VISUAL_LABEL,
        parts_on_shelf: 8,
        subtitle: "Pre-Facelift · 1KR-FE · 2WD",
        hub: "Kingston East Hub",
      }],
    },
    vehicleContext: stitchVisualVehicleContext(),
    browse: stitchVisualBrowse(),
    activity: stitchVisualActivity(),
    find: {
      sections: find.sections,
      car: find.car,
      chassis: find.chassis,
      trimBadge: find.trimBadge,
      linked: true,
      askVariant: false,
      pickedVariantId: stitchVisualVehicleContext().variantId,
    },
    fitHints: stitchVisualFitHints(),
  };
}

export async function mockFleetCoreRoute(url: string, method: string, fixtures: ReturnType<typeof fleetCorePartsFixtures>) {
  const path = new URL(url).pathname;
  if (path.endsWith("/team/access")) return fleetTeamAccessFixture;
  if (path.endsWith("/platform-status")) return fleetPlatformStatusFixture;
  if (path.endsWith("/parts/my-vehicles")) return fixtures.myVehicles;
  if (path.endsWith("/parts/vehicle-options")) return fixtures.vehicleOptions;
  if (path.endsWith("/parts/term")) return fixtures.term;
  if (path.endsWith("/parts/activity")) return fixtures.activity;
  if (path.includes("/parts/vehicle-context")) return fixtures.vehicleContext;
  if (path.endsWith("/parts/browse")) return fixtures.browse;
  if (path.endsWith("/parts/symptoms")) return fixtures.symptoms;
  if (path.endsWith("/parts/saved-searches")) return fixtures.savedSearches;
  if (path.includes("/parts/component-fit-hints")) {
    return (fixtures as { fitHints?: unknown }).fitHints ?? {
      hasSideSpecificListings: false,
      countsByPosition: { front: 0, rear: 0 },
      labelsByPosition: {},
    };
  }
  if (path.includes("/parts/find")) {
    return {
      ...fixtures.find,
      linked: fixtures.find?.linked ?? true,
      askVariant: false,
      pickedVariantId: fixtures.vehicleContext?.variantId ?? null,
    };
  }
  return null;
}

/** Playwright matches routes LIFO — register catch-alls before specific fleet-core paths. */
export async function installFleetCoreMockRoutes(
  page: Page,
  fixtures: ReturnType<typeof fleetCorePartsFixtures>,
) {
  const fulfillFleetCore = async (route: Route) => {
    const json = await mockFleetCoreRoute(route.request().url(), route.request().method(), fixtures);
    if (json != null) {
      await route.fulfill({ json });
      return;
    }
    await route.fulfill({ json: {} });
  };
  await page.route("**/functions/v1/fleet-ops/**/maintenance-fleet-summary**", async (route) => {
    await route.fulfill({ json: { vehicles: [], summary: {} } });
  });
  await page.route("**/__sb/functions/v1/fleet-ops/**/maintenance-fleet-summary**", async (route) => {
    await route.fulfill({ json: { vehicles: [], summary: {} } });
  });
  await page.route("**/fleet-ops/**/maintenance-fleet-summary**", async (route) => {
    await route.fulfill({ json: { vehicles: [], summary: {} } });
  });
  await page.route("**/functions/v1/fleet-core/**", fulfillFleetCore);
  await page.route("**/__sb/functions/v1/fleet-core/**", fulfillFleetCore);
  await page.route("**/fleet-core/**", fulfillFleetCore);
  await page.route("**/functions/v1/fleet-core/platform-status**", async (route) => {
    await route.fulfill({ json: fleetPlatformStatusFixture });
  });
  await page.route("**/__sb/functions/v1/fleet-core/platform-status**", async (route) => {
    await route.fulfill({ json: fleetPlatformStatusFixture });
  });
  await page.route("**/functions/v1/fleet-core/team/access**", async (route) => {
    await route.fulfill({ json: fleetTeamAccessFixture });
  });
  await page.route("**/__sb/functions/v1/fleet-core/team/access**", async (route) => {
    await route.fulfill({ json: fleetTeamAccessFixture });
  });
}
