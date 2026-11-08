import type { Page } from "@playwright/test";

const BRAKE_TYPE = {
  id: "a9000003-0000-4000-8000-000000000002",
  opCode: "BRK-PADS",
  name: "Brake pads",
  tradeTerm: "brake pad set",
  editorHint: "Front or rear.",
  defaultFitMode: "specific",
  positionScheme: "axle",
  status: "active",
  iconKey: "disc_full",
  areaId: "b1000000-0000-4000-8000-000000000004",
  specFields: [],
};

const OIL_TYPE = {
  id: "a9000003-0000-4000-8000-000000000003",
  opCode: "ENG-OIL",
  name: "Oil filter",
  tradeTerm: "oil filter",
  editorHint: "Fits every car with this engine code.",
  defaultFitMode: "engine",
  positionScheme: "none",
  status: "active",
  iconKey: "filter_alt",
  areaId: "b1000000-0000-4000-8000-000000000001",
  specFields: [],
};

const WIPER_TYPE = {
  id: "a9000003-0000-4000-8000-000000000004",
  opCode: "LGT-WIPER",
  name: "Wiper blades",
  tradeTerm: "wiper mm",
  editorHint: "Blade length in mm.",
  defaultFitMode: "spec",
  positionScheme: "driver_passenger_rear",
  status: "active",
  iconKey: "straighten",
  areaId: "b1000000-0000-4000-8000-000000000007",
  specFields: [{ specKey: "wiper_driver_mm", label: "Length", unit: "mm", dataType: "number", required: true }],
};

const SHOCK_TYPE = {
  id: "a9000003-0000-4000-8000-000000000020",
  opCode: "SUS-SHOCK",
  name: "Shock absorber",
  tradeTerm: "shock",
  editorHint: "Pick every corner the page lists.",
  defaultFitMode: "specific",
  positionScheme: "four_corners",
  status: "active",
  iconKey: "suspension",
  areaId: "b1000000-0000-4000-8000-000000000008",
  specFields: [],
};

const HANDBRAKE_CABLE_TYPE = {
  id: "a9000003-0000-4000-8000-000000000030",
  opCode: "BRK-HBCABLE",
  name: "Handbrake cable",
  tradeTerm: "handbrake cable",
  editorHint: "Front or rear; catalogue No.1–No.3 when the diagram numbers them.",
  defaultFitMode: "specific",
  positionScheme: "axle_numbered",
  status: "active",
  iconKey: "cable",
  areaId: "b1000000-0000-4000-8000-000000000004",
  specFields: [],
};

const EXTRA_TYPES = [
  { opCode: "BRK-SHOES", name: "Brake shoes", defaultFitMode: "specific", positionScheme: "axle", tradeTerm: "shoes", editorHint: "", status: "active", iconKey: "disc_full", specFields: [] },
  { opCode: "ENG-SPARK", name: "Spark plugs", defaultFitMode: "engine", positionScheme: "none", tradeTerm: "spark", editorHint: "", status: "active", iconKey: "bolt", specFields: [] },
  { opCode: "FILT-AIR", name: "Air filter", defaultFitMode: "specific", positionScheme: "none", tradeTerm: "air", editorHint: "", status: "active", iconKey: "filter_alt", specFields: [] },
];

function typeRow(t: typeof EXTRA_TYPES[0], idx: number) {
  return {
    id: `a9000003-0000-4000-8000-${String(idx).padStart(12, "0")}`,
    ...t,
    areaId: null,
  };
}

export const MOCK_PART_TYPES = [
  BRAKE_TYPE,
  HANDBRAKE_CABLE_TYPE,
  OIL_TYPE,
  WIPER_TYPE,
  SHOCK_TYPE,
  ...EXTRA_TYPES.map((t, i) => typeRow(t, 10 + i)),
];

