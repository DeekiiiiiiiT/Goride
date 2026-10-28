/**
 * R14 — posting without organization_id must fail before the RPC.
 */
import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { requireOrganizationId } from "./postEntry.ts";

Deno.test("requireOrganizationId accepts a UUID", () => {
  const id = "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
  assertEquals(requireOrganizationId(id, "test"), id);
});

Deno.test("requireOrganizationId rejects null/blank", () => {
  assertThrows(
    () => requireOrganizationId(null, "fuel_deduction"),
    Error,
    "organization_id required for fuel_deduction",
  );
  assertThrows(
    () => requireOrganizationId("", "toll_usage"),
    Error,
    "organization_id required for toll_usage",
  );
  assertThrows(
    () => requireOrganizationId("not-a-uuid", "kv_toll_ledger"),
    Error,
    "organization_id required for kv_toll_ledger",
  );
});
