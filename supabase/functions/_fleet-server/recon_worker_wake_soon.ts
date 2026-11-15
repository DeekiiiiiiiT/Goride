/**
 * Wake the week calculator right after a person changes a week (15 Nov 2026), instead of waiting for
 * the once-a-minute database wake. Two wakes: one just after the 10 s publish hold ends, one more after
 * the calculator's own quiet window (it counts its own driver-week work as a change). Each wake is one
 * signed call to the Cloud Run /tick; Cloud Run still sleeps when idle, so the bill is the same.
 *
 * Never throws and never blocks the answer: it runs after the response (EdgeRuntime.waitUntil). Does
 * nothing when the calculator is paused (same rule as private.invoke_recon_worker_wake), when the
 * Google key is missing, or outside an edge function (the calculator itself never wakes itself).
 */
import { getServiceClient } from "./service_client.ts";
import { googleIdToken, readServiceAccount, reconWorkerUri } from "./recon_worker_google.ts";

/** Just after the 10 s hold (recon.claim_week_change) and the 10 s quiet window (recon_publish_timing). */
export const WAKE_AFTER_MS = [12_000, 35_000];
/** Many changes in a row share one pair of wakes. */
const SHARE_WAKES_WITHIN_MS = 8_000;

export type WakeDeps = {
  waitUntil: ((p: Promise<unknown>) => void) | null;
  isPaused: () => Promise<boolean>;
  tick: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

async function calculatorPaused(): Promise<boolean> {
  const { data, error } = await getServiceClient().rpc("recon_worker_status");
  if (error) return true; // unsure → leave it to the database wake
  return Boolean((data as { emergencyOff?: boolean } | null)?.emergencyOff);
}

async function tickCalculator(): Promise<void> {
  const sa = readServiceAccount();
  if (!sa) return;
  const uri = await reconWorkerUri(sa);
  const idToken = await googleIdToken(sa, uri);
  const res = await fetch(`${uri}/tick`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ nightly: false, alertsOnly: false }),
  });
  await res.body?.cancel().catch(() => {});
}

function defaultDeps(): WakeDeps {
  const edge = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  return {
    waitUntil: edge?.waitUntil ? (p) => edge.waitUntil!(p) : null,
    isPaused: calculatorPaused,
    tick: tickCalculator,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}

let lastScheduledAt = 0;

/** For tests. */
export function resetWakeSchedule(): void {
  lastScheduledAt = 0;
}

/** Returns true when a pair of wakes was scheduled. */
export function wakeWeekCalculatorSoon(deps: WakeDeps = defaultDeps()): boolean {
  if (!deps.waitUntil) return false;
  const now = deps.now();
  if (now - lastScheduledAt < SHARE_WAKES_WITHIN_MS) return false;
  lastScheduledAt = now;
  const run = (async () => {
    let waited = 0;
    for (const at of WAKE_AFTER_MS) {
      await deps.sleep(at - waited);
      waited = at;
      try {
        if (await deps.isPaused()) return;
        await deps.tick();
      } catch (e) {
        console.warn("[recon] calculator wake failed", e instanceof Error ? e.message : e);
      }
    }
  })();
  deps.waitUntil(run);
  return true;
}
