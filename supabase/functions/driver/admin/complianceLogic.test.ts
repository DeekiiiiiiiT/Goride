import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canForceApprove,
  canStrictApprove,
  computeComplianceBlockers,
  isInComplianceQueue,
  validateApproveRequest,
} from "./complianceLogic.ts";

const completeIndependent = {
  status: "pending" as const,
  mode: "independent",
  onboarding_complete: true,
  background_check_status: "approved",
  insurance_expiry: "2027-01-01",
};

Deno.test("computeComplianceBlockers — strict approve ready", () => {
  const blockers = computeComplianceBlockers(completeIndependent, true);
  assertEquals(blockers, []);
  assertEquals(canStrictApprove(blockers, "pending"), true);
});

Deno.test("computeComplianceBlockers — incomplete onboarding", () => {
  const blockers = computeComplianceBlockers(
    { ...completeIndependent, onboarding_complete: false },
    true,
  );
  assertEquals(blockers.includes("onboarding_incomplete"), true);
  assertEquals(canStrictApprove(blockers, "pending"), false);
});

Deno.test("computeComplianceBlockers — suspended blocks approve", () => {
  const blockers = computeComplianceBlockers(
    { ...completeIndependent, status: "suspended" },
    true,
  );
  assertEquals(blockers.includes("account_suspended"), true);
  assertEquals(canStrictApprove(blockers, "suspended"), false);
  assertEquals(canForceApprove("superadmin", blockers, "suspended"), false);
});

Deno.test("computeComplianceBlockers — fleet skips vehicle and insurance", () => {
  const blockers = computeComplianceBlockers(
    {
      status: "pending",
      mode: "fleet",
      onboarding_complete: true,
      background_check_status: "approved",
      insurance_expiry: null,
    },
    false,
  );
  assertEquals(blockers, []);
});

Deno.test("computeComplianceBlockers — no profile", () => {
  const blockers = computeComplianceBlockers(null, false);
  assertEquals(blockers, ["no_profile"]);
});

Deno.test("isInComplianceQueue — pending always in queue", () => {
  assertEquals(isInComplianceQueue([], "pending"), true);
});

Deno.test("validateApproveRequest — force requires reason", () => {
  const blockers = computeComplianceBlockers(
    { ...completeIndependent, onboarding_complete: false },
    false,
  );
  const r = validateApproveRequest({ force: true }, blockers, "pending", "superadmin");
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "force_reason_required");
});

Deno.test("validateApproveRequest — force approve with reason", () => {
  const blockers = computeComplianceBlockers(
    { ...completeIndependent, onboarding_complete: false },
    false,
  );
  const r = validateApproveRequest(
    { force: true, reason: "Manual review completed by ops" },
    blockers,
    "pending",
    "superadmin",
  );
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.force, true);
});

Deno.test("validateApproveRequest — driver_admin can force with reason", () => {
  const blockers = computeComplianceBlockers(
    { ...completeIndependent, onboarding_complete: false },
    false,
  );
  const r = validateApproveRequest(
    { force: true, reason: "Manual review completed by ops" },
    blockers,
    "pending",
    "driver_admin",
  );
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.force, true);
});

Deno.test("validateApproveRequest — driver_admin cannot force alone when role missing", () => {
  const blockers = computeComplianceBlockers(
    { ...completeIndependent, onboarding_complete: false },
    false,
  );
  const r = validateApproveRequest(
    { force: true, reason: "Manual review completed by ops" },
    blockers,
    "pending",
    "rides_ops",
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "forbidden");
});

Deno.test("validateApproveRequest — superadmin in roles[] allows force", () => {
  const blockers = computeComplianceBlockers(
    { ...completeIndependent, onboarding_complete: false },
    false,
  );
  const r = validateApproveRequest(
    { force: true, reason: "Manual review completed by ops" },
    blockers,
    "pending",
    ["driver_admin", "superadmin"],
  );
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.force, true);
});
