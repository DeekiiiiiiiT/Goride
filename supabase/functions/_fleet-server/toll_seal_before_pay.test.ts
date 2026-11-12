import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertTollWeekSealedForPay,
  decideTollSealedForPay,
  shouldCheckTollSeal,
} from "./toll_seal_before_pay.ts";
import { SettlementCommandError } from "./settlement_commands.ts";
const WEEK = "2026-03-10";

Deno.test("decideTollSealedForPay: flag off → allowed", () => {
  assertEquals(
    decideTollSealedForPay({
      flagOn: false,
      isV2: true,
      latestTollWeekStatus: null,
      oldSystemSealed: false,
    }),
    true,
  );
});

Deno.test("decideTollSealedForPay: v2 closed → allowed", () => {
  assertEquals(
    decideTollSealedForPay({
      flagOn: true,
      isV2: true,
      latestTollWeekStatus: "closed",
      oldSystemSealed: false,
    }),
    true,
  );
});

Deno.test("decideTollSealedForPay: v2 draft → refused", () => {
  assertEquals(
    decideTollSealedForPay({
      flagOn: true,
      isV2: true,
      latestTollWeekStatus: "draft",
      oldSystemSealed: true,
    }),
    false,
  );
});

Deno.test("decideTollSealedForPay: v2 no statement → refused", () => {
  assertEquals(
    decideTollSealedForPay({
      flagOn: true,
      isV2: true,
      latestTollWeekStatus: null,
      oldSystemSealed: true,
    }),
    false,
  );
});

Deno.test("decideTollSealedForPay: old system sealed → allowed", () => {
  assertEquals(
    decideTollSealedForPay({
      flagOn: true,
      isV2: false,
      latestTollWeekStatus: null,
      oldSystemSealed: true,
    }),
    true,
  );
});

Deno.test("decideTollSealedForPay: old system not sealed → refused", () => {
  assertEquals(
    decideTollSealedForPay({
      flagOn: true,
      isV2: false,
      latestTollWeekStatus: "closed",
      oldSystemSealed: false,
    }),
    false,
  );
});

Deno.test("decideTollSealedForPay: v2 rpc failed → refused", () => {
  assertEquals(
    decideTollSealedForPay({
      flagOn: true,
      isV2: false,
      latestTollWeekStatus: "closed",
      oldSystemSealed: true,
      v2EnabledRpcFailed: true,
    }),
    false,
  );
});

Deno.test("shouldCheckTollSeal: collect and cash receipt never gated", () => {
  assertEquals(shouldCheckTollSeal("collect", false), false);
  assertEquals(shouldCheckTollSeal("pay", true), false);
  assertEquals(shouldCheckTollSeal("write_off", true), false);
});

Deno.test("shouldCheckTollSeal: pay and write_off gated", () => {
  assertEquals(shouldCheckTollSeal("pay", false), true);
  assertEquals(shouldCheckTollSeal("write_off", false), true);
});

Deno.test("assertTollWeekSealedForPay throws with injected deps", async () => {
  let err: unknown;
  try {
    await assertTollWeekSealedForPay(
      {
        organizationId: "org-1",
        weekAnchor: WEEK,
        authHeader: "Bearer x",
      },
      {
        isFeatureEnabled: () => Promise.resolve(true),
        fetchV2Enabled: () => Promise.resolve(true),
        fetchLatestTollWeekStatus: () => Promise.resolve("draft"),
        probeOldSystemSealed: () => Promise.resolve(true),
      },
    );
  } catch (e) {
    err = e;
  }
  assertEquals(err instanceof SettlementCommandError, true);
  const se = err as SettlementCommandError;
  assertEquals(se.code, "TOLL_WEEK_NOT_SEALED");
  assertEquals(se.status, 409);
  assertEquals(se.details?.weekKey, WEEK);
});

Deno.test("assertTollWeekSealedForPay: flag off is no-op", async () => {
  await assertTollWeekSealedForPay(
    {
      organizationId: "org-1",
      weekAnchor: WEEK,
      authHeader: null,
    },
    {
      isFeatureEnabled: () => Promise.resolve(false),
      fetchV2Enabled: () => {
        throw new Error("should not call v2 when flag off");
      },
    },
  );
});

Deno.test("settle-from-balance: either week not sealed refuses", async () => {
  const deps = {
    isFeatureEnabled: () => Promise.resolve(true),
    fetchV2Enabled: () => Promise.resolve(false),
    probeOldSystemSealed: (_org: string, week: string) =>
      Promise.resolve(week === "2026-03-10"),
  };
  await assertTollWeekSealedForPay(
    { organizationId: "org", weekAnchor: "2026-03-10", authHeader: "Bearer x" },
    deps,
  );
  let err: unknown;
  try {
    await assertTollWeekSealedForPay(
      { organizationId: "org", weekAnchor: "2026-03-17", authHeader: "Bearer x" },
      deps,
    );
  } catch (e) {
    err = e;
  }
  assertEquals(err instanceof SettlementCommandError, true);
  assertEquals((err as SettlementCommandError).code, "TOLL_WEEK_NOT_SEALED");
  assertEquals((err as SettlementCommandError).details?.weekKey, "2026-03-17");
});
