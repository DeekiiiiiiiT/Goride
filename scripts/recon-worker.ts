/**
 * Week calculator. One driver already takes 2–4 seconds, past the edge budget.
 * Cloud Run starts this when the database asks, the request drains a chunk of
 * work, then the process is free to stop. It does not loop while idle.
 *
 *   deno run --allow-env --allow-net --allow-read scripts/recon-worker.ts
 */
import {
  finishNightlyIntegrity,
  loadOpenNightly,
  runNightlyIntegrity,
  runReconWorkerTick,
} from "../supabase/functions/_fleet-server/recon_worker.ts";
import { RECON_WAKE_BUDGET_MS, wakeShouldReturn } from "../supabase/functions/_fleet-server/recon_worker_wake.ts";

const qty = Number(Deno.env.get("RECON_WORKER_QTY") || 2);

async function runWake(nightlyRequested: boolean): Promise<{ processed: number; workflows: number; nightly: boolean }> {
  const started = Date.now();
  let nightly = await loadOpenNightly();
  if (nightlyRequested && !nightly) {
    const startedNightly = await runNightlyIntegrity();
    nightly = { startedAt: startedNightly.startedAt, weekKeys: startedNightly.weekKeys };
  }
  let processed = 0;
  let workflows = 0;
  for (;;) {
    const result = await runReconWorkerTick(qty);
    processed += result.processed;
    workflows += result.workflows;
    if (nightly && result.processed === 0) {
      const done = await finishNightlyIntegrity(nightly.startedAt, nightly.weekKeys);
      if (done.drained) nightly = null;
    }
    if (wakeShouldReturn({
      processed: result.processed,
      workflows: result.workflows,
      elapsedMs: Date.now() - started,
      budgetMs: RECON_WAKE_BUDGET_MS,
    })) {
      break;
    }
  }
  return { processed, workflows, nightly: nightly != null };
}

const port = Deno.env.get("PORT");
if (!port) {
  const result = await runWake(true);
  console.log(JSON.stringify({ reconWake: result }));
} else {
  Deno.serve({ port: Number(port), hostname: "0.0.0.0" }, async (req) => {
    const url = new URL(req.url);
    if (req.method === "GET") return new Response("ok");
    if (req.method !== "POST" || url.pathname !== "/tick") {
      return new Response("not found", { status: 404 });
    }
    const body = await req.json().catch(() => ({})) as { nightly?: boolean };
    try {
      const result = await runWake(body.nightly === true);
      return Response.json(result);
    } catch (e) {
      console.error("[recon-worker]", e instanceof Error ? e.message : e);
      return Response.json({ error: "wake_failed" }, { status: 500 });
    }
  });
}
