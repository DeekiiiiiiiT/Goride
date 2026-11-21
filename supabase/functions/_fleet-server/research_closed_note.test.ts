import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ownerClosedNote } from "./catalog_research_routes.ts";

Deno.test("RE-73: a job the owner closed shows its note; a real failure does not", () => {
  assertEquals(ownerClosedNote("failed", "replaced by front and rear checks (owner)"), "replaced by front and rear checks");
  assertEquals(ownerClosedNote("failed", "Roomy has rear drums (owner)"), "Roomy has rear drums");
  assertEquals(ownerClosedNote("failed", "max_reads"), null);
  assertEquals(ownerClosedNote("failed", null), null);
  assertEquals(ownerClosedNote("queued", "already confirmed (owner)"), null);
});
