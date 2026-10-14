/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { jamaicaDayStartIso } from "../inHouse/pricing.ts";
import {
  CAPABILITY_LABELS,
  CAPABILITY_MATRIX,
  canOpenCapabilityForRoles,
  type DashCapability,
} from "../../../../packages/dash-admin/src/config/dashAdminCapabilities.ts";
import { canSee, canSeePeople, courierGrantAllowed, personHref, sanitizeSearchToken } from "./consoleAccess.ts";

Deno.test("search sanitizer strips filter breakers", () => {
  assertEquals(sanitizeSearchToken("a%,_()."), "a");
  assertEquals(sanitizeSearchToken("  Ada, (Lee) "), "Ada Lee");
});

Deno.test("server access uses the website role table", () => {
  const capabilities = Object.keys(CAPABILITY_LABELS) as DashCapability[];
  for (const role of Object.keys(CAPABILITY_MATRIX)) {
    for (const capability of capabilities) {
      assertEquals(canSee([role], capability), canOpenCapabilityForRoles([role], capability));
    }
  }
  assertEquals(canSee(["dash_ops", "platform_analyst"], "finance"), true);
  assertEquals(canSee(["dash_admin"], "not-a-page"), false);
});

Deno.test("sales stay with finance roles", () => {
  assertEquals(canSee(["platform_analyst"], "finance"), true);
  assertEquals(canSee(["dash_ops"], "finance"), false);
  assertEquals(canSee(["courier_admin"], "finance"), false);
  assertEquals(canSee(["platform_support"], "finance"), false);
  assertEquals(canSee(["dash_admin"], "finance"), true);
});

Deno.test("people search follows customers only", () => {
  assertEquals(canSeePeople(["dash_ops"]), true);
  assertEquals(canSeePeople(["platform_support"]), true);
  assertEquals(canSeePeople(["courier_admin"]), false);
  assertEquals(canSeePeople(["courier_ops"]), false);
  assertEquals(canSee(["courier_admin"], "team"), true);
});

Deno.test("person links open a page that role can open", () => {
  const both = [{ persona: "customer", ref_id: "cust-1" }, { persona: "courier", ref_id: "user-1" }];
  assertEquals(personHref(["dash_ops"], "user-1", both), "/customers/cust-1");
  assertEquals(personHref(["courier_admin"], "user-1", both), "/couriers/user-1");
  assertEquals(personHref(["courier_admin"], "user-1", [{ persona: "customer", ref_id: "cust-1" }]), null);
  assertEquals(personHref(["platform_support"], "user-1", []), null);
});

Deno.test("courier staff cannot grant a dash role", () => {
  assertEquals(courierGrantAllowed(["courier_admin"], "dash_admin"), false);
  assertEquals(courierGrantAllowed(["courier_ops"], "courier_ops"), true);
  assertEquals(courierGrantAllowed(["dash_admin", "courier_admin"], "dash_ops"), true);
});

Deno.test("jamaica day starts at 05:00 UTC", () => {
  assertEquals(jamaicaDayStartIso(new Date("2026-10-13T04:59:00.000Z")), "2026-10-12T05:00:00.000Z");
  assertEquals(jamaicaDayStartIso(new Date("2026-10-13T05:00:00.000Z")), "2026-10-13T05:00:00.000Z");
});
