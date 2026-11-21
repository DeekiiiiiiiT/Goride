import { assertEquals } from "jsr:@std/assert@1";
import { cleanPlatformRows } from "./toll_platform_admin_routes.ts";

Deno.test("toll platforms: only the editable fields are kept", () => {
  assertEquals(
    cleanPlatformRows([
      { platform: "uber", paysTollsBack: true, paybackMode: "per_trip", takesDisputes: true, disputeWindowDays: 9, organization_id: "x", coverage_source_id: "y" },
    ]),
    [{ platform: "uber", paysTollsBack: true, paybackMode: "per_trip", takesDisputes: true, disputeWindowDays: 9 }],
  );
});

Deno.test("toll platforms: bad input is refused", () => {
  assertEquals(cleanPlatformRows(null), null);
  assertEquals(cleanPlatformRows([]), null);
  assertEquals(cleanPlatformRows([{ paysTollsBack: true }]), null);
  assertEquals(cleanPlatformRows(["uber"]), null);
});

Deno.test("toll platforms: days can be cleared", () => {
  assertEquals(cleanPlatformRows([{ platform: "indrive", takesDisputes: false, disputeWindowDays: null }]), [
    { platform: "indrive", takesDisputes: false, disputeWindowDays: null },
  ]);
});
