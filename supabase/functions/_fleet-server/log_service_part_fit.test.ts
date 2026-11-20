/**
 * deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_fleet-server/log_service_part_fit.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("validateLinePartFitOnSave skips unchanged partId", async () => {
  const { validateLinePartFitOnSave, loadExistingLineParts } = await import("./log_service_part_fit.ts");
  const partId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const lineId = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const existing = new Map([[lineId, { part_id: partId, component_name: "Oxygen sensor" }]]);
  const sb = {} as never;
  const c = {
    req: { header: () => null },
    get: () => undefined,
  } as never;
  const r = await validateLinePartFitOnSave(
    c,
    sb,
    "org",
    "veh",
    [{ id: lineId, partId }],
    existing,
  );
  assertEquals(r.ok, true);
  assertEquals(typeof loadExistingLineParts, "function");
});
Deno.test("linesNeedingPartFit: new or changed parts on done lines only; not-done-yet lines skipped (code review #5)", async () => {
  const { linesNeedingPartFit } = await import("./log_service_part_fit.ts");
  const p1 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
  const p2 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";
  const existing = new Map([["line-1", { part_id: p1, component_name: "Oxygen sensor" }]]);
  const out = linesNeedingPartFit(
    [
      { id: "line-1", partId: p1 }, // unchanged
      { id: "line-2", partId: p2, componentName: "Brake pads" }, // new part
      { partId: p2, recommended: true, componentName: "Found later" }, // not done yet: never stored
      { componentName: "No part" },
      null,
    ],
    existing,
  );
  assertEquals(out, [{ partId: p2, componentId: null, jobName: "Brake pads" }]);
});

/** A fake client: the car's listing check says "not listed"; part_master says which job each part belongs to. */
function fitClient(partJob: Record<string, string>) {
  const q = (table: string) => {
    const state: { ids?: string[]; id?: string } = {};
    const api = {
      select: () => api,
      eq: (_c: string, v: string) => ((state.id = v), api),
      in: (_c: string, v: string[]) => ((state.ids = v), api),
      maybeSingle: () => Promise.resolve({ data: table === "part_master" ? { interchange_group_id: "g1" } : null, error: null }),
      then: (res: (v: unknown) => unknown) => {
        if (table === "part_listing") return Promise.resolve({ data: [], error: null }).then(res);
        const rows = (state.ids ?? []).map((id) => ({ id, maintenance_component_id: partJob[id] ?? null }));
        return Promise.resolve({ data: rows, error: null }).then(res);
      },
    };
    return api;
  };
  return { from: q } as never;
}

Deno.test("LC-21 firstRefusedLine: a same-job part not listed for the car saves; another job's part is refused", async () => {
  const { firstRefusedLine } = await import("./log_service_part_fit.ts");
  const battery = "34615e73-cac1-4b77-b807-fb07e305ee6f";
  const interstate = "aaaaaaaa-bbbb-4ccc-8ddd-000000000011";
  const pads = "aaaaaaaa-bbbb-4ccc-8ddd-000000000012";
  const jobOf = new Map([[interstate, battery], [pads, "cccccccc-bbbb-4ccc-8ddd-000000000099"]]);
  const bad = new Set([interstate, pads]);
  const line = (partId: string) => ({ partId, componentId: battery, jobName: "Battery" });
  assertEquals(firstRefusedLine([line(interstate)], bad, jobOf), null);
  assertEquals(firstRefusedLine([line(interstate), line(pads)], bad, jobOf)?.partId, pads);
  // No job on the line: never let through.
  assertEquals(firstRefusedLine([{ partId: interstate, componentId: null, jobName: "Battery" }], bad, jobOf)?.partId, interstate);
  // Listed for the car: never refused.
  assertEquals(firstRefusedLine([line(pads)], new Set(), jobOf), null);
});

Deno.test("LC-21 partComponentIds: part → its job", async () => {
  const { partComponentIds } = await import("./log_service_part_fit.ts");
  const interstate = "aaaaaaaa-bbbb-4ccc-8ddd-000000000011";
  const sb = fitClient({ [interstate]: "34615e73-cac1-4b77-b807-fb07e305ee6f" });
  const m = await partComponentIds(sb, [interstate, "not-a-uuid"]);
  assertEquals(m.get(interstate), "34615e73-cac1-4b77-b807-fb07e305ee6f");
  assertEquals(m.size, 1);
});

Deno.test("partFitsVerifiedCar: a car with no catalogue link is not checked; same rule for saves and Plan it (code review #4)", async () => {
  const { partFitsVerifiedCar } = await import("./log_service_part_fit.ts");
  assertEquals(await partFitsVerifiedCar({} as never, null, "aaaaaaaa-bbbb-4ccc-8ddd-000000000001"), true);
});
