import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { withRoamLinkFlag } from "./contactRoamLink.ts";

Deno.test("withRoamLinkFlag is true when linked_user_id is set", () => {
  const row = withRoamLinkFlag({ id: "c1", linked_user_id: "user-1" });
  assertEquals(row.roam_account_linked, true);
});

Deno.test("withRoamLinkFlag is false when linked_user_id is missing", () => {
  const row = withRoamLinkFlag({ id: "c1", linked_user_id: null });
  assertEquals(row.roam_account_linked, false);
});