const ENGINE_ID = "00000000-0000-4000-8000-000000000099";
const PLATFORM_SISTER = "p-m900-sister";
const MOCK_VEHICLES = [
  { id: "ap900005-0000-4000-8000-000000000001", make: "Toyota", model: "Roomy", chassis_code: "M900A", production_start_year: 2020, production_end_year: null, engine_code: "1KR-VET", version_name: "Custom G-T", platform_id: PLATFORM_SISTER, drivetrain: "2WD" },
  { id: "ap900005-0000-4000-8000-000000000002", make: "Toyota", model: "Roomy", chassis_code: "M900A", production_start_year: 2016, production_end_year: 2020, engine_code: "1KR-FE", version_name: "Custom G", platform_id: PLATFORM_SISTER, drivetrain: "2WD" },
  { id: "ap900005-0000-4000-8000-000000000003", make: "Toyota", model: "Tank", chassis_code: "M900A", production_start_year: 2016, production_end_year: 2020, engine_code: "1KR-FE", version_name: "Custom G", platform_id: PLATFORM_SISTER, drivetrain: "2WD" },
  { id: "ap900005-0000-4000-8000-000000000004", make: "Daihatsu", model: "Thor", chassis_code: "M900S", production_start_year: 2016, production_end_year: 2020, engine_code: "1KR-FE", version_name: "G SA III", platform_id: PLATFORM_SISTER, drivetrain: "2WD" },
  { id: "ap900005-0000-4000-8000-000000000005", make: "Subaru", model: "Justy", chassis_code: "M900F", production_start_year: 2016, production_end_year: 2020, engine_code: "1KR-FE", version_name: "G Smart Assist", platform_id: PLATFORM_SISTER, drivetrain: "2WD" },
  { id: "ap900005-0000-4000-8000-000000000006", make: "Toyota", model: "Tank", chassis_code: "M910A", production_start_year: 2016, production_end_year: 2020, engine_code: "1KR-FE", version_name: "4WD", platform_id: PLATFORM_SISTER, drivetrain: "4WD" },
  { id: "ap900005-0000-4000-8000-000000000007", make: "Toyota", model: "Roomy", chassis_code: "M910A", production_start_year: 2016, production_end_year: 2020, engine_code: "1KR-FE", version_name: "4WD", platform_id: PLATFORM_SISTER, drivetrain: "4WD" },
  { id: "ap900005-0000-4000-8000-000000000008", make: "Daihatsu", model: "Boon", chassis_code: "M700S", production_start_year: 2016, production_end_year: null, engine_code: "1KR-FE", version_name: "Standard", platform_id: PLATFORM_SISTER },
];

export type AddPartsMockState = {
  saveCalls: number;
  lastSaveBody: Record<string, unknown> | null;
  partTypeRequests: unknown[];
  extraTypes: typeof MOCK_PART_TYPES;
};

export function createAddPartsMockState(): AddPartsMockState {
  return {
    saveCalls: 0,
    lastSaveBody: null,
    partTypeRequests: [],
    extraTypes: [],
  };
}

const DEFAULT_PART_TYPE_REQUESTS = [
  { id: "req-mock-1", name: "Fog light bulb", reason: "Need for fleet Roomy units", status: "pending" },
  { id: "req-mock-2", name: "VVT Solenoid", reason: "Missing from brakes area taxonomy", status: "pending" },
];

