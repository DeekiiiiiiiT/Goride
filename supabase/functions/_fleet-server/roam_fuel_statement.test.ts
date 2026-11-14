import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyFuelCardPrograms } from "./fuel_card_programs.ts";
import { mondayOf, normalizeStatementWeeks, statementWeeksFromDates } from "./roam_fuel_statement.ts";

const ROAM = { companyCode: "00002920", mode: "roam_managed", organizationId: null };
const OWN = { companyCode: "00009999", mode: "self_serve", organizationId: "org-b" };

Deno.test("RF-05: a card on Roam's program → Roam statement only", () => {
  assertEquals(
    classifyFuelCardPrograms("org-a", [{ jaaCompanyCode: "00002920" }], [ROAM, OWN]),
    { roam: true, own: false },
  );
});

Deno.test("RF-05: a card on the fleet's own program → own statement only (DT-3)", () => {
  assertEquals(
    classifyFuelCardPrograms("org-b", [{ jaaCompanyCode: "00009999" }], [ROAM, OWN]),
    { roam: false, own: true },
  );
});

Deno.test("RF-05: a self-serve program for the fleet counts even before a card exists", () => {
  assertEquals(classifyFuelCardPrograms("org-b", [], [ROAM, OWN]), { roam: false, own: true });
});

Deno.test("RF-05: retired cards and no cards → neither", () => {
  assertEquals(
    classifyFuelCardPrograms("org-a", [{ jaaCompanyCode: "00002920", status: "retired" }], [ROAM]),
    { roam: false, own: false },
  );
});

Deno.test("RF-02: fill dates → Monday weeks (21 Sep file: fills 24–26 Sep)", () => {
  assertEquals(mondayOf("2026-09-26"), "2026-09-21");
  assertEquals(mondayOf("2026-09-21"), "2026-09-21");
  assertEquals(mondayOf("2026-09-27"), "2026-09-21");
  assertEquals(statementWeeksFromDates(["2026-09-24", "2026-09-26", "2026-09-25"]), ["2026-09-21"]);
  assertEquals(statementWeeksFromDates(["2026-09-27", "2026-09-28"]), ["2026-09-21", "2026-09-28"]);
});

Deno.test("RF-02: only real Mondays are kept as statement weeks", () => {
  assertEquals(normalizeStatementWeeks(["2026-09-21", "2026-09-22", "x", null, "2026-09-21"]), ["2026-09-21"]);
  assertEquals(normalizeStatementWeeks(undefined), []);
});
