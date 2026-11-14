/**
 * WRA-43: every "work this week out again" request goes through recon_desk_queue.ts (all 4 arguments), and the
 * calculator publishes once for many requests in a row.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (f: string) => Deno.readTextFile(new URL(f, import.meta.url));

Deno.test("only recon_desk_queue.ts calls recon_enqueue_week_desk, and it always sends the delay", async () => {
  const queue = await read("./recon_desk_queue.ts");
  assert(queue.includes('rpc("recon_enqueue_week_desk"') && queue.includes("p_delay_seconds"), "helper sends all 4 arguments");
  for (const f of ["./recon_worker.ts", "./recon_import_routes.ts", "./recon_week_version_guard.ts"]) {
    const src = await read(f);
    assert(!src.includes('rpc("recon_enqueue_week_desk"'), `${f} goes through the shared helper`);
  }
});

Deno.test("the calculator drops a request when the week was already published after it was queued", async () => {
  const worker = await read("./recon_worker.ts");
  const fn = worker.slice(worker.indexOf("async function publishDeskWhenQuiet("), worker.indexOf("/** Only so often per warm calculator"));
  assert(fn.includes('.select("id, desk_snapshot->>computeStartedAt")'), "reads when the last build STARTED, not when it saved");
  assert(fn.includes("builtFromMs - enqueuedAtMs >= REQUEST_COVERED_MARGIN_MS") && fn.includes('return "already_published"'), "skips covered requests");
  assert(fn.indexOf('return "already_published"') < fn.indexOf('.from("projection_state")'), "the skip comes before the other reads");
  assert(fn.indexOf('return "already_published"') < fn.indexOf("await publishDesk("), "the skip comes before publishing");
  const routes = await read("./recon_routes.ts");
  const build = routes.slice(routes.indexOf("async function buildRunPayload("));
  assert(
    build.indexOf("const computeStartedAt = new Date().toISOString();") < build.indexOf("await computeWeekDesk("),
    "the build stamps its start before reading",
  );
  assert(worker.includes("publishDeskWhenQuiet(orgId, line, weekKey, row.enqueued_at ?? null)"), "the queue time is passed in");
});

Deno.test("a guarded change refreshes every service line of the week, without holding the answer", async () => {
  const guard = await read("./recon_week_version_guard.ts");
  assert(guard.includes("queueWeekDeskRefresh(org, [wk], { heldLine: held })"), "all lines of the week");
  assert(guard.includes("edge.waitUntil(refresh)"), "runs after the answer on the live server");
  const queue = await read("./recon_desk_queue.ts");
  assert(queue.includes("run.service_line !== opts.heldLine ? OTHER_LINE_DELAY_SECONDS : 0"), "other lines wait out the hold");
  assert(queue.includes("Promise.all("), "lines are asked in parallel");
});
