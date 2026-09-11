import { assertEquals } from "jsr:@std/assert";
import {
  closeWeekLaneForceOpts,
  resolveCloseLaneForceOpts,
} from "./week_close_force_opts.ts";

Deno.test("resolveCloseLaneForceOpts merges forceAllLaneReseals", () => {
  assertEquals(resolveCloseLaneForceOpts({ forceAllLaneReseals: true }), {
    forceFuelReseal: true,
    forceTollReseal: true,
    forceEarningsReseal: true,
  });
});

Deno.test("resolveCloseLaneForceOpts keeps per-lane hints", () => {
  assertEquals(resolveCloseLaneForceOpts({ forceEarningsReseal: true }), {
    forceFuelReseal: false,
    forceTollReseal: false,
    forceEarningsReseal: true,
  });
});

Deno.test("resolveCloseLaneForceOpts empty opts are all false", () => {
  assertEquals(resolveCloseLaneForceOpts(undefined), {
    forceFuelReseal: false,
    forceTollReseal: false,
    forceEarningsReseal: false,
  });
});

Deno.test("closeWeekLaneForceOpts never requests forceAllLaneReseals", () => {
  const opts = closeWeekLaneForceOpts();
  assertEquals(opts.forceAllLaneReseals, undefined);
  assertEquals(opts.forceFuelReseal, undefined);
  assertEquals(opts.forceTollReseal, undefined);
  assertEquals(opts.forceEarningsReseal, undefined);
  assertEquals(resolveCloseLaneForceOpts(opts), {
    forceFuelReseal: false,
    forceTollReseal: false,
    forceEarningsReseal: false,
  });
});
