import { assertEquals } from "jsr:@std/assert@1";
import { countingFrom, sourcePage } from "./maintenance_master_fleet_enrich.ts";

Deno.test("step 10: a car-maker rule shows the page printed in the book", () => {
  const manuals = new Map([["m1", { page_offset: 4, doc_type: "owners_manual" }], ["m2", { page_offset: 0, doc_type: "schedule" }]]);
  assertEquals(sourcePage({ manual_id: "m1", evidence_page: 529 }, manuals), { page: 525, doc: "owners_manual" });
  assertEquals(sourcePage({ manual_id: "m2", evidence_page: 5 }, manuals), { page: 5, doc: "schedule" });
  assertEquals(sourcePage({ manual_id: null, evidence_page: null }, manuals), null);
  assertEquals(sourcePage(undefined, manuals), null);
});

Deno.test("step 10: where the clock started — a logged service, history filled in, or unknown", () => {
  assertEquals(countingFrom({ last_performed_km: 180088, last_performed_date: "2026-08-22", last_performed_source: "work_order" }), {
    counting_from_km: 180088, counting_from_date: "2026-08-22", counting_from_source: "service",
  });
  assertEquals(countingFrom({ last_performed_km: 198000, last_performed_date: "2026-11-01", last_performed_source: "manual" }).counting_from_source, "filled_in");
  assertEquals(countingFrom({ last_performed_km: null, last_performed_date: null, baseline_source: "first_reading" }).counting_from_source, null);
});
