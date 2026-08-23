/// <reference lib="deno.ns" />
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCourierSuspendCrossPersonaWarning,
  COURIER_UNSUSPEND_AUTH_PATCH,
  isActiveCustomerPersona,
} from "./courierAdminActions.ts";

Deno.test("courier unsuspend clears auth ban", () => {
  assertEquals(COURIER_UNSUSPEND_AUTH_PATCH.ban_duration, "none");
});

Deno.test("cross-persona warning when customer active and not confirmed", () => {
  const warning = buildCourierSuspendCrossPersonaWarning(
    { id: "cust-1", account_status: "active", email: "a@b.com" },
    false,
  );
  assertExists(warning);
  assertEquals(warning?.error, "cross_persona_warning");
});

Deno.test("cross-persona skipped when confirmed", () => {
  const warning = buildCourierSuspendCrossPersonaWarning(
    { id: "cust-1", account_status: "active" },
    true,
  );
  assertEquals(warning, null);
});

Deno.test("inactive customer persona does not warn", () => {
  assertEquals(isActiveCustomerPersona({ id: "x", account_status: "deleted" }), false);
  assertEquals(
    buildCourierSuspendCrossPersonaWarning({ id: "x", account_status: "deleted" }, false),
    null,
  );
});