export async function installAddPartsMocks(page: Page, state?: AddPartsMockState) {
  const st = state ?? createAddPartsMockState();
  /** Path-based match covers __sb-prefixed fleet-core URLs; plain glob for admin catalog misses those. */
  await page.route(
    (url) => url.pathname.includes("/admin/catalog/"),
    async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/part-types") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created = {
        id: `a9000003-0000-4000-8000-${String(100 + st.extraTypes.length).padStart(12, "0")}`,
        opCode: String(body.opCode ?? "NEW"),
        name: String(body.name ?? "New type"),
        tradeTerm: "",
        editorHint: "",
        defaultFitMode: String(body.defaultFitMode ?? "specific"),
        positionScheme: String(body.positionScheme ?? "axle"),
        status: "active",
        iconKey: "inventory_2",
        areaId: null,
        specFields: [],
      };
      st.extraTypes.push(created);
      return route.fulfill({ json: { id: created.id, ...body, specFieldCount: 0 } });
    }
    if (url.match(/part-types\/[^/?]+/) && method === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true, ...body } });
    }
    if (url.includes("/part-types") && !url.includes("top-brands") && !url.match(/part-types\/[^/?]+/)) {
      return route.fulfill({ json: { types: [...MOCK_PART_TYPES, ...st.extraTypes] } });
    }
    if (url.includes("top-brands")) {
      return route.fulfill({ json: { brands: [{ brand: "MK Kashiyama", count: 3 }] } });
    }
    if (url.includes("/parts/recent")) {
      return route.fulfill({
        json: {
          items: [
            {
              batchId: "44444444-4444-4444-8444-444444444441",
              batchCode: "AP-RECENT-ENG",
              brand: "Union",
              partNumber: "O-104-MOCK",
              partTypeName: "Oil filter",
              fitMode: "engine",
              fitSummary: "21 car versions",
              reachLabel: "21 car versions",
              plainWordsSentence: "Union O-104-MOCK is an oil filter. It fits 21 car version(s) with engine 1KR-FE.",
              sourceHost: "example.com",
              evidenceUrl: "https://example.com/oil-filter",
              trustLabel: "Verified · part maker's catalogue",
              vehicleHint: "Toyota Roomy, Toyota Tank",
              promotedAt: new Date(Date.now() - 86400000).toISOString(),
              undoEligible: true,
              canUndo: true,
            },
            {
              batchId: "44444444-4444-4444-8444-444444444443",
              batchCode: "AP-RECENT-SPEC",
              brand: "Example",
              partNumber: "WB-525-MOCK",
              partTypeName: "Wiper blades",
              fitMode: "spec",
              fitSummary: "3 car versions",
              reachLabel: "3 car versions",
              plainWordsSentence: "Example WB-525-MOCK is a wiper mm. It fits 3 car version(s) at 525.",
              sourceHost: "example.com",
              evidenceUrl: "https://example.com/wiper",
              trustLabel: "Verified · part maker's catalogue",
              promotedAt: new Date(Date.now() - 172800000).toISOString(),
              undoEligible: true,
              canUndo: true,
            },
          ],
        },
      });
    }
    if (url.includes("parts-overview")) {
      return route.fulfill({
        json: {
          vehicles: 100,
          partsOnFile: 50,
          fitmentsOnFile: 200,
          vehiclesWithParts: 80,
          waiting: 3,
          matchTypesOff: false,
        },
      });
    }
    if (url.includes("part-type-requests") && method === "POST") {
      const body = route.request().postDataJSON();
      st.partTypeRequests.push(body);
      return route.fulfill({ json: { ok: true, id: "req-1" } });
    }
    if (url.includes("part-type-requests")) {
      const items = [
        ...DEFAULT_PART_TYPE_REQUESTS,
        ...st.partTypeRequests.map((r, i) => ({
          id: `req-${i}`,
          name: String((r as Record<string, unknown>).name ?? "Request"),
          reason: String((r as Record<string, unknown>).reason ?? ""),
          status: "pending",
        })),
      ];
      return route.fulfill({ json: { items } });
    }
    if (url.includes("/add-part/vehicles")) {
      const u = new URL(url);
      const q = (u.searchParams.get("q") ?? "").toLowerCase();
      const chassis = (u.searchParams.get("chassis") ?? "").toLowerCase();
      let items = MOCK_VEHICLES;
      if (q || chassis) {
        const needle = q || chassis;
        items = MOCK_VEHICLES.filter((v) =>
          v.make.toLowerCase().includes(needle)
          || v.model.toLowerCase().includes(needle)
          || (v.chassis_code ?? "").toLowerCase().includes(needle),
        );
        if (!items.length && chassis) {
          items = MOCK_VEHICLES.filter((v) => (v.chassis_code ?? "").toLowerCase().includes(chassis));
        }
      }
      return route.fulfill({ json: { items } });
    }
    if (url.includes("/add-part/sister-vehicles")) {
      const sisters = MOCK_VEHICLES.filter((v) => v.model === "Thor" || v.model === "Justy");
      return route.fulfill({ json: { items: sisters } });
    }
    if (url.includes("parts/add/link-hints")) {
      return route.fulfill({
        json: {
          ok: true,
          trustedSite: true,
          catalogMaker: "Toyota",
          frameCodes: ["M900A"],
        },
      });
    }
    if (url.includes("vehicle-options")) {
      return route.fulfill({ json: { makes: ["Toyota", "Daihatsu"], models: ["Roomy", "Tank"], years: [2019, 2018] } });
    }
    if (url.includes("/parts/lookup")) {
      const u = new URL(url);
      const brand = u.searchParams.get("brand") ?? "";
      const number = u.searchParams.get("number") ?? "";
      if (brand.toLowerCase() === "dup" && number === "EXIST-1") {
        return route.fulfill({
          json: {
            found: true,
            partId: "dup-part-id",
            brand,
            number,
            listingCount: 3,
          },
        });
      }
      return route.fulfill({ json: { found: false } });
    }
    if (url.includes("/parts/add/preview")) {
      const u = new URL(url);
      const mode = u.searchParams.get("fitMode");
      const vehicleIds = (u.searchParams.get("vehicleIds") ?? "").split(",").filter(Boolean);
      const carCount = vehicleIds.length || (mode === "engine" ? 21 : mode === "spec" ? 3 : 7);
      const brand = u.searchParams.get("brand") ?? "MK Kashiyama";
      const partNumber = u.searchParams.get("partNumber") ?? "D0051MH";
      const tradeTerm = u.searchParams.get("tradeTerm") ?? "brake pad set";
      const position = u.searchParams.get("position") ?? "front";
      const typePhrase = `${position} ${tradeTerm}`;
      let oePhrase = "";
      const factoryRaw = u.searchParams.get("factoryNumbers");
      if (factoryRaw) {
        try {
          const fns = JSON.parse(factoryRaw) as Array<{ brand: string; number: string }>;
          if (fns.length) {
            oePhrase = ` and replaces ${fns.map((f) => `${f.brand} ${f.number}`).join(" and ")}`;
          }
        } catch { /* ignore */ }
      }
      const sentence = `${brand} ${partNumber} is a ${typePhrase}. It fits ${carCount || 2} cars${oePhrase}.`;
      let listingTrustPreview: Array<{ catalogId: string; trust: string; trustReason?: string | null }> | undefined;
      const listingsRaw = u.searchParams.get("listings");
      if (mode === "specific" && listingsRaw) {
        try {
          const listings = JSON.parse(listingsRaw) as Array<{ vehicleId?: string }>;
          listingTrustPreview = (listings ?? [])
            .map((l) => l.vehicleId)
            .filter(Boolean)
            .map((id) => ({ catalogId: id as string, trust: "confirmed", trustReason: null }));
        } catch {
          listingTrustPreview = undefined;
        }
      }
      return route.fulfill({
        json: {
          carCount: carCount || 2,
          oeExtraCarCount: factoryRaw ? 3 : 0,
          totalReach: carCount || 2,
          sentence,
          trustLabel: "Verified · part maker's catalogue",
          ...(listingTrustPreview ? { listingTrustPreview } : {}),
          fitSummaryLines: MOCK_VEHICLES.slice(0, carCount || 2).map((v) => `${v.make} ${v.model} ${v.chassis_code}`),
          fitSummaryStructured: {
            positionLabel: "Front Axle",
            modelYearsLabel: "2016–present",
            vehicleSummary: "Includes Toyota Roomy, Tank",
          },
          oePreviewCars: factoryRaw
            ? [{ label: "Toyota Passo M700A", years: "(2016–present)", engine: "1KR-FE", position: "Front" }]
            : [],
        },
      });
    }
    if (url.includes("/parts/add") && method === "POST") {
      st.saveCalls++;
      st.lastSaveBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        json: {
          batchId: "44444444-4444-4444-8444-444444444442",
          batchCode: "AP-MOCK01",
          partId: "55555555-5555-4555-8555-555555555551",
          groupId: "66666666-6666-4666-8666-666666666661",
          catalogDecision: st.lastSaveBody?.sourceType === "other" ? "pending" : "confirmed",
          trustLabel: st.lastSaveBody?.sourceType === "other"
            ? "Needs checking · other source"
            : "Verified · part maker's catalogue",
          preview: { carCount: 8, totalReach: 8 },
          brand: String(st.lastSaveBody?.brand ?? "MK Kashiyama"),
          partNumber: String(st.lastSaveBody?.partNumber ?? "D0051MH"),
          categoryLabel: "Front brake pads",
          directVehicleCount: 7,
          autoLinkedCount: 1,
          chassisList: ["Toyota Roomy M900A"],
        },
      });
    }
    if (url.includes("/parts/undo") && method === "POST") {
      return route.fulfill({ json: { ok: true } });
    }
    if (url.includes("engine-families/") && !url.endsWith("engine-families")) {
      return route.fulfill({
        json: {
          id: ENGINE_ID,
          code: "1KR-FE",
          variantCount: 22,
          makeCounts: [{ make: "Toyota", count: 20 }],
          vehicles: MOCK_VEHICLES.map((v) => ({
            id: v.id,
            make: v.make,
            model: v.model,
            chassisCode: v.chassis_code,
            year: v.production_start_year,
            engineCode: v.engine_code,
          })),
        },
      });
    }
    if (url.includes("engine-families")) {
      return route.fulfill({
        json: {
          items: [{
            id: ENGINE_ID,
            code: "1KR-FE",
            variantCount: 22,
            displacement: "1.0L",
            cylinders: 3,
          }],
        },
      });
    }
    if (url.includes("spec-keys")) {
      return route.fulfill({ json: { items: [{ key: "wiper_driver_mm", label: "Driver wiper", unit: "mm" }] } });
    }
    if (url.includes("find-parts")) {
      return route.fulfill({
        json: {
          mode: "tiered",
          car: { make: "Toyota", model: "Roomy", year: 2018 },
          candidates: [],
          sections: [],
          plainSections: [],
          emptyTiers: [1, 2, 3, 4, 5],
        },
      });
    }
    if (url.includes("vehicle-options")) {
      return route.fulfill({ json: { makes: ["Toyota"], models: ["Roomy"], years: [2018] } });
    }
    if (url.includes("parts/browse")) {
      return route.fulfill({ json: { systems: [], common: [] } });
    }
    if (url.includes("master-search") || url.includes("parts/master")) {
      return route.fulfill({
        json: {
          parts: [],
          sisters: [],
          universals: [],
          counts: { oem: 0, sister: 0, engine: 0, aftermarket: 0, universal: 0 },
          total: 0,
          page: 1,
          pages: 1,
        },
      });
    }
    if (url.includes("trusted-sources/maker")) {
      if (method === "PATCH") {
        return route.fulfill({ json: { updated: 1 } });
      }
      if (method === "DELETE") {
        return route.fulfill({ json: { ok: true } });
      }
      if (method === "POST") {
        return route.fulfill({ json: { kind: "car_maker", maker: "Mock" } });
      }
    }
    if (url.includes("trusted-sources") && !url.match(/trusted-sources\/[^/]+$/)) {
      if (method === "GET") {
        const makers = [...new Set(MOCK_VEHICLES.map((v) => v.make))].sort();
        return route.fulfill({
          json: {
            carMakers: makers.map((maker) => ({
              maker,
              sites: [{
                id: `trust-site-${maker}`,
                domain: "parts.mock",
                addedBy: "Dominion Owner",
                addedAt: new Date().toISOString(),
              }],
            })),
            partMakers: [
              {
                maker: "MK Kashiyama",
                sites: [{
                  id: "trust-site-part-1",
                  domain: "mk.mock",
                  addedBy: null,
                  addedAt: new Date().toISOString(),
                }],
              },
            ],
          },
        });
      }
      if (method === "POST") {
        const body = (route.request().postDataJSON() ?? {}) as { kind?: string; maker?: string; domain?: string };
        return route.fulfill({
          json: {
            id: "new-trust-site-id",
            kind: body.kind ?? "car_maker",
            maker: body.maker ?? "Toyota",
            domain: body.domain ?? "new.mock",
            added_by: null,
            added_at: new Date().toISOString(),
          },
        });
      }
    }
    if (url.match(/trusted-sources\/[^/]+$/) && method === "DELETE") {
      return route.fulfill({
        json: {
          id: "removed",
          kind: "car_maker",
          maker: "Toyota",
          domain: "parts.mock",
        },
      });
    }
    return route.fulfill({ json: {} });
    },
  );

  // Dominion shell calls (when local Supabase is down). Playwright matches LIFO — register after catalog so catalog runs first.
  await page.route(
    (url) => url.pathname.includes("/functions/v1/") && !url.pathname.includes("/admin/catalog/"),
    async (route) => {
      const url = route.request().url();
      if (url.includes("platform-status")) {
        return route.fulfill({ json: { ok: true } });
      }
      if (url.includes("settings/preferences")) {
        return route.fulfill({ json: { darkMode: false } });
      }
      if (url.includes("platform-feature-flags")) {
        return route.fulfill({ json: {} });
      }
      if (url.includes("auto-match/health")) {
        return route.fulfill({ json: { engineVersion: 2, normVersion: 0 } });
      }
      if (url.includes("vehicle-catalog-pending-requests")) {
        return route.fulfill({ json: { items: [], total: 0 } });
      }
      return route.fulfill({ json: {} });
    },
  );

  return st;
}
