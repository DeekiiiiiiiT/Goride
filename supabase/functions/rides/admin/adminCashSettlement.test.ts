import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canAdminReleaseCashSettlement,
  canAdminSettleCash,
  shouldBlockCashForceComplete,
} from "./adminCashSettlement.ts";

Deno.test("canAdminReleaseCashSettlement on_trip cash", () => {
  const r = canAdminReleaseCashSettlement({ status: "on_trip", payment_method: "cash" }, true);
  assertEquals(r.ok, true);
});

Deno.test("canAdminReleaseCashSettlement rejects card", () => {
  const r = canAdminReleaseCashSettlement({ status: "on_trip", payment_method: "card" }, true);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "not_cash_trip");
});

Deno.test("canAdminReleaseCashSettlement rejects awaiting", () => {
  const r = canAdminReleaseCashSettlement(
    { status: "awaiting_cash_settlement", payment_method: "cash" },
    true,
  );
  assertEquals(r.ok, false);
});

Deno.test("canAdminSettleCash awaiting cash", () => {
  const r = canAdminSettleCash(
    { status: "awaiting_cash_settlement", payment_method: "cash" },
    true,
  );
  assertEquals(r.ok, true);
});

Deno.test("canAdminSettleCash rejects on_trip", () => {
  const r = canAdminSettleCash({ status: "on_trip", payment_method: "cash" }, true);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "settle_only_awaiting_cash");
});

Deno.test("shouldBlockCashForceComplete blocks cash when flag on", () => {
  assertEquals(
    shouldBlockCashForceComplete({ status: "on_trip", payment_method: "cash" }, true),
    true,
  );
  assertEquals(
    shouldBlockCashForceComplete({ status: "on_trip", payment_method: "card" }, true),
    false,
  );
  assertEquals(
    shouldBlockCashForceComplete({ status: "on_trip", payment_method: "cash" }, false),
    false,
  );
});
