import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveRouteCompany } from "./route_company.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

Deno.test("resolveRouteCompany: no session company → NO_COMPANY 400", () => {
  assertEquals(resolveRouteCompany(null, undefined), {
    ok: false,
    status: 400,
    code: "NO_COMPANY",
  });
  assertEquals(resolveRouteCompany("", undefined), {
    ok: false,
    status: 400,
    code: "NO_COMPANY",
  });
  assertEquals(resolveRouteCompany("  ", ORG_A), {
    ok: false,
    status: 400,
    code: "NO_COMPANY",
  });
});

Deno.test("resolveRouteCompany: session only, request not named → ok", () => {
  assertEquals(resolveRouteCompany(ORG_A, undefined), { ok: true, orgId: ORG_A });
  assertEquals(resolveRouteCompany(ORG_A, null), { ok: true, orgId: ORG_A });
  assertEquals(resolveRouteCompany(ORG_A, ""), { ok: true, orgId: ORG_A });
  assertEquals(resolveRouteCompany(ORG_A, "   "), { ok: true, orgId: ORG_A });
  assertEquals(resolveRouteCompany(ORG_A, 42), { ok: true, orgId: ORG_A });
  assertEquals(resolveRouteCompany(ORG_A, { id: ORG_B }), { ok: true, orgId: ORG_A });
});

Deno.test("resolveRouteCompany: requested matches session → ok", () => {
  assertEquals(resolveRouteCompany(ORG_A, ORG_A), { ok: true, orgId: ORG_A });
  assertEquals(resolveRouteCompany(ORG_A, `  ${ORG_A}  `), { ok: true, orgId: ORG_A });
});

Deno.test("resolveRouteCompany: requested differs from session → COMPANY_MISMATCH 403", () => {
  assertEquals(resolveRouteCompany(ORG_A, ORG_B), {
    ok: false,
    status: 403,
    code: "COMPANY_MISMATCH",
  });
});
