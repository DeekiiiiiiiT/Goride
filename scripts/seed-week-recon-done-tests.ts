/**
 * Week Reconciliation done-tests: second half of the seed (LOCAL database only).
 * Run after e2e/fixtures/week-recon-done-test-seed.sql. Uses the real server code:
 * the calculator's "create the ended weeks" step, then one desk publish per week.
 *
 *   deno run --allow-env --allow-net --allow-read --allow-write scripts/seed-week-recon-done-tests.ts
 *
 * Needs SUPABASE_URL (http://127.0.0.1:54321) and SUPABASE_SERVICE_ROLE_KEY.
 * Writes node_modules/.cache/week-recon-seed.json with the week keys each done-test uses.
 */
const url = Deno.env.get("SUPABASE_URL") || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url.replace(/\/$/, ""))) {
  console.error(`seed-week-recon-done-tests: refuse non-local SUPABASE_URL: ${url}`);
  Deno.exit(1);
}

const ORG = "f6020000-0000-4000-8000-000000000099";
const UPLOAD_ORG = "f6020000-0000-4000-8000-000000000097";
const UPLOAD_WEEK = "2026-03-16";
const TAG_ORG = "f6020000-0000-4000-8000-000000000096";
const TAG_WEEK = "2026-03-09";

const { getServiceClient } = await import("../supabase/functions/_fleet-server/service_client.ts");
const { publishWeekDesk } = await import("../supabase/functions/_fleet-server/recon_routes.ts");

const sb = getServiceClient();
const recon = sb.schema("recon");

function must<T>(label: string, r: { data?: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return r.data as T;
}

must("ensure weeks", await recon.rpc("ensure_ended_week_runs", { p_org: ORG }));
const runs = must<Array<{ id: string; week_key: string }>>(
  "runs",
  await recon.from("week_runs").select("id, week_key").eq("organization_id", ORG).eq("service_line", "rideshare")
    .order("week_key", { ascending: true }),
);
if (runs.length !== 20) throw new Error(`expected 20 week runs, got ${runs.length}`);
const weeks = runs.map((r) => String(r.week_key).slice(0, 10));
const runId = new Map(runs.map((r) => [String(r.week_key).slice(0, 10), r.id]));

// Newest first: W0 is the last ended week.
const W = (n: number) => weeks[weeks.length - 1 - n];
const plan = {
  org: ORG,
  allWeeks: weeks,
  /** done-test 10: Mark no activity twice quickly. */
  doubleClick: W(0),
  /** done-test 9: two tabs, same week. */
  twoTabs: W(1),
  /** done-test 2: one seeded driver blocker (fuel statement missing). */
  oneTruth: W(2),
  /** done-test 16: Uber missing, so Trips & earnings is locked. */
  locked: W(3),
  /** done-test 12: shared link to the fuel step. */
  sharedLink: W(4),
  /** done-test 7 / 11: calculator paused. */
  paused: W(5),
  /** done-test 8c: viewer on the Close step. */
  viewerClose: W(6),
  /** done-test 4k: closed by legacy clean-up, cannot be reopened. */
  legacy: weeks[0],
  /** done-test 3: Upload Co (its own company) and the week of the sample Uber files. */
  uploadOrg: UPLOAD_ORG,
  uploadWeek: UPLOAD_WEEK,
  /** done-test 9b: Tag Co (one toll tag) and its one week. */
  tagOrg: TAG_ORG,
  tagWeek: TAG_WEEK,
};

// done-test 2: the calculator has worked out both drivers' weeks (the saved check only
// counts once driver weeks exist), plus a driver blocker the desk publish keeps and counts.
for (const driverId of ["wr-driver-1", "wr-driver-2"]) {
  must(`unit ${driverId}`, await recon.from("projection_state").insert({
    organization_id: ORG,
    unit_kind: "driver_week",
    week_key: plan.oneTruth,
    driver_id: driverId,
    status: "fresh",
    inputs_hash: "done-test-seed",
    computed_at: new Date(Date.now() - 120_000).toISOString(),
    updated_at: new Date(Date.now() - 120_000).toISOString(),
  }));
}
must("blocker", await recon.from("week_blockers").insert({
  organization_id: ORG,
  week_key: plan.oneTruth,
  service_line: "rideshare",
  driver_id: "wr-driver-1",
  code: "FUEL_STATEMENT_MISSING",
  severity: "block",
  fingerprint: "FUEL_STATEMENT_MISSING:wr-driver-1:",
  message: "Fuel statement missing (done-test seed)",
}));

// done-test 4k: the oldest week was closed by the legacy clean-up.
must("legacy close", await recon.from("week_runs").update({
  state: "closed",
  closed_at: new Date().toISOString(),
  closed_by: "system",
}).eq("id", runId.get(plan.legacy)!));
must("legacy event", await recon.from("run_events").insert({
  run_id: runId.get(plan.legacy)!,
  actor: "system",
  kind: "legacy_cleanup",
  payload: { seed: "week-recon-done-tests" },
  line: "rideshare",
  week_key: plan.legacy,
  reason: "Old week closed by the clean-up (done-test seed)",
}));

// Every week, closed ones too: the calculator prepares closed weeks the same way.
for (const week of weeks) {
  const payload = await publishWeekDesk(ORG, "rideshare", week, "done-test-seed");
  if (!payload) throw new Error(`desk publish failed for ${week}`);
}

// Not test-results/: Playwright empties that folder when it starts.
// done-test 3: Upload Co's week, created and published like any other.
must("ensure upload weeks", await recon.rpc("ensure_ended_week_runs", { p_org: UPLOAD_ORG }));
if (!(await publishWeekDesk(UPLOAD_ORG, "rideshare", UPLOAD_WEEK, "done-test-seed"))) {
  throw new Error(`desk publish failed for Upload Co ${UPLOAD_WEEK}`);
}
// done-test 9b: Tag Co's week (it has a toll tag, so the Tag account step shows).
must("ensure tag weeks", await recon.rpc("ensure_ended_week_runs", { p_org: TAG_ORG }));
if (!(await publishWeekDesk(TAG_ORG, "rideshare", TAG_WEEK, "done-test-seed"))) {
  throw new Error(`desk publish failed for Tag Co ${TAG_WEEK}`);
}

await Deno.mkdir("node_modules/.cache", { recursive: true });
await Deno.writeTextFile("node_modules/.cache/week-recon-seed.json", JSON.stringify(plan, null, 2));
console.log(`week recon done-test seed: ok (${weeks.length} weeks, ${weeks[0]} → ${weeks[weeks.length - 1]})`);
// Server modules leave timers open; end the script once the seed is written.
Deno.exit(0);
