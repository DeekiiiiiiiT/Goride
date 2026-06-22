import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDraftMerchantInsert,
  isValidWizardStepKey,
  mergeOnboardingDraft,
  merchantPayloadFromBody,
  sanitizeOnboardingDraft,
  wizardStepFromKey,
  wizardStepLabel,
} from "./partnerOnboarding.ts";

Deno.test("sanitizeOnboardingDraft strips file fields", () => {
  const out = sanitizeOnboardingDraft({
    restaurantName: "Test",
    idFrontFile: { bad: true },
    email: "a@b.com",
  });
  assertEquals(out.restaurantName, "Test");
  assertEquals(out.email, "a@b.com");
  assertEquals("idFrontFile" in out, false);
});

Deno.test("mergeOnboardingDraft preserves existing keys", () => {
  const merged = mergeOnboardingDraft(
    { restaurantName: "A", phone: "123" },
    { description: "Nice" },
  );
  assertEquals(merged.restaurantName, "A");
  assertEquals(merged.phone, "123");
  assertEquals(merged.description, "Nice");
});

Deno.test("wizardStepFromKey maps restaurant-info to 1", () => {
  assertEquals(wizardStepFromKey("restaurant-info"), 1);
  assertEquals(wizardStepFromKey("location"), 2);
});

Deno.test("isValidWizardStepKey", () => {
  assertEquals(isValidWizardStepKey("verification"), true);
  assertEquals(isValidWizardStepKey("invalid"), false);
});

Deno.test("buildDraftMerchantInsert sets draft status", () => {
  const row = buildDraftMerchantInsert("user-uuid-1234", "test@example.com");
  assertEquals(row.onboarding_status, "draft");
  assertEquals(row.submitted_at, null);
  assertEquals(row.verification_status, "pending");
  assertEquals(row.wizard_step, 1);
});

Deno.test("merchantPayloadFromBody sets submitted status", () => {
  const payload = merchantPayloadFromBody({
    name: "Code Blue",
    email: "a@b.com",
    phone: "876",
    address: "Kingston",
    lat: 18,
    lng: -76,
  }, "user-id");
  assertEquals(payload.onboarding_status, "submitted");
  assertEquals(payload.name, "Code Blue");
  assertEquals(typeof payload.submitted_at, "string");
});

Deno.test("wizardStepLabel", () => {
  assertEquals(wizardStepLabel("location"), "Location");
});
