/**
 * Week calculator for the LOCAL test copy only (Week Reconciliation done-tests).
 * Same work as a normal wake on live (scripts/recon-worker.ts with PORT): drains the
 * queue and moves close workflows, and finishes an open nightly check, but never
 * STARTS a nightly check (the one-shot mode of recon-worker.ts does, every run, which
 * would keep every close waiting on a check that just started).
 *
 *   deno run --allow-env --allow-net --allow-read --no-check scripts/recon-worker-local.ts [--loop]
 *
 * --loop keeps waking every 2 s until killed (used while browser tests run).
 * --alerts-only runs one alert pass, as live does every 10 minutes while paused.
 * --nightly runs one full nightly check to its end (what live does once a night), so a
 *   fresh copy has a finished check; closes wait for one.
 */
const url = Deno.env.get("SUPABASE_URL") || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  console.error(`recon-worker-local: refuse non-local SUPABASE_URL: ${url}`);
  Deno.exit(1);
}

const { finishNightlyIntegrity, loadOpenNightly, runNightlyIntegrity, runReconWorkerTick } = await import(
  "../supabase/functions/_fleet-server/recon_worker.ts"
);
const { runAlertPass } = await import("../supabase/functions/_fleet-server/recon_alerts.ts");

// --alerts-only: what live does while the calculator is paused (Rev 24).
if (Deno.args.includes("--alerts-only")) {
  console.log(JSON.stringify({ alertsOnly: await runAlertPass() }));
  Deno.exit(0);
}

async function wake(): Promise<{ processed: number; workflows: number }> {
  let processed = 0;
  let workflows = 0;
  for (let i = 0; i < 200; i++) {
    const r = await runReconWorkerTick(2);
    processed += r.processed;
    workflows += r.workflows;
    const nightly = await loadOpenNightly();
    if (nightly && r.processed === 0) await finishNightlyIntegrity(nightly.startedAt, nightly.weekKeys);
    if (r.processed === 0 && r.workflows === 0) break;
  }
  return { processed, workflows };
}

if (Deno.args.includes("--nightly")) {
  if (!(await loadOpenNightly())) await runNightlyIntegrity();
  const started = Date.now();
  while (await loadOpenNightly()) {
    if (Date.now() - started > 5 * 60 * 1000) {
      console.error("recon-worker-local: nightly check did not finish in 5 minutes");
      Deno.exit(1);
    }
    await wake();
    await new Promise((res) => setTimeout(res, 2000));
  }
  console.log(JSON.stringify({ nightly: "finished" }));
  Deno.exit(0);
}

if (Deno.args.includes("--loop")) {
  for (;;) {
    try {
      const r = await wake();
      if (r.processed || r.workflows) console.log(JSON.stringify({ reconLocalWake: r }));
    } catch (e) {
      console.error("[recon-worker-local]", e instanceof Error ? e.message : e);
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
} else {
  console.log(JSON.stringify({ reconLocalWake: await wake() }));
  // Server modules keep timers open; end once the wake is done.
  Deno.exit(0);
}
