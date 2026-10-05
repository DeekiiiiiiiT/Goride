/**
 * Driver name is stamped on both halves of a split fill, even when the client omits it.
 */
import { assertEquals } from "jsr:@std/assert";
import { stampSplitDriverNames } from "./fuel_split_fill.ts";

Deno.test("stampSplitDriverNames fills a missing name on both halves", async () => {
  const cash: Record<string, unknown> = { driverId: "drv-1" };
  const card: Record<string, unknown> = { driverId: "drv-1" };
  await stampSplitDriverNames(cash, card, async () => "Kenny Gregory Rattray");
  assertEquals(cash.driverName, "Kenny Gregory Rattray");
  assertEquals(card.driverName, "Kenny Gregory Rattray");
});

Deno.test("stampSplitDriverNames keeps a name the client already sent", async () => {
  const cash: Record<string, unknown> = { driverId: "drv-1", driverName: "Kenny Gregory Rattray" };
  const card: Record<string, unknown> = { driverId: "drv-1" };
  await stampSplitDriverNames(cash, card, async () => "Someone Else");
  assertEquals(cash.driverName, "Kenny Gregory Rattray");
  assertEquals(card.driverName, "Kenny Gregory Rattray");
});
