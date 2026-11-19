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
  assertEquals(out, [{ partId: p2, jobName: "Brake pads" }]);
});

Deno.test("partFitsVerifiedCar: a car with no catalogue link is not checked; same rule for saves and Plan it (code review #4)", async () => {
  const { partFitsVerifiedCar } = await import("./log_service_part_fit.ts");
  assertEquals(await partFitsVerifiedCar({} as never, null, "aaaaaaaa-bbbb-4ccc-8ddd-000000000001"), true);
});
