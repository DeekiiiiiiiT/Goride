import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleDriverCash,
  handleFleetImport,
  handleMatcherSweep,
  isUserJwt,
  validateDriverCashInput,
  type DriverCashBody,
  type ImportDeps,
} from "./toll_v2_import_controller.ts";
function baseDeps(overrides: Partial<ImportDeps> = {}): ImportDeps {
  return {
    checkEnabled: async () => true,
    getOrg: () => "org-a",
    runImport: async () => ({ data: { ok: true }, error: null }),
    runMatcher: async () => ({ ok: true, rounds: 1 }),
    buildLookups: async () => ({
      tagToVehicle: {},
      vehicleToDriver: {},
      plazaIdByName: {},
    }),
    readFleetFile: async () => ({
      kind: "tag_statement",
      commandId: "cmd-1",
      fileName: "t.csv",
      texts: { file: "plaza name,tag id\n" },
    }),
    sysImport: async () => ({ data: null, error: null }),
    ...overrides,
  };
}

Deno.test("fleet import: switch off → 409, no import", async () => {
  let called = false;
  const r = await handleFleetImport(baseDeps({
    checkEnabled: async () => false,
    runImport: async () => {
      called = true;
      return { data: null, error: null };
    },
  }));
  assertEquals(r.status, 409);
  assertEquals(r.body.code, "TOLLS_V2_OFF");
  assertEquals(called, false);
});

Deno.test("driver cash: switch off → 409", async () => {
  const r = await handleDriverCash({
    ...baseDeps({ checkEnabled: async () => false }),
    getUserId: () => "user-1",
    getVehicleId: async () => "vehicle-1",
    resolvePlaza: async () => "plaza-1",
    body: { submission_id: "sub-1", receipt_url: "https://x/r.jpg", occurred_at: "2024-01-01T12:00:00-05:00", amount_minor: 100 },
  });
  assertEquals(r.status, 409);
  assertEquals(r.body.code, "TOLLS_V2_OFF");
});

Deno.test("company from token: body org ignored in import RPC args", async () => {
  const bodies: Record<string, unknown>[] = [];
  let matcherOrg = "";
  const tagCsv = [
    "plaza name,tag id,plaza lane id,date & time,amount",
    "Main Toll Plaza,1234,1,15/03/2024 10:30,370",
    "Main Toll Plaza,1234,1,15/03/2024 11:00,-500",
  ].join("\n");
  const r = await handleFleetImport(baseDeps({
    readFleetFile: async () => ({
      kind: "tag_statement",
      commandId: "cmd-co",
      fileName: "t.csv",
      texts: { file: tagCsv, organization_id: "evil-org", company: "evil-org" },
    }),
    buildLookups: async () => ({
      tagToVehicle: { "1234": "vehicle-a" },
      vehicleToDriver: { "vehicle-a": "driver-a" },
      plazaIdByName: { "Main Toll Plaza": "plaza-main" },
    }),
    runImport: async (body) => {
      bodies.push(body);
      return { data: { report: [] }, error: null };
    },
    runMatcher: async (org) => {
      matcherOrg = org;
      return { ok: true, rounds: 1 };
    },
    getOrg: () => "org-from-token",
  }));
  assertEquals(r.status, 200);
  assertEquals(matcherOrg, "org-from-token");
  assertEquals(bodies.length > 0, true);
  assertEquals(bodies.every((b) => b.organization_id === undefined && b.company === undefined), true);
});

