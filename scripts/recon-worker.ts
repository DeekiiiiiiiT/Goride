/**
 * Background week calculator.
 *
 * Host decision: one driver already takes 2–4 seconds of CPU, which is past
 * the 1 second edge budget, so this loop is the worker. It calculates one
 * driver or one vehicle at a time, then moves Close forward one step.
 *
 *   deno run --allow-env --allow-net --allow-read scripts/recon-worker.ts
 */
import {
  finishNightlyIntegrity,
  runNightlyIntegrity,
  runReconWorkerTick,
} from "../supabase/functions/_fleet-server/recon_worker.ts";

const port = Deno.env.get("PORT");
if (port) {
  Deno.serve({ port: Number(port), hostname: "0.0.0.0" }, () => new Response("ok"));
}

const qty = Number(Deno.env.get("RECON_WORKER_QTY") || 2);
let lastNightly = 0;
let nightly: { startedAt: string; weekKeys: string[] } | null = null;

for (;;) {
  try {
    const now = Date.now();
    if (!nightly && now - lastNightly > 24 * 60 * 60 * 1000) {
      const started = await runNightlyIntegrity();
      nightly = { startedAt: started.startedAt, weekKeys: started.weekKeys };
      lastNightly = now;
    }
    const result = await runReconWorkerTick(qty);
    if (nightly && result.processed === 0) {
      const done = await finishNightlyIntegrity(nightly.startedAt, nightly.weekKeys);
      if (done.drained) nightly = null;
    }
    if (result.processed === 0 && result.workflows === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (e) {
    console.error("[recon-worker]", e instanceof Error ? e.message : e);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
