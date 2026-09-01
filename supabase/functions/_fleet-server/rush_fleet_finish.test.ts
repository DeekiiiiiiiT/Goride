/**
 * RoamFleet × Rush production finish guards.
 * Run: deno test --no-check rush_fleet_finish.test.ts
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FEATURE_FLAGS } from "./feature_flags.ts";

/** Seed defaults from initializeDefaultFlags — used by CI guards. */
export const FLAG_SEED_DEFAULTS: Record<string, boolean> = {
  legacy_driver_join: false,
  rush_settlement: false,
};

Deno.test("LEGACY_DRIVER_JOIN seed default is off", () => {
  assertEquals(FLAG_SEED_DEFAULTS.legacy_driver_join, false);
  assertEquals(FEATURE_FLAGS.LEGACY_DRIVER_JOIN, "legacy_driver_join");
});
