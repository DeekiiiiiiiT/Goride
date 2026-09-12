import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { normalizeFleetTagName, validateFleetTagName } from "./fleet_tag_routes.ts";

Deno.test("normalizeFleetTagName strips @ and lowercases", () => {
  assertEquals(normalizeFleetTagName("  @Acme_Fleet  "), "acme_fleet");
});

Deno.test("validateFleetTagName rejects short and reserved", () => {
  assertEquals(validateFleetTagName("ab"), "tag_length");
  assertEquals(validateFleetTagName("fleet"), "tag_reserved");
  assertEquals(validateFleetTagName("ftabc"), "tag_reserved");
  assertEquals(validateFleetTagName("good_tag"), null);
});
