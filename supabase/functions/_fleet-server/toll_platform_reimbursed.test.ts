import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isFleetAbsorbingTollResolution,
  isPersonalTollResolution,
  isPlatformReimbursedPlazaToll,
} from "./toll_platform_reimbursed.ts";

Deno.test("matched + reconciled tag is platform reimbursed", () => {
  assertEquals(
    isPlatformReimbursedPlazaToll({
      type: "usage",
      tripId: "trip-1",
      isReconciled: true,
    }),
    true,
  );
  assertEquals(
    isPlatformReimbursedPlazaToll({
      type: "usage",
      tripId: "trip-1",
      status: "reconciled",
    }),
    true,
  );
});

Deno.test("refunded resolution is platform reimbursed without a trip", () => {
  assertEquals(
    isPlatformReimbursedPlazaToll({ type: "usage", resolution: "refunded" }),
    true,
  );
});

Deno.test("personal / write_off / business are never platform reimbursed", () => {
  assertEquals(isPersonalTollResolution("personal"), true);
  assertEquals(isFleetAbsorbingTollResolution("write_off"), true);
  assertEquals(isFleetAbsorbingTollResolution("business"), true);
  assertEquals(
    isPlatformReimbursedPlazaToll({
      type: "usage",
      tripId: "trip-1",
      isReconciled: true,
      resolution: "personal",
    }),
    false,
  );
  assertEquals(
    isPlatformReimbursedPlazaToll({
      type: "usage",
      tripId: "trip-1",
      isReconciled: true,
      resolution: "write_off",
    }),
    false,
  );
  assertEquals(
    isPlatformReimbursedPlazaToll({
      type: "usage",
      tripId: "trip-1",
      isReconciled: true,
      resolution: "business",
    }),
    false,
  );
});

Deno.test("suggestion match or unmatched stay not reimbursed", () => {
  assertEquals(
    isPlatformReimbursedPlazaToll({ type: "usage", tripId: "trip-1" }),
    false,
  );
  assertEquals(
    isPlatformReimbursedPlazaToll({ type: "usage", isReconciled: true }),
    false,
  );
  assertEquals(isPlatformReimbursedPlazaToll({ type: "usage" }), false);
  assertEquals(
    isPlatformReimbursedPlazaToll({ type: "top_up", tripId: "t", isReconciled: true }),
    false,
  );
});
