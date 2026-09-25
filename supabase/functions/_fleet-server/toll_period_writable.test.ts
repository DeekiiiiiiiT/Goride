import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  decideTollPeriodSealed,
  deriveTollSealChip,
  periodSealedBody,
  TollPeriodSealedError,
  getTollPeriodWriteGuardMode,
} from "./toll_period_writable.ts";

Deno.test("decideTollPeriodSealed: period sealed wins", () => {
  assertEquals(
    decideTollPeriodSealed({ periodState: "sealed", hasClosedTollStatement: false }),
    { sealed: true, source: "period", state: "sealed" },
  );
});

Deno.test("decideTollPeriodSealed: reopened allows writes despite closed statements", () => {
  assertEquals(
    decideTollPeriodSealed({ periodState: "reopened", hasClosedTollStatement: true }),
    { sealed: false, source: "period", state: "reopened" },
  );
});

Deno.test("decideTollPeriodSealed: closed week_statements seal when no period row", () => {
  assertEquals(
    decideTollPeriodSealed({ periodState: null, hasClosedTollStatement: true }),
    { sealed: true, source: "week_statements", state: null },
  );
});

Deno.test("decideTollPeriodSealed: ready + no statements = writable", () => {
  assertEquals(
    decideTollPeriodSealed({ periodState: "ready", hasClosedTollStatement: false }),
    { sealed: false, source: "none", state: "ready" },
  );
});

Deno.test("decideTollPeriodSealed: ready + closed statements = sealed via statements", () => {
  assertEquals(
    decideTollPeriodSealed({ periodState: "ready", hasClosedTollStatement: true }),
    { sealed: true, source: "week_statements", state: "ready" },
  );
});

Deno.test("decideTollPeriodSealed: open / in_review stay writable without closed statements", () => {
  assertEquals(
    decideTollPeriodSealed({ periodState: "open", hasClosedTollStatement: false }).sealed,
    false,
  );
  assertEquals(
    decideTollPeriodSealed({ periodState: "in_review", hasClosedTollStatement: false }).sealed,
    false,
  );
});

Deno.test("periodSealedBody: 409 PERIOD_SEALED envelope", () => {
  const err = new TollPeriodSealedError("2026-09-07", "week_statements");
  assertEquals(err.status, 409);
  assertEquals(err.code, "PERIOD_SEALED");
  const body = periodSealedBody(err);
  assertEquals(body.error, "PERIOD_SEALED");
  assertEquals(body.source, "week_statements");
  assertEquals(body.reopenPath, "/toll-reconciliation/periods/2026-09-07/reopen");
});

Deno.test("getTollPeriodWriteGuardMode: defaults to enforce; shadow/off aliases", () => {
  const prev = Deno.env.get("TOLL_PERIOD_WRITE_GUARD");
  try {
    Deno.env.delete("TOLL_PERIOD_WRITE_GUARD");
    assertEquals(getTollPeriodWriteGuardMode(), "enforce");
    Deno.env.set("TOLL_PERIOD_WRITE_GUARD", "shadow");
    assertEquals(getTollPeriodWriteGuardMode(), "shadow");
    Deno.env.set("TOLL_PERIOD_WRITE_GUARD", "on");
    assertEquals(getTollPeriodWriteGuardMode(), "enforce");
    Deno.env.set("TOLL_PERIOD_WRITE_GUARD", "off");
    assertEquals(getTollPeriodWriteGuardMode(), "off");
  } finally {
    if (prev === undefined) Deno.env.delete("TOLL_PERIOD_WRITE_GUARD");
    else Deno.env.set("TOLL_PERIOD_WRITE_GUARD", prev);
  }
});

Deno.test("deriveTollSealChip: Reviewed / Sealed / Closed priority", () => {
  assertEquals(deriveTollSealChip({ periodState: "ready" }), "reviewed");
  assertEquals(deriveTollSealChip({ periodState: "sealed" }), "sealed");
  assertEquals(deriveTollSealChip({ hasClosedTollStatement: true }), "sealed");
  assertEquals(deriveTollSealChip({ weekClosed: true, periodState: "ready" }), "closed");
  assertEquals(deriveTollSealChip({}), null);
});
