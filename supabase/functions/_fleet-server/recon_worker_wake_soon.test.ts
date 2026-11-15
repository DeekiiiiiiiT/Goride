import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resetWakeSchedule, WAKE_AFTER_MS, wakeWeekCalculatorSoon, type WakeDeps } from "./recon_worker_wake_soon.ts";

function fakeDeps(over: Partial<WakeDeps> & { nowMs?: number } = {}) {
  const ticks: number[] = [];
  const slept: number[] = [];
  let pending: Promise<unknown> | null = null;
  const clock = over.nowMs ?? 1_000_000;
  const deps: WakeDeps = {
    waitUntil: (p) => {
      pending = p;
    },
    isPaused: async () => false,
    tick: async () => {
      ticks.push(clock);
    },
    sleep: async (ms) => {
      slept.push(ms);
    },
    now: () => clock,
    ...over,
  };
  return { deps, ticks, slept, done: () => pending ?? Promise.resolve() };
}

Deno.test("15 Nov: a change wakes the calculator twice — after the 10 s hold and after its quiet window", async () => {
  resetWakeSchedule();
  const f = fakeDeps();
  assertEquals(wakeWeekCalculatorSoon(f.deps), true);
  await f.done();
  assertEquals(f.slept, [WAKE_AFTER_MS[0], WAKE_AFTER_MS[1] - WAKE_AFTER_MS[0]]);
  assertEquals(f.ticks.length, 2);
});

Deno.test("15 Nov: many changes in a row share one pair of wakes", async () => {
  resetWakeSchedule();
  const f = fakeDeps();
  assertEquals(wakeWeekCalculatorSoon(f.deps), true);
  assertEquals(wakeWeekCalculatorSoon(f.deps), false);
  await f.done();
  assertEquals(f.ticks.length, 2);
});

Deno.test("15 Nov: a paused calculator is never woken", async () => {
  resetWakeSchedule();
  const f = fakeDeps({ isPaused: async () => true });
  wakeWeekCalculatorSoon(f.deps);
  await f.done();
  assertEquals(f.ticks.length, 0);
});

Deno.test("15 Nov: outside an edge function (the calculator itself) nothing is scheduled", () => {
  resetWakeSchedule();
  const f = fakeDeps({ waitUntil: null });
  assertEquals(wakeWeekCalculatorSoon(f.deps), false);
});

Deno.test("15 Nov: a failed wake never throws", async () => {
  resetWakeSchedule();
  const f = fakeDeps({ tick: async () => { throw new Error("google down"); } });
  wakeWeekCalculatorSoon(f.deps);
  await f.done();
});
