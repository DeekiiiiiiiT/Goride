import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shapeWeekActivity } from "./recon_activity.ts";

Deno.test("WRA-21 activity: no Uber upload for the week", () => {
  assertEquals(shapeWeekActivity([]), { status: "no_upload" });
});

Deno.test("WRA-21 activity: uploads before hours were recorded say not recorded", () => {
  assertEquals(shapeWeekActivity([{ created_at: "2026-10-19T16:33:00Z", payload_json: { status: "completed" } }]), {
    status: "not_recorded",
    uploadedAt: "2026-10-19T16:33:00Z",
  });
});

Deno.test("WRA-21 activity: newest upload wins; on-trip share is worked out; bad numbers become 0", () => {
  const out = shapeWeekActivity([
    {
      created_at: "2026-11-10T09:00:00Z",
      payload_json: {
        driverActivity: [
          { driverId: "b", name: "Phillip Bailey", tripsCompleted: 40, onlineHours: 0, onTripHours: 0 },
          { driverId: "a", name: "Kenny Gregory Rattray", tripsCompleted: 70, onlineHours: 56.7, onTripHours: 32.98 },
          { driverId: "", name: "no id" },
          { driverId: "c", name: "Sadiki Abayomi Thomas", tripsCompleted: "x", onlineHours: -3, onTripHours: "abc" },
        ],
      },
    },
    { created_at: "2026-11-09T09:00:00Z", payload_json: { driverActivity: [] } },
  ]);
  assertEquals(out, {
    status: "ok",
    uploadedAt: "2026-11-10T09:00:00Z",
    drivers: [
      { driverId: "a", name: "Kenny Gregory Rattray", tripsCompleted: 70, onlineHours: 56.7, onTripHours: 32.98, onTripPct: 58 },
      { driverId: "b", name: "Phillip Bailey", tripsCompleted: 40, onlineHours: 0, onTripHours: 0, onTripPct: null },
      { driverId: "c", name: "Sadiki Abayomi Thomas", tripsCompleted: 0, onlineHours: 0, onTripHours: 0, onTripPct: null },
    ],
  });
});
