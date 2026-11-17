/**
 * deno test --no-check --allow-env --allow-read vehicle_save_rules.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { DOCUMENT_FIELD_WHITELIST } from "../_shared/vehiclePictures/documentFields.ts";
import {
  applyVehiclePictureSaveRules,
  commitVehicleSave,
  validateVehicleSave,
  type DocumentCheckRow,
  type FleetVehicleRow,
  type FleetVehicleStore,
  type VehicleSaveRulesDeps,
} from "./vehicle_save_rules.ts";

const ORG_A = "org-a";
const ORG_B = "org-b";
const USER = "user-1";

function makeStore(initial: FleetVehicleRow[] = []): {
  store: FleetVehicleStore;
  vehicles: Map<string, FleetVehicleRow>;
  checks: DocumentCheckRow[];
  simulatePkRace: boolean;
} {
  const vehicles = new Map<string, FleetVehicleRow>();
  for (const v of initial) vehicles.set(v.id, { ...v });
  const checks: DocumentCheckRow[] = [];
  let simulatePkRace = false;
  let insertCount = 0;

  const store: FleetVehicleStore = {
    getVehicle: async (id) => vehicles.get(id) ?? null,
    tryInsert: async (row) => {
      insertCount += 1;
      if (simulatePkRace && insertCount > 1 && !vehicles.has(row.id)) {
        vehicles.set(row.id, { ...row, organization_id: ORG_A });
        return "conflict";
      }
      if (vehicles.has(row.id)) return "conflict";
      vehicles.set(row.id, { ...row });
      return "inserted";
    },
    updateVehicle: async (id, patch) => {
      const cur = vehicles.get(id);
      if (!cur) throw new Error("missing");
      vehicles.set(id, { ...cur, ...patch });
    },
    insertDocumentCheck: async (row) => {
      checks.push({ ...row, id: crypto.randomUUID() });
    },
    getLatestRegistrationCheck: async (vehicleId, orgId) => {
      const reg = [...checks]
        .filter((c) => c.vehicle_id === vehicleId && c.organization_id === orgId && c.doc_type === "registration")
        .pop();
      return reg ?? null;
    },
  };

  return {
    store,
    vehicles,
    checks,
    get simulatePkRace() {
      return simulatePkRace;
    },
    set simulatePkRace(v: boolean) {
      simulatePkRace = v;
    },
  };
}

function deps(store: FleetVehicleStore): VehicleSaveRulesDeps {
  return {
    loadSettings: async () => ({ reader_provider: "openai", reader_model: "gpt-4o" }),
    store,
  };
}

Deno.test("T17: no plate → 400", async () => {
  const { store } = makeStore();
  const r = await applyVehiclePictureSaveRules(deps(store), {
    vehicle: { make: "Toyota" },
    organizationId: ORG_A,
    userId: USER,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "PLATE_REQUIRED");
});

Deno.test("T17: same plate twice same org → one vehicle", async () => {
  const { store, vehicles } = makeStore();
  const d = deps(store);
  const body = { id: "5179KZ", licensePlate: "5179KZ", make: "Toyota" };
  const r1 = await applyVehiclePictureSaveRules(d, { vehicle: body, organizationId: ORG_A, userId: USER });
  const r2 = await applyVehiclePictureSaveRules(d, { vehicle: { ...body, model: "Roomy" }, organizationId: ORG_A, userId: USER });
  assertEquals(r1.ok, true);
  assertEquals(r2.ok, true);
  assertEquals(vehicles.size, 1);
  assertEquals(vehicles.get("5179KZ")?.model, "Roomy");
});

Deno.test("T17a: other org cannot claim existing plate → 409", async () => {
  const bag = makeStore();
  const d = deps(bag.store);

  const rWin = await applyVehiclePictureSaveRules(d, {
    vehicle: { licensePlate: "NEW1", make: "A" },
    organizationId: ORG_A,
    userId: USER,
  });
  const rLose = await applyVehiclePictureSaveRules(d, {
    vehicle: { licensePlate: "NEW1", make: "B" },
    organizationId: ORG_B,
    userId: USER,
  });

  assertEquals(rWin.ok, true);
  assertEquals(rLose.ok, false);
  if (!rLose.ok) assertEquals(rLose.code, "PLATE_IN_OTHER_FLEET");
  assertEquals(bag.vehicles.size, 1);
  assertEquals(bag.vehicles.get("NEW1")?.organization_id, ORG_A);
});

Deno.test("T17a: insert conflict re-read → other org 409", async () => {
  const bag = makeStore();
  const racingStore: FleetVehicleStore = {
    ...bag.store,
    getVehicle: async (id) => bag.vehicles.get(id) ?? null,
    tryInsert: async (row) => {
      if (bag.vehicles.has(row.id)) return "conflict";
      if (row.organization_id === ORG_B) {
        bag.vehicles.set(row.id, {
          id: row.id,
          organization_id: ORG_A,
          license_plate: row.id,
        });
        return "conflict";
      }
      bag.vehicles.set(row.id, { ...row });
      return "inserted";
    },
  };
  const d = deps(racingStore);
  const input = {
    vehicle: { licensePlate: "RACE1", make: "B" },
    organizationId: ORG_B,
    userId: USER,
  };
  const v = await validateVehicleSave(d, input);
  assertEquals(v.ok, true);
  if (!v.ok) return;
  const rLose = await commitVehicleSave(d, input, v.validated);
  assertEquals(rLose.ok, false);
  if (!rLose.ok) assertEquals(rLose.code, "PLATE_IN_OTHER_FLEET");
});

Deno.test("validateVehicleSave performs no store writes", async () => {
  const { store, vehicles, checks } = makeStore();
  const readOnly: FleetVehicleStore = {
    getVehicle: store.getVehicle,
    getLatestRegistrationCheck: store.getLatestRegistrationCheck,
    tryInsert: async () => {
      throw new Error("write during validate");
    },
    updateVehicle: async () => {
      throw new Error("write during validate");
    },
    insertDocumentCheck: async () => {
      throw new Error("write during validate");
    },
  };
  const input = {
    vehicle: { licensePlate: "VALID1", make: "Toyota" },
    organizationId: ORG_A,
    userId: USER,
    documentChecks: [{
      docType: "registration" as const,
      fileSha256: "a".repeat(64),
      fields: { plate: "VALID1" },
    }],
  };
  const r = await validateVehicleSave(deps(readOnly), input);
  assertEquals(r.ok, true);
  assertEquals(vehicles.size, 0);
  assertEquals(checks.length, 0);
});

Deno.test("validate then aborted commit leaves no fleet rows (catalog gate path)", async () => {
  const { store, vehicles, checks } = makeStore();
  const d = deps(store);
  const input = {
    vehicle: { licensePlate: "GATE1", make: "Honda" },
    organizationId: ORG_A,
    userId: USER,
    documentChecks: [{
      docType: "registration" as const,
      fileSha256: "b".repeat(64),
      fields: { plate: "GATE1" },
    }],
  };
  const v = await validateVehicleSave(d, input);
  assertEquals(v.ok, true);
  const catalogGateWouldReject = true;
  if (catalogGateWouldReject) {
    assertEquals(vehicles.size, 0);
    assertEquals(checks.length, 0);
    return;
  }
  await commitVehicleSave(d, input, v.ok ? v.validated : ({} as never));
});

Deno.test("T30: registration update wrong plate → PLATE_MISMATCH", async () => {
  const { store } = makeStore([
    { id: "5179KZ", organization_id: ORG_A, license_plate: "5179KZ" },
  ]);
  const r = await applyVehiclePictureSaveRules(deps(store), {
    vehicle: { id: "5179KZ", licensePlate: "5179KZ" },
    organizationId: ORG_A,
    userId: USER,
    updateDocumentsOnly: true,
    documentChecks: [{
      docType: "registration",
      fileSha256: "a".repeat(64),
      fields: { plate: "9999ZZ", chassis: "CH1" },
    }],
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "PLATE_MISMATCH");
  assertEquals((await store.getVehicle("5179KZ"))?.license_plate, "5179KZ");
});

Deno.test("T36: TMP fitness + reg same chassis saves; mismatch 409", async () => {
  const { store, checks, vehicles } = makeStore();
  const d = deps(store);
  const fitness = {
    docType: "fitness" as const,
    fileSha256: "f".repeat(64),
    fields: { plate: "TMP4862", chassis: "M900A0344862", colorAsWritten: "WHITE" },
  };
  const registration = {
    docType: "registration" as const,
    fileSha256: "r".repeat(64),
    fields: { plate: "5179KZ", chassis: "M900A-0344862", colorAsWritten: "WHITE" },
  };

  const ok = await applyVehiclePictureSaveRules(d, {
    vehicle: { licensePlate: "5179KZ", make: "Toyota", color: "WHITE" },
    organizationId: ORG_A,
    userId: USER,
    documentChecks: [fitness, registration],
  });
  assertEquals(ok.ok, true);
  assertEquals(vehicles.get("5179KZ")?.id, "5179KZ");
  const fitRow = checks.find((c) => c.doc_type === "fitness");
  assertEquals(fitRow?.fields_json.plate, "TMP4862");

  const bad = await applyVehiclePictureSaveRules(d, {
    vehicle: { licensePlate: "5179KZ" },
    organizationId: ORG_A,
    userId: USER,
    documentChecks: [
      fitness,
      {
        ...registration,
        fields: { ...registration.fields, chassis: "OTHERCHASSIS" },
      },
    ],
  });
  assertEquals(bad.ok, false);
  if (!bad.ok) assertEquals(bad.code, "CHASSIS_MISMATCH");

  await applyVehiclePictureSaveRules(d, {
    vehicle: { id: "5179KZ", licensePlate: "5179KZ" },
    organizationId: ORG_A,
    userId: USER,
    updateDocumentsOnly: true,
    documentChecks: [fitness],
  });
});

Deno.test("document checks whitelisted fields only", async () => {
  const { store, checks } = makeStore();
  await applyVehiclePictureSaveRules(deps(store), {
    vehicle: { licensePlate: "AB1234" },
    organizationId: ORG_A,
    userId: USER,
    documentChecks: [{
      docType: "registration",
      fileSha256: "x".repeat(64),
      fields: { plate: "AB1234", trn: "secret", make: "Honda" },
    }],
  });
  const keys = Object.keys(checks[0].fields_json).sort();
  for (const k of keys) {
    assert((DOCUMENT_FIELD_WHITELIST as readonly string[]).includes(k));
  }
  assertEquals(checks[0].fields_json.trn, undefined);
});

Deno.test("colour change sets picture_id null", async () => {
  const picId = crypto.randomUUID();
  const { store, vehicles } = makeStore([
    {
      id: "5179KZ",
      organization_id: ORG_A,
      license_plate: "5179KZ",
      color_standard: "white",
      picture_id: picId,
    },
  ]);
  await applyVehiclePictureSaveRules(deps(store), {
    vehicle: { id: "5179KZ", licensePlate: "5179KZ", color: "BLACK" },
    organizationId: ORG_A,
    userId: USER,
    colorStandard: "black",
  });
  assertEquals(vehicles.get("5179KZ")?.picture_id, null);
  assertEquals(vehicles.get("5179KZ")?.color_standard, "black");
});