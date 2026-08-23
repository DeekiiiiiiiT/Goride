/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";

function adminWithPermissions(keys: string[]): ProductAdminUser {
  return {
    id: "a",
    email: "a@test.com",
    role: "dash_ops",
    roles: ["dash_ops"],
    permissions: keys,
    isPlatformRole: false,
  };
}

Deno.test("dash write gate allows dash.users.write permission", () => {
  assertEquals(requireDashWrite(adminWithPermissions(["dash.users.write"])), null);
});

Deno.test("dash write gate denies without permission", () => {
  assertEquals(requireDashWrite(adminWithPermissions(["dash.users.read"])) instanceof Response, true);
});
