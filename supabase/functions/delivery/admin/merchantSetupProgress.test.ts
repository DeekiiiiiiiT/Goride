import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeSetupChecklist,
  isApplicationSetupComplete,
  missingSetupLabels,
  setupStageLabel,
} from "./merchantSetupProgress.ts";

Deno.test("computeSetupChecklist — empty merchant", () => {
  const c = computeSetupChecklist({
    merchant: { name: "Test" },
    documentTypes: [],
    hoursCount: 0,
    menuItemCount: 0,
    hasBank: false,
  });
  assertEquals(c.profileComplete, false);
  assertEquals(c.catalogComplete, false);
  assertEquals(isApplicationSetupComplete(c), false);
});

Deno.test("computeSetupChecklist — catalog rule", () => {
  const c = computeSetupChecklist({
    merchant: { name: "Store", address: "1 Main", lat: 1, lng: 2, go_live_rule: "catalog_imported" },
    documentTypes: ["id_front", "id_back", "proof_of_business"],
    hoursCount: 1,
    menuItemCount: 50,
    hasBank: true,
  });
  assertEquals(c.menuComplete, true);
  assertEquals(c.catalogComplete, true);
});

Deno.test("missingSetupLabels — lists gaps", () => {
  const missing = missingSetupLabels({
    profileComplete: true,
    documentsComplete: false,
    bankComplete: false,
    hoursComplete: true,
    menuComplete: false,
    catalogComplete: false,
  });
  assertEquals(missing.includes("Identity documents"), true);
  assertEquals(missing.includes("Bank / payouts"), false);
});

Deno.test("setupStageLabel — merchant incomplete", () => {
  assertEquals(
    setupStageLabel("merchant", {
      profileComplete: false,
      documentsComplete: false,
      bankComplete: false,
      hoursComplete: false,
      menuComplete: false,
      catalogComplete: false,
    }),
    "Missing: Profile & location",
  );
});
