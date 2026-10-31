import type { FleetCar } from "../apps/fleet/src/components/vehicles/find-parts/CarStep";
import type { PartsActivity } from "../apps/fleet/src/components/vehicles/find-parts/PartsActivityPanel";
import {
  findPartsFixtureOffer,
  findPartsFixturePart,
  findPartsFixtureVehicle,
} from "../apps/fleet/src/components/vehicles/find-parts/findPartsFixtures";

export { FIND_PARTS_FORBIDDEN_SAMPLES } from "../apps/fleet/src/components/vehicles/find-parts/findParts.noSample.banned";

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
    user_metadata: { full_name: "Fixture Owner" },
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
    vehicleOptions: { makes: ["Nissan"], models: ["Note"], years: [2016], versions: [{ id: "var-1", name: "NCP160" }] },
    term: { hits: [], components: [], synonyms: [], parts: [] },
    wrongFitCount: { count: 0, days: 30 },
    activity: {
      requests: { total: 1, items: [{ need_text: "Fixture request" }] },
      quotes: { total: 0, items: [] },
      repeatAlerts: { total: 0, items: [] },
      warrantyClaims: { total: 0, items: [] },
      cores: { total: 0, items: [] },
    },
    runnerOnline: { online: true },
    find: {
      sections: [{
        tier: 1,
        label: "Best match",
        items: [{
          part: findPartsFixturePart,
          stockQty: 0,
          offers: [findPartsFixtureOffer],
        }],
      }],
      car: { label: vehicle.label },
      linked: true,
    },
    vehicleContext: {
      label: vehicle.label,
      plate: vehicle.plate,
      odometer: 84000,
      lastService: "None yet",
    },
    browse: { areas: [], common: [], total: 0 },
    symptoms: { problems: [] },
    partsList: { items: [] },
    savedSearches: { items: [] },
    supplierSync: { status: "idle" },
  };
}

export async function mockFleetCoreRoute(url: string, method: string, fixtures: ReturnType<typeof fleetCorePartsFixtures>) {
  const path = new URL(url).pathname;
  if (path.endsWith("/parts/my-vehicles")) return fixtures.myVehicles;
  if (path.endsWith("/parts/vehicle-options")) return fixtures.vehicleOptions;
  if (path.endsWith("/parts/term")) return fixtures.term;
  if (path.endsWith("/parts/wrong-fit-count")) return fixtures.wrongFitCount;
  if (path.endsWith("/parts/activity")) return fixtures.activity;
  if (path.endsWith("/parts/runner-online")) return fixtures.runnerOnline;
  if (path.includes("/parts/vehicle-context")) return fixtures.vehicleContext;
  if (path.endsWith("/parts/browse")) return fixtures.browse;
  if (path.endsWith("/parts/symptoms")) return fixtures.symptoms;
  if (path.endsWith("/parts/parts-list")) return fixtures.partsList;
  if (path.endsWith("/parts/saved-searches")) return fixtures.savedSearches;
  if (path.endsWith("/parts/supplier-sync") && method === "GET") return fixtures.supplierSync;
  if (path.includes("/parts/find")) return fixtures.find;
  return null;
}
