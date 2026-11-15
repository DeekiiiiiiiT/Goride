/**
 * deno test --no-check supabase/functions/_fleet-server/maintenance_routes_policy.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";

const routesUrl = new URL("./maintenance_routes.ts", import.meta.url);

Deno.test("board PATCH blocks completed status with use_complete", () => {
  const src = Deno.readTextFileSync(routesUrl);
  assertEquals(src.includes('code: "use_complete"'), true);
  assertEquals(src.includes("Use Finish to complete this service."), true);
});

Deno.test("legacy PATCH requires expectedVersion only with existing work order", () => {
  const src = Deno.readTextFileSync(routesUrl);
  assertEquals(src.includes('code: "version_required"'), true);
  assertEquals(
    src.includes("isUuid(editWorkOrderId) && (evRaw == null || evRaw === \"\")"),
    true,
  );
});

Deno.test("legacy complete passes client recordId", () => {
  const src = Deno.readTextFileSync(routesUrl);
  assertEquals(src.includes("legacyCompleteRecordId"), true);
  assertEquals(src.includes("await legacyCompleteRecordId"), true);
});
