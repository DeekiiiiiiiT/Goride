import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildActivityPipelineItems } from "./passengerActivityUpcoming.ts";

Deno.test("buildActivityPipelineItems returns empty when scheduled rides disabled", async () => {
  Deno.env.set("SCHEDULED_RIDES_ENABLED", "0");
  const items = await buildActivityPipelineItems(
    {
      svc: () => {
        throw new Error("should not query when disabled");
      },
      pubSvc: () => {
        throw new Error("should not query when disabled");
      },
      requireUser: async () => ({ user: { id: "u1" } }),
    },
    "u1",
  );
  assertEquals(items, []);
});

Deno.test("buildActivityPipelineItems loads scheduled rows when enabled", async () => {
  Deno.env.set("SCHEDULED_RIDES_ENABLED", "1");
  const items = await buildActivityPipelineItems(
    {
      svc: () =>
        ({
          from: () => ({
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [{
                        id: "ride-1",
                        status: "scheduled",
                        scheduled_pickup_at: "2026-06-20T10:00:00.000Z",
                        pickup_address: "Kingston",
                        dropoff_address: "Half Way Tree",
                        vehicle_option: "standard",
                        fare_estimate_minor: 150000,
                        currency: "JMD",
                      }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }) as never,
      pubSvc: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }) }) }) as never,
      requireUser: async () => ({ user: { id: "u1" } }),
    },
    "u1",
  );
  assertEquals(items.length, 1);
  assertEquals(items[0].kind, "schedule");
  assertEquals(items[0].id, "ride-1");
  assertEquals(items[0].status, "scheduled");
});
