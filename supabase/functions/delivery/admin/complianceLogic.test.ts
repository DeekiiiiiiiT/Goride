import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canForceApprove,
  canStrictApprove,
  computeComplianceBlockers,
  isInComplianceQueue,
  validateApproveRequest,
} from "./complianceLogic.ts";

const completeCourier = {
  status: "pending" as const,
  onboarding_complete: true,
  background_check_status: "approved",
};

const completeAssets = {
  hasLicense: true,
  hasVehicle: true,
  hasInsurance: true,
};

Deno.test("computeComplianceBlockers — strict approve ready", () => {
  const blockers = computeComplianceBlockers(completeCourier, completeAssets);
  assertEquals(blockers, []);
  assertEquals(canStrictApprove(blockers, "pending"), true);
});

Deno.test("computeComplianceBlockers — license missing", () => {
  const blockers = computeComplianceBlockers(completeCourier, {
    ...completeAssets,
    hasLicense: false,
  });
  assertEquals(blockers.includes("license_missing"), true);
  assertEquals(canStrictApprove(blockers, "pending"), false);
});

Deno.test("computeComplianceBlockers — vehicle missing", () => {
  const blockers = computeComplianceBlockers(completeCourier, {
    ...completeAssets,
    hasVehicle: false,
  });
  assertEquals(blockers.includes("vehicle_missing"), true);
});

Deno.test("computeComplianceBlockers — insurance missing", () => {
  const blockers = computeComplianceBlockers(completeCourier, {
    ...completeAssets,
    hasInsurance: false,
  });
  assertEquals(blockers.includes("insurance_missing"), true);
});

Deno.test("computeComplianceBlockers — suspended blocks approve", () => {
  const blockers = computeComplianceBlockers(
    { ...completeCourier, status: "suspended" },
    completeAssets,
  );
  assertEquals(blockers.includes("account_suspended"), true);
  assertEquals(canForceApprove("superadmin", blockers, "suspended"), false);
});

Deno.test("computeComplianceBlockers — no profile", () => {
  const blockers = computeComplianceBlockers(null, completeAssets);
  assertEquals(blockers, ["no_profile"]);
});

Deno.test("isInComplianceQueue — pending always in queue", () => {
  assertEquals(isInComplianceQueue([], "pending"), true);
});

Deno.test("validateApproveRequest — force requires reason", () => {
  const blockers = computeComplianceBlockers(
    { ...completeCourier, onboarding_complete: false },
    { hasLicense: false, hasVehicle: false, hasInsurance: false },
  );
  const r = validateApproveRequest({ force: true }, blockers, "pending", "superadmin");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "force_reason_required");
});

Deno.test("validateApproveRequest — courier_admin can force with reason", () => {
  const blockers = computeComplianceBlockers(
    { ...completeCourier, onboarding_complete: false },
    { hasLicense: false, hasVehicle: false, hasInsurance: false },
  );
  const r = validateApproveRequest(
    { force: true, reason: "Manual review completed by ops" },
    blockers,
    "pending",
    "courier_admin",
  );
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.force, true);
});
