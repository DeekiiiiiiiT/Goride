import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canSuspendMerchant,
  canTransitionOperational,
  isChecklistComplete,
} from "./merchantAdminShared.ts";

Deno.test("canSuspendMerchant — only approved", () => {
  assertEquals(canSuspendMerchant("approved"), true);
  assertEquals(canSuspendMerchant("pending"), false);
});

Deno.test("canTransitionOperational — valid paths", () => {
  assertEquals(canTransitionOperational("active", "suspended"), true);
  assertEquals(canTransitionOperational("suspended", "active"), true);
  assertEquals(canTransitionOperational("deactivated", "active"), true);
  assertEquals(canTransitionOperational("pending" as "active", "suspended"), false);
});

Deno.test("isChecklistComplete — all keys required", () => {
  assertEquals(isChecklistComplete({}), false);
  assertEquals(
    isChecklistComplete({
      id_verified: true,
      business_proof_verified: true,
      bank_verified: true,
      hours_verified: true,
      menu_preview_verified: true,
    }),
    true,
  );
});
