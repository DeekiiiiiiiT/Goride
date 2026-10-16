import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  jwtAssuranceLevel,
  staffRolesRequireMfa,
} from "./productAdmin.ts";

function fakeJwt(aal: "aal1" | "aal2"): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ aal, sub: "u1" }));
  return `Bearer ${header}.${payload}.sig`;
}

Deno.test("staffRolesRequireMfa: privileged role requires MFA", () => {
  assertEquals(staffRolesRequireMfa(["dash_admin"]), true);
  assertEquals(staffRolesRequireMfa(["platform_owner"]), true);
});

Deno.test("staffRolesRequireMfa: ops role does not require MFA by default", () => {
  assertEquals(staffRolesRequireMfa(["dash_ops"]), false);
  assertEquals(staffRolesRequireMfa(["courier_ops"]), false);
});

Deno.test("staffRolesRequireMfa: custom list overrides defaults", () => {
  assertEquals(staffRolesRequireMfa(["dash_ops"], ["dash_ops"]), true);
  assertEquals(staffRolesRequireMfa(["dash_admin"], ["platform_owner"]), true); // level floor
});

Deno.test("jwtAssuranceLevel reads aal from bearer token", () => {
  assertEquals(jwtAssuranceLevel(fakeJwt("aal1")), "aal1");
  assertEquals(jwtAssuranceLevel(fakeJwt("aal2")), "aal2");
  assertEquals(jwtAssuranceLevel("Bearer not-a-jwt"), "aal1");
});
