/**
 * JAA pair → unique GOD merchant heal decision (pure).
 * Run: deno test --no-check fuel_jaa_station_heal.test.ts
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  entryNeedsMerchantStationHeal,
  evaluateJaaPairMerchantHeal,
} from "./fuel_jaa_station_heal.ts";

const GOD = [
  { id: "fesco-1", name: "FESCO BEECHWOOD", brand: "FESCO", status: "verified" },
  { id: "rubis-1", name: "RUBIS Old Harbour Road", brand: "RUBIS", status: "verified" },
  {
    id: "fesco-2",
    name: "FESCO Half Way Tree",
    brand: "FESCO",
    status: "verified",
  },
];

const statementVendor = (overrides: Record<string, unknown> = {}) => ({
  id: "stmt-1",
  vendor: "FESCO BEECHWOOD",
  amount: 5000,
  liters: 40,
  metadata: {
    locationStatus: "statement_vendor",
    verificationMethod: "jaa_issuer_statement",
    importSource: "jaa_raw",
    jaaStation: "FESCO BEECHWOOD",
    jaaMatchedDriverEntryId: "drv-1",
  },
  ...overrides,
});

const driverLog = (overrides: Record<string, unknown> = {}) => ({
  id: "drv-1",
  amount: 3000,
  odometer: 182318,
  vehicleId: "veh-1",
  date: "2026-09-10",
  metadata: {
    locationStatus: "unknown",
    jaaMatchedStatementId: "stmt-1",
  },
  ...overrides,
});

Deno.test("entryNeedsMerchantStationHeal: statement_vendor yes", () => {
  assertEquals(entryNeedsMerchantStationHeal(statementVendor()), true);
});

Deno.test("entryNeedsMerchantStationHeal: GPS verified no", () => {
  assertEquals(
    entryNeedsMerchantStationHeal({
      metadata: {
        locationStatus: "verified",
        verificationMethod: "gps_handshake",
      },
    }),
    false,
  );
});

Deno.test("evaluateJaaPairMerchantHeal: unique FESCO stamps decision", () => {
  const decision = evaluateJaaPairMerchantHeal({
    statement: statementVendor(),
    driver: driverLog(),
    stations: GOD,
    odoHealthy: true,
    isFirstFill: false,
  });
  assertEquals(decision.heal, true);
  if (decision.heal) {
    assertEquals(decision.stationId, "fesco-1");
    assertEquals(decision.merchantText.toUpperCase().includes("BEECHWOOD"), true);
    assertExists(decision.score);
  }
});

Deno.test("evaluateJaaPairMerchantHeal: unhealthy odo skips", () => {
  const decision = evaluateJaaPairMerchantHeal({
    statement: statementVendor(),
    driver: driverLog(),
    stations: GOD,
    odoHealthy: false,
    isFirstFill: false,
  });
  assertEquals(decision.heal, false);
  if (!decision.heal) {
    assertEquals(decision.reason.includes("Odometer"), true);
  }
});

Deno.test("evaluateJaaPairMerchantHeal: ambiguous merchant skips", () => {
  const decision = evaluateJaaPairMerchantHeal({
    statement: statementVendor({
      vendor: "FESCO",
      metadata: {
        locationStatus: "statement_vendor",
        jaaStation: "FESCO",
        jaaMatchedDriverEntryId: "drv-1",
      },
    }),
    driver: driverLog({ vendor: "FESCO", location: "FESCO" }),
    stations: GOD,
    odoHealthy: true,
    isFirstFill: false,
  });
  // Brand-only across two FESCO stations should not unique-match at default threshold
  assertEquals(decision.heal, false);
});

Deno.test("evaluateJaaPairMerchantHeal: both already verified skips", () => {
  const decision = evaluateJaaPairMerchantHeal({
    statement: statementVendor({
      metadata: {
        locationStatus: "verified",
        verificationMethod: "platform_ops_override",
        jaaMatchedDriverEntryId: "drv-1",
      },
    }),
    driver: driverLog({
      metadata: {
        locationStatus: "verified",
        verificationMethod: "platform_ops_override",
        jaaMatchedStatementId: "stmt-1",
      },
    }),
    stations: GOD,
    odoHealthy: true,
    isFirstFill: false,
  });
  assertEquals(decision.heal, false);
  if (!decision.heal) {
    assertEquals(decision.reason.includes("already"), true);
  }
});

Deno.test("evaluateJaaPairMerchantHeal: first fill with strong unique match ok", () => {
  const decision = evaluateJaaPairMerchantHeal({
    statement: statementVendor(),
    driver: driverLog(),
    stations: GOD,
    odoHealthy: true,
    isFirstFill: true,
  });
  assertEquals(decision.heal, true);
  if (decision.heal) {
    assertEquals(decision.stationId, "fesco-1");
  }
});