Deno.test("tag statement with topups: second import command_id:topups", async () => {
  const imports: Record<string, unknown>[] = [];
  const csv = [
    "plaza name,tag id,plaza lane id,date & time,amount",
    "Main Toll Plaza,1234,1,15/03/2024 10:30,370",
    "Main Toll Plaza,1234,1,15/03/2024 11:00,-500",
  ].join("\n");
  await handleFleetImport(baseDeps({
    readFleetFile: async () => ({
      kind: "tag_statement",
      commandId: "cmd-tp",
      fileName: "mix.csv",
      texts: { file: csv },
    }),
    buildLookups: async () => ({
      tagToVehicle: { "1234": "vehicle-a" },
      vehicleToDriver: { "vehicle-a": "driver-a" },
      plazaIdByName: { "Main Toll Plaza": "plaza-main" },
    }),
    runImport: async (body) => {
      imports.push(body);
      return { data: body, error: null };
    },
  }));
  assertEquals(imports.length, 2);
  assertEquals(imports[0].kind, "tag_statement");
  assertEquals(imports[1].kind, "topups");
  assertEquals(imports[1].command_id, "cmd-tp:topups");
});

Deno.test("reader problems returned, not sent when no valid rows", async () => {
  let importCalls = 0;
  const r = await handleFleetImport(baseDeps({
    readFleetFile: async () => ({
      kind: "tag_statement",
      commandId: "cmd-pr",
      fileName: "bad.csv",
      texts: { file: "not,a,valid,file\n" },
    }),
    runImport: async () => {
      importCalls++;
      return { data: {}, error: null };
    },
  }));
  assertEquals(r.status, 200);
  assertEquals(importCalls, 0);
  assertEquals(Array.isArray(r.body.problems), true);
  assertEquals((r.body.problems as unknown[]).length > 0, true);
});

Deno.test("matcher throws: still 200 with matcher.ok false", async () => {
  const r = await handleFleetImport(baseDeps({
    readFleetFile: async () => ({
      kind: "topups",
      commandId: "cmd-m",
      fileName: "t.csv",
      texts: { file: "" },
    }),
    runMatcher: async () => ({ ok: false }),
  }));
  assertEquals(r.status, 200);
  assertEquals((r.body.matcher as { ok: boolean }).ok, false);
});

Deno.test("driver cash validations and import", async () => {
  const noReceipt = await handleDriverCash({
    ...baseDeps(),
    getUserId: () => "u1",
    getVehicleId: async () => "v1",
    resolvePlaza: async () => "p1",
    body: { submission_id: "s1", occurred_at: "2024-01-01T12:00:00-05:00", amount_minor: 100 } as DriverCashBody,
  });
  assertEquals(noReceipt.body.code, "RECEIPT_REQUIRED");

  const noVehicle = await handleDriverCash({
    ...baseDeps(),
    getUserId: () => "u1",
    getVehicleId: async () => null,
    resolvePlaza: async () => "p1",
    body: { submission_id: "s1", receipt_url: "https://x/r.jpg", occurred_at: "2024-01-01T12:00:00-05:00", amount_minor: 100 },
  });
  assertEquals(noVehicle.body.code, "NO_VEHICLE");

  let sysArgs: Record<string, unknown> = {};
  const ok = await handleDriverCash({
    ...baseDeps({
      sysImport: async (company, kind, rows, commandId, actorJob) => {
        sysArgs = { company, kind, rows, commandId, actorJob };
        return {
          data: { report: [{ id: "charge-1", status: "new" }], replay: false },
          error: null,
        };
      },
    }),
    getUserId: () => "driver-token-id",
    getVehicleId: async () => "vehicle-a",
    resolvePlaza: async () => "unknown",
    resolveDriverId: async () => "canonical-driver",
    body: {
      submission_id: "sub-stable",
      receipt_url: "https://x/r.jpg",
      occurred_at: "2024-01-01T12:00:00-05:00",
      amount_minor: 37000,
      plaza_name: "Unknown Plaza",
      driver_id: "ignored-driver",
      organization_id: "ignored-org",
    },
  });
  assertEquals(ok.status, 200);
  assertEquals(sysArgs?.commandId, "sub-stable");
  assertEquals(sysArgs?.actorJob, "driver_app");
  assertEquals(sysArgs?.company, "org-a");
});

Deno.test("sweep helper runs rpc", async () => {
  const calls: string[] = [];
  const reports = await handleMatcherSweep(async (fn) => {
    calls.push(fn);
    if (fn === "toll_sys_match_pending") return { data: [], error: null };
    return { data: { claim_id: null }, error: null };
  });
  assertEquals(calls[0], "toll_sys_match_pending");
  assertEquals(reports.length, 0);
});

