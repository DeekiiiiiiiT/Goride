import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mapServiceItemsDbError,
  tidySupplyName,
  validateActiveLinkOrder,
  validateJobItemNeed,
  validateJobItemNote,
  validateQtyHint,
  validateSupplyDescription,
  validateSupplyIconKey,
} from "./maintenance_jobs_admin_helpers.ts";

Deno.test("tidySupplyName collapses whitespace", () => {
  const r = tidySupplyName("  Brake   cleaner ");
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.name, "Brake cleaner");
});

Deno.test("tidySupplyName rejects blank and long names", () => {
  assertEquals(tidySupplyName("   ").ok, false);
  assertEquals(tidySupplyName("x".repeat(121)).ok, false);
});

Deno.test("validateSupplyDescription requires text", () => {
  assertEquals(validateSupplyDescription("  ").ok, false);
  assertEquals(validateSupplyDescription("Aerosol cleaner").ok, true);
});

Deno.test("validateSupplyIconKey allows wrench only from set", () => {
  assertEquals(validateSupplyIconKey("wrench").ok, true);
  assertEquals(validateSupplyIconKey("not-real").ok, false);
});

Deno.test("validateQtyHint rules", () => {
  assertEquals(validateQtyHint(0).ok, false);
  assertEquals(validateQtyHint(1.2345).ok, false);
  assertEquals(validateQtyHint(1.5).ok, true);
  assertEquals(validateQtyHint(null).ok, true);
});

Deno.test("validateJobItemNeed", () => {
  assertEquals(validateJobItemNeed("usually").ok, true);
  assertEquals(validateJobItemNeed("nope").ok, false);
});

Deno.test("validateJobItemNote", () => {
  const nul = validateJobItemNote(null);
  assertEquals(nul.ok, true);
  if (nul.ok) assertEquals(nul.note, null);
  const blank = validateJobItemNote("  ");
  assertEquals(blank.ok, true);
  if (blank.ok) assertEquals(blank.note, null);
  const ok300 = validateJobItemNote("x".repeat(300));
  assertEquals(ok300.ok, true);
  if (ok300.ok) assertEquals(ok300.note?.length, 300);
  assertEquals(validateJobItemNote("x".repeat(301)).ok, false);
});

Deno.test("mapServiceItemsDbError supply unique violation", () => {
  const r = mapServiceItemsDbError("x", "supply", { uniqueViolation: true });
  assertEquals(r?.status, 409);
  assertEquals(r?.error, "Another active supply uses this name. Rename one of them first.");
});

Deno.test("mapServiceItemsDbError table", () => {
  assertEquals(
    mapServiceItemsDbError("supply_name_taken", "supply")?.error,
    "Another active supply uses this name. Rename one of them first.",
  );
  assertEquals(
    mapServiceItemsDbError("job_item_also_do_clash", "job_item")?.status,
    409,
  );
  assertEquals(
    mapServiceItemsDbError("job_item_also_do_clash", "job_relation")?.error,
    "This part is already in May need for this job.",
  );
  assertEquals(mapServiceItemsDbError("job_item_identity_locked", "job_item")?.status, 409);
  assertEquals(
    mapServiceItemsDbError("x", "job_item", { uniqueViolation: true })?.error,
    "This item is already listed for this job.",
  );
});

Deno.test("validateActiveLinkOrder exact set", () => {
  const ids = ["a1111111-1111-4111-8111-111111111101", "b2222222-2222-4222-8222-222222222202"];
  assertEquals(validateActiveLinkOrder(ids, ids), null);
  assertEquals(validateActiveLinkOrder(ids.slice().reverse(), ids), null);
  assertEquals(validateActiveLinkOrder([ids[0]], ids), "The list changed. Reload and try again.");
});
