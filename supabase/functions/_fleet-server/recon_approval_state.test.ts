import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  APPROVAL_ACTIONS,
  approvalActionLabel,
  canWithdraw,
  decideApprove,
  isApprovalAction,
  rejectReasonError,
} from "./recon_approval_state.ts";

Deno.test("WRA-38: approve goes ahead only for a pending request on an unchanged week", () => {
  assertEquals(decideApprove({ status: "pending_approval", versionAtSend: 7, currentVersion: 7 }), { go: true });
});

Deno.test("S2: same person cannot approve their own request", () => {
  assertEquals(
    decideApprove({
      status: "pending_approval",
      versionAtSend: 7,
      currentVersion: 7,
      preparedBy: "u1",
      approver: "u1",
    }),
    { go: false, code: "SAME_PERSON", markStale: false, status: 403 },
  );
  assertEquals(
    decideApprove({
      status: "pending_approval",
      versionAtSend: 7,
      currentVersion: 7,
      preparedBy: "u1",
      approver: "u2",
    }),
    { go: true },
  );
});

Deno.test("WRA-38: approve on a stale / handled request does nothing", () => {
  assertEquals(decideApprove({ status: "stale", versionAtSend: 7, currentVersion: 7 }),
    { go: false, code: "APPROVAL_STALE", markStale: false, status: 409 });
  for (const status of ["approved", "rejected", "withdrawn"]) {
    assertEquals(decideApprove({ status, versionAtSend: 7, currentVersion: 7 }),
      { go: false, code: "APPROVAL_GONE", markStale: false, status: 409 });
  }
});

Deno.test("WRA-38: the week moved since Send → WEEK_CHANGED and the request becomes stale", () => {
  assertEquals(decideApprove({ status: "pending_approval", versionAtSend: 7, currentVersion: 9 }),
    { go: false, code: "WEEK_CHANGED", markStale: true, status: 409 });
});

Deno.test("WRA-38: only the sender withdraws, and only while pending or stale", () => {
  assertEquals(canWithdraw({ actor: "a", preparedBy: "a", status: "pending_approval" }), { ok: true });
  assertEquals(canWithdraw({ actor: "a", preparedBy: "a", status: "stale" }), { ok: true });
  assertEquals(canWithdraw({ actor: "b", preparedBy: "a", status: "pending_approval" }), { ok: false, code: "NOT_YOUR_REQUEST" });
  assertEquals(canWithdraw({ actor: "a", preparedBy: "a", status: "approved" }), { ok: false, code: "APPROVAL_GONE" });
});

Deno.test("WRA-38: reject needs a reason", () => {
  assertEquals(typeof rejectReasonError(""), "string");
  assertEquals(typeof rejectReasonError("   "), "string");
  assertEquals(rejectReasonError("please upload the file"), null);
});

Deno.test("approval actions: the five desk actions, each with plain words; write off is not one", () => {
  assertEquals([...APPROVAL_ACTIONS], ["waive", "accept_statement_cash", "close", "reopen", "sign_restatement"]);
  for (const a of APPROVAL_ACTIONS) assertEquals(approvalActionLabel(a).length > 0, true);
  assertEquals(isApprovalAction("write_off"), false);
});
