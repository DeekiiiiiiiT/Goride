import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countOtherApprovers, deskCashMismatches, historyItem } from "./recon_desk_reads.ts";

Deno.test("cash check: only drivers with a difference or an acceptance, biggest first; acceptance must still match", () => {
  const rows = [
    { driver_id: "a", driver_name: "Kenny", metadata: { financeCore: { cashSourceMismatch: 0, uberCash: 100, uberTripCash: 100 } } },
    { driver_id: "b", driver_name: "Phillip", metadata: { financeCore: { cashSourceMismatch: -12.5, uberCash: 87.5, uberTripCash: 100 } } },
    {
      driver_id: "c",
      driver_name: null,
      metadata: {
        financeCore: {
          cashSourceMismatch: 40,
          uberCash: 140,
          uberTripCash: 100,
          cashSourceAck: { reason: "Statement right", mismatchAtAck: 40 },
        },
      },
    },
    {
      driver_id: "d",
      metadata: {
        financeCore: {
          cashSourceMismatch: 5,
          uberCash: 105,
          uberTripCash: 100,
          cashSourceAck: { reason: "Old acceptance", mismatchAtAck: 2 },
        },
      },
    },
  ];
  const out = deskCashMismatches(rows, "2026-11-02");
  assertEquals(out.map((m) => m.driverId), ["c", "b", "d"]);
  assertEquals(out.find((m) => m.driverId === "c")?.accepted, true);
  assertEquals(out.find((m) => m.driverId === "d")?.accepted, false);
  assertEquals(out.find((m) => m.driverId === "b")?.accepted, false);
});

Deno.test("history: labels, self-approved and prepared/approved by names", () => {
  const names = new Map([["u1", "Deeki"], ["u2", "Manager"]]);
  const self = historyItem({
    id: 1, kind: "week_close_started", step: "close", actor: "u1", at: "2026-11-10T10:00:00Z", reason: "Clean week",
    payload: null, prepared_by: "u1", approved_by: "u1", self_approved: true, status: "applied",
  }, names);
  assertEquals(self.label, "Closed the week");
  assertEquals(self.approval, "Self-approved");
  assertEquals(self.by, "Deeki");
  const pair = historyItem({
    id: 2, kind: "approval_request", step: null, actor: "u1", at: "2026-11-10T11:00:00Z", reason: "Please",
    payload: { label: "Reopen week" }, prepared_by: "u1", approved_by: "u2", self_approved: false, status: "approved",
  }, names);
  assertEquals(pair.label, "Reopen week — sent for approval");
  assertEquals(pair.approval, "Prepared by Deeki · Approved by Manager");
  const sys = historyItem({
    id: 3, kind: "data_restatement", step: null, actor: "system", at: "2026-11-10T12:00:00Z", reason: null,
    payload: null, prepared_by: "system", approved_by: null, self_approved: false, status: "applied",
  }, names);
  assertEquals(sys.by, "System");
  assertEquals(sys.system, true);
});

Deno.test("other approvers: roles with recon.approve plus the owner, never me", () => {
  const members = [
    { userId: "me", roleName: "fleet_manager" },
    { userId: "acct", roleName: "fleet_accountant" },
    { userId: "viewer", roleName: "fleet_viewer" },
  ];
  assertEquals(countOtherApprovers(members, "owner", "me"), 2);
  assertEquals(countOtherApprovers([{ userId: "me", roleName: "fleet_manager" }], "me", "me"), 0);
});

Deno.test("step 6 money read: names come from the driver records (driver_financial_periods has no name column)", async () => {
  const { withDriverNames } = await import("./recon_desk_reads.ts");
  const kv: Record<string, unknown> = {
    "driver:d1": { name: "Kenny Gregory Rattray" },
    "driver:d2": { driverName: "Phillip Bailey" },
  };
  const rows = await withDriverNames(
    [{ driver_id: "d1", metadata: null }, { driver_id: "d2", metadata: null }, { driver_id: "d3", metadata: null }],
    async (key) => {
      if (key === "driver:d3") throw new Error("kv down");
      return kv[key] ?? null;
    },
  );
  assertEquals(rows.map((r) => r.driver_name), ["Kenny Gregory Rattray", "Phillip Bailey", null]);
});

Deno.test("step 6 money read never asks for a driver_name column", async () => {
  const src = await Deno.readTextFile(new URL("./recon_routes.ts", import.meta.url));
  const i = src.indexOf("/runs/:line/:weekKey/money");
  const body = src.slice(i, src.indexOf("app.get(", i + 10));
  assertEquals(/select\("[^"]*driver_name/.test(body), false);
});