Deno.test("isUserJwt detects authenticated role", () => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ role: "authenticated" }));
  assertEquals(isUserJwt(`Bearer ${header}.${payload}.sig`), true);
  assertEquals(isUserJwt("Bearer not-a-jwt"), false);
});

Deno.test("driver cash: switch off uses token company only", async () => {
  const r = await handleDriverCash({
    ...baseDeps({
      checkEnabled: async () => false,
      getOrg: () => "token-org-only",
    }),
    getUserId: () => "u1",
    getVehicleId: async () => "v1",
    resolvePlaza: async () => "p1",
    body: {
      submission_id: "s1",
      receipt_url: "https://x/r.jpg",
      occurred_at: "2024-01-01T12:00:00-05:00",
      amount_minor: 100,
    },
  });
  assertEquals(r.status, 409);
  assertEquals(r.body.code, "TOLLS_V2_OFF");
});

Deno.test("driver cash: checkEnabled wired to getOrg company", async () => {
  let enabledFor: string | null = null;
  await handleDriverCash({
    ...baseDeps({
      checkEnabled: async () => {
        enabledFor = "checked";
        return true;
      },
      getOrg: () => "org-from-token",
      sysImport: async (company) => {
        enabledFor = company;
        return { data: { report: [{ id: "c1" }], replay: false }, error: null };
      },
    }),
    getUserId: () => "u1",
    getVehicleId: async () => "v1",
    resolvePlaza: async () => "p1",
    resolveDriverId: async () => "d1",
    body: {
      submission_id: "s2",
      receipt_url: "https://x/r.jpg",
      occurred_at: "2024-01-01T12:00:00-05:00",
      amount_minor: 100,
    },
  });
  assertEquals(enabledFor, "org-from-token");
});

Deno.test("driver cash: no driver record → DRIVER_NOT_FOUND", async () => {
  const r = await handleDriverCash({
    ...baseDeps(),
    getUserId: () => "u1",
    getVehicleId: async () => "v1",
    resolvePlaza: async () => "p1",
    resolveDriverId: async () => null,
    body: {
      submission_id: "s1",
      receipt_url: "https://x/r.jpg",
      occurred_at: "2024-01-01T12:00:00-05:00",
      amount_minor: 100,
    },
  });
  assertEquals(r.status, 400);
  assertEquals(r.body.code, "DRIVER_NOT_FOUND");
});

Deno.test("driver cash: validate occurred_at and amount_minor", async () => {
  const baseBody = {
    submission_id: "s1",
    receipt_url: "https://x/r.jpg",
  } as DriverCashBody;

  const missingAt = await handleDriverCash({
    ...baseDeps(),
    getUserId: () => "u1",
    getVehicleId: async () => "v1",
    resolvePlaza: async () => "p1",
    resolveDriverId: async () => "d1",
    body: { ...baseBody, amount_minor: 100 },
  });
  assertEquals(missingAt.status, 400);
  assertEquals((missingAt.body.current_state as { field?: string }).field, "occurred_at");

  const badAt = await handleDriverCash({
    ...baseDeps(),
    getUserId: () => "u1",
    getVehicleId: async () => "v1",
    resolvePlaza: async () => "p1",
    resolveDriverId: async () => "d1",
    body: { ...baseBody, occurred_at: "2024-01-01T12:00:00", amount_minor: 100 },
  });
  assertEquals(badAt.status, 400);
  assertEquals((badAt.body.current_state as { field?: string }).field, "occurred_at");

  for (const amt of [0, -5, 12.5]) {
    const v = validateDriverCashInput({
      occurred_at: "2024-01-01T12:00:00-05:00",
      amount_minor: amt,
    });
    assertEquals(v.ok, false);
    if (!v.ok) assertEquals(v.field, "amount_minor");
  }
});
