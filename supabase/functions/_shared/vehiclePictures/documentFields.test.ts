import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  checkDocumentDates,
  compareDocuments,
  normalizeDocumentDate,
  whitelistDocumentFields,
} from "./documentFields.ts";

Deno.test("whitelist drops owner PII and extra keys", () => {
  const out = whitelistDocumentFields({
    plate: "5179KZ",
    ownerName: "Secret",
    ownerAddress: "123 Road",
    trn: "999",
    feePaid: 1000,
    receiptNumber: "R1",
    chassis: "X",
  });
  assertEquals(Object.keys(out).sort(), ["chassis", "plate"]);
  assertEquals(out.ownerName, undefined);
});

Deno.test("normalizeDocumentDate fitness and registration shapes", () => {
  assertEquals(normalizeDocumentDate("2028 / 08 / 24", "fitness"), "2028-08-24");
  assertEquals(normalizeDocumentDate("2026-10-01", "registration-issue"), "2026-10-01");
  assertEquals(normalizeDocumentDate("2027/Sep", "registration-expiry"), "2027-09-30");
  assertEquals(normalizeDocumentDate("2028/Feb", "registration-expiry"), "2028-02-29");
});

Deno.test("checkDocumentDates flags bad year and expiry before issue", () => {
  const today = new Date("2026-11-16T12:00:00Z");
  const badYear = checkDocumentDates({ year: 1975, issueDate: "2026-01-01", expiryDate: "2027-01-01" }, today);
  assert(badYear.flagged.includes("year"));

  const badOrder = checkDocumentDates(
    { year: 2020, issueDate: "2026-10-01", expiryDate: "2026-01-01" },
    today,
  );
  assertEquals(badOrder.expiryDate, null);
  assert(badOrder.flagged.includes("expiryDate"));
});

Deno.test("compareDocuments: TMP fitness plate, reg plate wins; chassis normalised", () => {
  const r = compareDocuments(
    { plate: "TMP4862", chassis: "M900A0344862", colorAsWritten: "WHITE" },
    { plate: "5179KZ", chassis: "M900A-0344862", colorAsWritten: "WHITE" },
  );
  assertEquals(r.plate, "5179KZ");
  assertEquals(r.chassisMismatch, false);
  assertEquals(r.colorConflict, false);
});

Deno.test("compareDocuments: different chassis → mismatch; colour conflict", () => {
  const m = compareDocuments(
    { chassis: "AAA", colorAsWritten: "WHITE" },
    { chassis: "BBB", colorAsWritten: "SILVER" },
  );
  assertEquals(m.chassisMismatch, true);
  assertEquals(m.colorConflict, true);
  assertEquals(m.defaultColor, "white");
});
Deno.test("a chassis missing from one document is not a mismatch", () => {
  assertEquals(compareDocuments({ chassis: "" }, { chassis: "M900A0344862" }).chassisMismatch, false);
  assertEquals(compareDocuments({ chassis: null }, { chassis: "M900A0344862" }).chassisMismatch, false);
});
