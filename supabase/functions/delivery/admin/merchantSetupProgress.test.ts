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
  assertEquals(isApplicationSetupComplete(c), false);
});

Deno.test("missingSetupLabels — lists gaps", () => {
  const missing = missingSetupLabels({
    profileComplete: true,
    documentsComplete: false,
    bankComplete: false,
    hoursComplete: true,
    menuComplete: false,
  });
  assertEquals(missing.includes("Identity documents"), true);
  assertEquals(missing.includes("Bank / payouts"), true);
});

Deno.test("setupStageLabel — auth only", () => {
  assertEquals(
    setupStageLabel("auth_only", {
      profileComplete: false,
      documentsComplete: false,
      bankComplete: false,
      hoursComplete: false,
      menuComplete: false,
    }),
    "Not started — wizard",
  );
});
