import { assertEquals } from "https://deno.land/std@0.218.2/assert/mod.ts";
import { resolveLinkedRideForIntent } from "./tripIntents.ts";

Deno.test("resolveLinkedRideForIntent — uses ride_request_id when present", async () => {
  const rideSvc = {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === "ride_requests" && col === "id" && val === "ride-1") {
              return { data: { id: "ride-1", status: "completed" }, error: null };
            }
            return { data: null, error: null };
          },
          order: () => ({
            limit: () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  };

  const result = await resolveLinkedRideForIntent(
    rideSvc as never,
    "intent-1",
    "ride-1",
  );
  assertEquals(result.linkedStatus, "completed");
  assertEquals(result.resolvedRideId, "ride-1");
});
