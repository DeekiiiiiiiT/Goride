import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planPlazaBackfill } from "./toll_plaza_backfill.ts";

const plazas = [
  { id: "plz-spanish", name: "Spanish Town" },
  { id: "plz-spanish-ramp", name: "Spanish Town Ramp" },
  { id: "plz-portmore", name: "Portmore" },
  { id: "plz-vineyard", name: "Vineyard" },
];

Deno.test("leaves a row that already points at a real plaza alone", () => {
  const plan = planPlazaBackfill(
    [{ id: "t1", plazaId: "plz-portmore", plaza: "PORTMORE" }],
    plazas,
  );
  assertEquals(plan.alreadyAttributed, 1);
  assertEquals(plan.toStamp.length, 0);
});

Deno.test("re-attributes a row whose plazaId points at a plaza that no longer exists", () => {
  const plan = planPlazaBackfill(
    [{ id: "t1", plazaId: "plz-deleted", plaza: "PORTMORE TOLL" }],
    plazas,
  );
  assertEquals(plan.alreadyAttributed, 0);
  assertEquals(plan.toStamp[0].plazaId, "plz-portmore");
});

Deno.test("matches statement text to a plaza name", () => {
  const plan = planPlazaBackfill(
    [{ id: "t1", plaza: "TJH VINEYARD TOLL PLAZA" }],
    plazas,
  );
  assertEquals(plan.toStamp[0].plazaId, "plz-vineyard");
});

Deno.test("prefers the more specific plaza when one name contains the other", () => {
  const plan = planPlazaBackfill(
    [{ id: "t1", plaza: "SPANISH TOWN RAMP" }],
    plazas,
  );
  assertEquals(plan.toStamp.length, 1);
  assertEquals(plan.toStamp[0].plazaId, "plz-spanish-ramp");
});

Deno.test("refuses to guess between two unrelated plazas", () => {
  const plan = planPlazaBackfill(
    [{ id: "t1", description: "PORTMORE / VINEYARD ADJUSTMENT" }],
    plazas,
  );
  assertEquals(plan.toStamp.length, 0);
  assertEquals(plan.ambiguous.length, 1);
  assertEquals(plan.ambiguous[0].candidates.sort(), ["Portmore", "Vineyard"]);
});

Deno.test("reports a row it cannot place instead of dropping it", () => {
  const plan = planPlazaBackfill([{ id: "t1", plaza: "MISC HIGHWAY FEE" }], plazas);
  assertEquals(plan.unresolved.length, 1);
  assertEquals(plan.unresolved[0].id, "t1");
});

Deno.test("does not attribute on generic words alone", () => {
  // "toll plaza" is in almost every statement line; matching on it would assign
  // the entire ledger to whichever plaza happened to be first.
  const plan = planPlazaBackfill([{ id: "t1", plaza: "TOLL PLAZA" }], plazas);
  assertEquals(plan.toStamp.length, 0);
  assertEquals(plan.unresolved.length, 1);
});
