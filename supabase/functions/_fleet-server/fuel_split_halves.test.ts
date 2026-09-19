import { assertEquals } from "jsr:@std/assert";
import {
  isUnlinkedSplitHalfPair,
  paymentFamilyBucket,
} from "./fuel_split_halves.ts";

Deno.test("paymentFamilyBucket classifies gas vs cash", () => {
  assertEquals(paymentFamilyBucket("gas_card"), "gas_card");
  assertEquals(paymentFamilyBucket("personal"), "cash");
  assertEquals(paymentFamilyBucket("rideshare_cash"), "cash");
  assertEquals(paymentFamilyBucket("petty_cash"), "cash");
  assertEquals(paymentFamilyBucket("other_thing"), "other");
});

Deno.test("unlinked halves: Gas Card + cash same day/odo without fillGroupId", () => {
  const card = {
    id: "card",
    vehicleId: "v1",
    odometer: 1000,
    date: "2026-09-11",
    paymentSource: "Gas_Card",
    entrySource: "admin-manual",
    metadata: { entrySource: "admin-manual" },
  };
  const cash = {
    id: "cash",
    vehicleId: "v1",
    odometer: 1000,
    date: "2026-09-11",
    paymentSource: "Personal",
    entrySource: "admin-manual",
    liters: 50,
    amount: 4000,
    metadata: { entrySource: "admin-manual" },
  };
  assertEquals(isUnlinkedSplitHalfPair(card, cash), true);
  assertEquals(isUnlinkedSplitHalfPair(cash, card), true);
});

Deno.test("proper split siblings with shared fillGroupId are not unlinked", () => {
  const card = {
    id: "card",
    vehicleId: "v1",
    odometer: 1000,
    date: "2026-09-11",
    paymentSource: "Gas_Card",
    metadata: { fillGroupId: "fg-1", splitRole: "card", splitVolumeOwner: false },
  };
  const cash = {
    id: "cash",
    vehicleId: "v1",
    odometer: 1000,
    date: "2026-09-11",
    paymentSource: "Personal",
    metadata: { fillGroupId: "fg-1", splitRole: "cash", splitVolumeOwner: true },
  };
  assertEquals(isUnlinkedSplitHalfPair(card, cash), false);
});

Deno.test("different day or odometer is not unlinked halves", () => {
  const card = {
    id: "card",
    vehicleId: "v1",
    odometer: 1000,
    date: "2026-09-11",
    paymentSource: "Gas_Card",
    metadata: {},
  };
  const cashOtherDay = {
    id: "cash",
    vehicleId: "v1",
    odometer: 1000,
    date: "2026-09-12",
    paymentSource: "Personal",
    metadata: {},
  };
  const cashOtherOdo = {
    id: "cash2",
    vehicleId: "v1",
    odometer: 1001,
    date: "2026-09-11",
    paymentSource: "Personal",
    metadata: {},
  };
  assertEquals(isUnlinkedSplitHalfPair(card, cashOtherDay), false);
  assertEquals(isUnlinkedSplitHalfPair(card, cashOtherOdo), false);
});
