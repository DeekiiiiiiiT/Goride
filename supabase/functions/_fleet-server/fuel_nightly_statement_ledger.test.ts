import { assertEquals } from "jsr:@std/assert";
import { buildFuelSnapStatementLedgerDrifts } from "./fuel_nightly_statement_ledger.ts";

Deno.test("#31: aligned snap/statement/ledger yields no drifts", () => {
  const drifts = buildFuelSnapStatementLedgerDrifts({
    snapDriverMinor: 5000,
    snapCompanyMinor: 3000,
    stmtDriverMinor: 5000,
    stmtCompanyMinor: 3000,
    ledgerDriverMinor: 5000,
    ledgerCompanyMinor: 3000,
  });
  assertEquals(drifts.length, 0);
});

Deno.test("#31: statement vs snap drift fields", () => {
  const drifts = buildFuelSnapStatementLedgerDrifts({
    snapDriverMinor: 5000,
    snapCompanyMinor: 3000,
    stmtDriverMinor: 5100,
    stmtCompanyMinor: 3000,
    ledgerDriverMinor: 5100,
    ledgerCompanyMinor: 3000,
  });
  const fields = drifts.map((d) => d.field);
  assertEquals(fields.includes("driverShare"), true);
  assertEquals(
    drifts.find((d) => d.field === "driverShare")?.deltaMinor,
    -100,
  );
});

Deno.test("#31: ledger vs statement drift fields", () => {
  const drifts = buildFuelSnapStatementLedgerDrifts({
    snapDriverMinor: 5000,
    snapCompanyMinor: 3000,
    stmtDriverMinor: 5000,
    stmtCompanyMinor: 3000,
    ledgerDriverMinor: 4900,
    ledgerCompanyMinor: 3000,
  });
  assertEquals(
    drifts.some((d) => d.field === "ledger_driverShare" && d.deltaMinor === 100),
    true,
  );
  assertEquals(
    drifts.some((d) => d.field === "snapshot_ledger_driverShare" && d.deltaMinor === 100),
    true,
  );
});
