import { assertEquals } from "jsr:@std/assert";
import {
  isGasCardCsvFuelEntry,
  isSoftDuplicatePair,
  normalizeFuelPaymentKey,
} from "./fuel_soft_dedup.ts";

Deno.test("normalizeFuelPaymentKey maps company_card to gas_card", () => {
  assertEquals(normalizeFuelPaymentKey("Gas_Card"), "gas_card");
  assertEquals(normalizeFuelPaymentKey("company_card"), "gas_card");
  assertEquals(normalizeFuelPaymentKey("rideshare_cash"), "rideshare_cash");
  assertEquals(normalizeFuelPaymentKey("RideShare_Cash"), "rideshare_cash");
});

Deno.test("isGasCardCsvFuelEntry is false for Known fill Gas Card anchors", () => {
  assertEquals(
    isGasCardCsvFuelEntry({
      paymentSource: "Gas_Card",
      entrySource: "admin-manual",
      metadata: { entrySource: "admin-manual", paymentSource: "company_card" },
    }),
    false,
  );
});

Deno.test("isGasCardCsvFuelEntry is true for jaa_raw statement rows", () => {
  assertEquals(
    isGasCardCsvFuelEntry({
      paymentSource: "Gas_Card",
      entrySource: "fuel-card",
      metadata: { importSource: "jaa_raw", jaaReceiptNumber: "ZZ1" },
    }),
    true,
  );
});

Deno.test("soft-dedup does NOT collapse Gas Card Known fill onto RideShare Cash at same odo", () => {
  const knownFill = {
    id: "new",
    vehicleId: "5179KZ",
    odometer: 184476,
    date: "2026-09-11T11:01:00",
    time: "11:01:00",
    paymentSource: "Gas_Card",
    entrySource: "admin-manual",
    amount: 1500,
    liters: 6.63,
    metadata: { entrySource: "admin-manual", paymentSource: "company_card" },
  };
  const cashFill = {
    id: "cash",
    vehicleId: "5179KZ",
    odometer: 184476,
    date: "2026-09-11T11:03:00",
    paymentSource: "RideShare_Cash",
    entrySource: "driver-portal",
    amount: 3500,
    liters: 15.4,
    metadata: { entrySource: "driver-portal", paymentSource: "rideshare_cash" },
  };
  assertEquals(isSoftDuplicatePair(knownFill, cashFill), false);
});

Deno.test("soft-dedup collapses true re-submit of same Gas Card Known fill", () => {
  const first = {
    id: "a",
    vehicleId: "5179KZ",
    odometer: 184476,
    date: "2026-09-11T11:01:00",
    paymentSource: "Gas_Card",
    entrySource: "admin-manual",
    metadata: { entrySource: "admin-manual" },
  };
  const second = {
    id: "b",
    vehicleId: "5179KZ",
    odometer: 184476,
    date: "2026-09-11T11:02:00",
    paymentSource: "Gas_Card",
    entrySource: "admin-manual",
    metadata: { entrySource: "admin-manual" },
  };
  assertEquals(isSoftDuplicatePair(second, first), true);
});

Deno.test("admin-manual soft-dedup ignores clock across same day", () => {
  const morning = {
    id: "a",
    vehicleId: "5179KZ",
    odometer: 184476,
    date: "2026-09-11",
    time: "08:15:00",
    paymentSource: "Gas_Card",
    entrySource: "admin-manual",
    metadata: { entrySource: "admin-manual" },
  };
  const midnightBackfill = {
    id: "b",
    vehicleId: "5179KZ",
    odometer: 184476,
    date: "2026-09-11",
    time: "",
    paymentSource: "Gas_Card",
    entrySource: "admin-manual",
    metadata: { entrySource: "admin-manual" },
  };
  assertEquals(isSoftDuplicatePair(midnightBackfill, morning), true);
});

Deno.test("driver-portal soft-dedup still requires 15-minute window", () => {
  const first = {
    id: "a",
    vehicleId: "5179KZ",
    odometer: 184476,
    date: "2026-09-11T08:15:00",
    time: "08:15:00",
    paymentSource: "Gas_Card",
    entrySource: "driver-portal",
    metadata: { entrySource: "driver-portal" },
  };
  const later = {
    id: "b",
    vehicleId: "5179KZ",
    odometer: 184476,
    date: "2026-09-11T08:40:00",
    time: "08:40:00",
    paymentSource: "Gas_Card",
    entrySource: "driver-portal",
    metadata: { entrySource: "driver-portal" },
  };
  assertEquals(isSoftDuplicatePair(later, first), false);
});

Deno.test("CSV statement candidate reuses real Gas Card driver fill", () => {
  const csv = {
    id: "csv",
    vehicleId: "5179KZ",
    odometer: 184197,
    date: "2026-09-10T10:00:51",
    paymentSource: "Gas_Card",
    entrySource: "fuel-card",
    metadata: { importSource: "jaa_raw", jaaReceiptNumber: "ZZ2" },
  };
  const driver = {
    id: "drv",
    vehicleId: "5179KZ",
    odometer: 184197,
    date: "2026-09-10T10:01:00",
    paymentSource: "Gas_Card",
    entrySource: "driver-portal",
    metadata: { entrySource: "driver-portal", paymentSource: "company_card" },
  };
  assertEquals(isSoftDuplicatePair(csv, driver), true);
  assertEquals(isSoftDuplicatePair(driver, csv), false);
});
