/**
 * Toll disputes — Part D done-tests (docs/toll-architecture-gap-audit.md, round P, L2.6 step 0).
 *
 * LOCAL DATABASE ONLY. Each done-test is one plain story on its own fresh test company:
 *   files come in through the real import (toll_sys_import), the REAL matcher runs (runTollMatcher: claim →
 *   pure engine → store, then the nightly sweep), people press the same buttons the screens send
 *   (public.toll_v2_command as the signed-in owner; the driver's Mark as sent through the driver route's RPC),
 *   and the money is checked after every step (ledger accounts, the week desk read, the nightly checks).
 *
 * Time passing is stood in for in two plain ways only, and each story says which it uses:
 *   - the files are dated in the past (a trip 10 days ago, a refund paid last week);
 *   - "the driver sent it N days ago": the dispute's sent clock (clock_from / sent_at) is moved back N days;
 *     "the deadline passed": the dispute's deadline is moved to an hour ago.
 *
 * Run (Docker + `npx supabase start` first):
 *   deno run --config scripts/toll-done-tests/deno.json --allow-net --allow-env --allow-read scripts/toll-done-tests/run.ts
 * Optional: TOLL_DT_ONLY=5c,14 to run some stories. Every test company is deleted at the end unless TOLL_DT_KEEP=1.
 */
import { Client } from "jsr:@db/postgres@0.19.5";
import { runTollMatcher } from "../../supabase/functions/_fleet-server/toll_v2_matcher_run.ts";

const DB_URL = Deno.env.get("TOLL_DT_DB_URL") ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):/.test(DB_URL)) {
  console.error("Refusing to run: the done-tests run on the local database only.");
  Deno.exit(2);
}

const db = new Client(DB_URL);
await db.connect();

// ───────────────────────── helpers ─────────────────────────

type Row = Record<string, unknown>;
const q = async <T = Row>(sql: string, args: unknown[] = []): Promise<T[]> =>
  (await db.queryObject<T>({ text: sql, args })).rows;
const one = async <T = Row>(sql: string, args: unknown[] = []): Promise<T> => {
  const r = await q<T>(sql, args);
  if (!r.length) throw new Error(`no row: ${sql.slice(0, 80)}`);
  return r[0]!;
};
const val = async <T = unknown>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await one(sql, args)) as Row)[0] as T;

class Fail extends Error {}
function check(ok: unknown, msg: string, detail?: unknown): asserts ok {
  if (!ok) throw new Fail(detail === undefined ? msg : `${msg} — got ${JSON.stringify(detail)}`);
}
const J = (minor: number) => `J$${(minor / 100).toFixed(2)}`;

/** Jamaica calendar day, n days from today (negative = past), as YYYY-MM-DD. */
async function day(n: number): Promise<string> {
  return await val<string>(`SELECT ((now() AT TIME ZONE 'America/Jamaica')::date + $1::int)::text`, [n]);
}
/** A Jamaica local time on that day as an ISO timestamp. */
async function at(n: number, hhmm: string): Promise<string> {
  return await val<string>(
    `SELECT to_char((((now() AT TIME ZONE 'America/Jamaica')::date + $1::int) + $2::time) AT TIME ZONE 'America/Jamaica',
                    'YYYY-MM-DD"T"HH24:MI:SSOF')`,
    [n, hhmm],
  );
}
async function weekStart(n = 0): Promise<string> {
  return await val<string>(`SELECT (ledger.jamaica_week_start(now()) + $1::int * 7)::text`, [n]);
}

type Co = { org: string; owner: string; name: string; tag: string };
const made: Co[] = [];

async function company(name: string, opts: { lostBearer?: "fleet" | "driver"; riderPays?: boolean } = {}): Promise<Co> {
  const org = crypto.randomUUID();
  const owner = crypto.randomUUID();
  const tag = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  await q(`INSERT INTO auth.users (id, email) VALUES ($1::uuid, $2)`, [owner, `dt-${tag}-${org.slice(0, 8)}@example.com`]);
  await q(
    `INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status)
     VALUES ($1::uuid, $2::uuid, $3, $4, 'fleet', 'active')`,
    [org, owner, `Toll done-test ${name}`, `toll-dt-${tag}-${org.slice(0, 8)}`],
  );
  await q(
    `INSERT INTO toll.switch_state (organization_id, tolls_v2, toll_disputes, logged_trips, rider_pays_driver, toll_disputes_on_at)
     VALUES ($1::uuid, true, true, true, $2, now() - interval '2 days')`,
    [org, opts.riderPays ?? true],
  );
  await q(`SELECT toll_system.ensure_accounts($1::uuid)`, [org]);
  await q(
    `INSERT INTO toll.plaza_rules (plaza_id, auto_duplicate_window_minutes, review_duplicate_window)
     VALUES ('dt-pz', 10, 'same_day') ON CONFLICT (plaza_id) DO NOTHING`,
  );
  const co = { org, owner, name, tag };
  made.push(co);
  await cmd(co, "approve_settings_seed", { note: "done-test seed", self_approval_reason: "done-test company" });
  // Plaza prices are shared by every company: the first test company adds the Uber rate, the rest find it.
  const hasRate = Number(await val(
    `SELECT count(*) FROM toll.plaza_rates WHERE plaza_id = 'dt-pz' AND rate_kind = 'platform_refund' AND platform = 'uber'`,
  )) > 0;
  await cmd(co, "change_toll_settings", {
    note: "Done-test company settings",
    self_approval_reason: "done-test company",
    ...(hasRate ? {} : { plaza_rates_add: [{ plaza_id: "dt-pz", platform: "uber", rate_minor: 37000, effective_from: "2020-01-01" }] }),
    dispute_policy: { lost_bearer: opts.lostBearer ?? "fleet" },
  });
  return co;
}

/** A button press on a screen: public.toll_v2_command as the signed-in owner. */
async function cmd(co: Co, intent: string, body: Row): Promise<Row> {
  const tx = db.createTransaction(`cmd_${crypto.randomUUID().replaceAll("-", "")}`);
  await tx.begin();
  try {
    await tx.queryArray({
      text: `SELECT set_config('request.jwt.claims', $1, true)`,
      args: [JSON.stringify({ sub: co.owner, role: "authenticated", app_metadata: { organizationId: co.org } })],
    });
    await tx.queryArray(`SET LOCAL ROLE authenticated`);
    const r = await tx.queryObject<{ r: Row }>({
      text: `SELECT public.toll_v2_command($1, $2::jsonb) AS r`,
      args: [intent, JSON.stringify({ command_id: crypto.randomUUID(), ...body })],
    });
    await tx.commit();
    return r.rows[0]!.r;
  } catch (e) {
    try {
      await tx.rollback();
    } catch { /* already closed */ }
    const cause = (e as { cause?: { fields?: { message?: string; detail?: string } } }).cause;
    if (cause?.fields?.message) throw new Error(`${cause.fields.message}${cause.fields.detail ? ` (${cause.fields.detail})` : ""}`);
    throw e;
  }
}
async function refused(co: Co, intent: string, body: Row): Promise<string> {
  try {
    await cmd(co, intent, body);
  } catch (e) {
    return String((e as Error).message ?? e).split(" (")[0]!;
  }
  return "SUCCEEDED";
}

async function importRows(co: Co, kind: string, rows: Row[]): Promise<void> {
  await q(`SELECT public.toll_sys_import($1::uuid, $2, $3::jsonb, $4, 'smoke')`, [
    co.org,
    kind,
    JSON.stringify(rows),
    `dt-${kind}-${crypto.randomUUID()}`,
  ]);
}

/** An Uber trip with its toll payback, and the tag toll crossed during it. */
async function uberTripWithToll(
  co: Co,
  ref: string,
  dayN: number,
  opts: { toll?: number; paid?: number; driver?: string } = {},
): Promise<void> {
  const driver = opts.driver ?? "dt-d1";
  await importRows(co, "uber", [{
    row_type: "trip", platform_trip_id: `${ref}-trip`, driver_id: driver, vehicle_id: "v1",
    request_at: await at(dayN, "15:00"), dropoff_at: await at(dayN, "15:40"), payment_method: "card",
    toll_payback_minor: opts.paid ?? 37000,
  }]);
  await tagToll(co, ref, dayN, "15:20", opts.toll ?? 39000, driver);
}
async function tagToll(co: Co, ref: string, dayN: number, hhmm: string, amount: number, driver = "dt-d1") {
  await importRows(co, "tag_statement", [{
    source_ref: `${ref}-toll`, occurred_at: await at(dayN, hhmm), amount_minor: amount,
    plaza_id: "dt-pz", vehicle_id: "v1", driver_id: driver,
  }]);
}
/** Uber's weekly report line: an adjustment (a dispute refund) paid on a day. */
async function uberAdjustment(co: Co, ref: string, paidDayN: number, amount: number, driver = "dt-d1") {
  await importRows(co, "uber", [{ row_type: "adjustment", reference: ref, driver_id: driver, paid_on: await day(paidDayN), amount_minor: amount }]);
}
/** "Uber's report for that week was uploaded" (Week Reconciliation upload covering Mon–Sun). */
async function uberWeekUploaded(co: Co, weekStartDate: string): Promise<void> {
  await q(
    `INSERT INTO fleet.import_batches (id, organization_id, file_name, status, type, legacy_kv_id, payload_json,
       source_id, week_keys, coverage_start, coverage_end)
     VALUES ($1, $2, 'uber-week.csv', 'committed', 'merged_import', $3, '{}'::jsonb, 'uber_bundle',
       ARRAY[$4::date], $4::date, $4::date + 6)
     ON CONFLICT (id) DO NOTHING`,
    [`dt-cov-${co.org}-${weekStartDate}`, co.org, `dt-kv-${co.org}-${weekStartDate}`, weekStartDate],
  );
}

/** The real matcher, then the nightly sweep (it runs at the end of every matcher run). */
async function runMatcher(co: Co) {
  return await runTollMatcher(async (fn, args) => {
    try {
      const keys = Object.keys(args);
      const params = keys.map((k, i) => {
        const v = args[k];
        const cast = k === "p_company" || k === "p_claim_id" ? "::uuid" : typeof v === "object" ? "::jsonb" : typeof v === "number" ? "::int" : "";
        return `${k} => $${i + 1}${cast}`;
      });
      const r = await db.queryObject<{ r: unknown }>({
        text: `SELECT public.${fn}(${params.join(", ")}) AS r`,
        args: keys.map((k) => (typeof args[k] === "object" && args[k] !== null ? JSON.stringify(args[k]) : args[k])),
      });
      return { data: r.rows[0]?.r ?? null, error: null };
    } catch (e) {
      return { data: null, error: { message: String((e as Error).message ?? e) } };
    }
  }, co.org);
}

type Dispute = {
  id: string; version: number; state: string; owed_minor: number; recovered_minor: number; bearer: string | null;
  opened_late: boolean; close_reason: string | null; posted_in_week_key: string | null; charge_id: string;
  reopens_id: string | null; charge_week_key: string;
};
async function disputesOf(co: Co, ref: string): Promise<Dispute[]> {
  return await q<Dispute>(
    `SELECT d.id::text, d.version::int, d.state, d.owed_minor::int, d.recovered_minor::int, d.bearer, d.opened_late,
            d.close_reason, d.posted_in_week_key::text, d.charge_id::text, d.reopens_id::text, d.charge_week_key::text
     FROM toll.disputes d JOIN toll.charges c ON c.id = d.charge_id AND c.organization_id = d.organization_id
     WHERE d.organization_id = $1::uuid AND c.source_ref = $2 AND d.close_reason IS DISTINCT FROM 'undo'
     ORDER BY d.created_at`,
    [co.org, `${ref}-toll`],
  );
}
async function dispute(co: Co, ref: string): Promise<Dispute> {
  const all = await disputesOf(co, ref);
  check(all.length > 0, `no dispute for ${ref}`);
  return all[all.length - 1]!;
}
async function chargeOf(co: Co, ref: string) {
  return await one<{ id: string; version: number; state: string; week: string }>(
    `SELECT c.id::text, c.version::int, toll_system.charge_state($1::uuid, c.id) AS state,
            toll_system.charge_counted_week($1::uuid, c.id, c.week_key)::text AS week
     FROM toll.charges c WHERE c.organization_id = $1::uuid AND c.source_ref = $2`,
    [co.org, `${ref}-toll`],
  );
}
async function paybackOf(co: Co, reference: string) {
  return await one<{ id: string; version: number }>(
    `SELECT id::text, version::int FROM toll.paybacks WHERE organization_id = $1::uuid AND reference = $2`,
    [co.org, reference],
  );
}

/** Ledger balances, in J$ minor, read so that "money owed to the fleet" is positive. */
async function money(co: Co) {
  const b = async (suffix: string) =>
    Number(await val(
      `SELECT coalesce((SELECT balance_minor FROM ledger.accounts WHERE account_key = $1), 0)`,
      [`org:${co.org}:toll:${suffix}`],
    ));
  return {
    owedByUber: -(await b("receivable_platform_dispute")),
    driverOwes: -(await b("receivable_driver")),
    fleetExpense: -(await b("expense")),
  };
}
async function nightlyClean(co: Co) {
  const bad = await q<{ name: string; detail: string }>(
    `SELECT name, detail FROM toll_system.nightly_checks($1::uuid) WHERE NOT ok`,
    [co.org],
  );
  check(bad.length === 0, "nightly money checks", bad);
}
async function desk(co: Co, week: string): Promise<Row> {
  return await val<Row>(`SELECT toll_system.week_desk($1::uuid, $2::date)`, [co.org, week]);
}
async function ledgerHash(co: Co, week: string): Promise<string> {
  return await val<string>(
    `SELECT coalesce(md5(string_agg(e.id::text || ':' || e.amount_minor::text, '|' ORDER BY e.id)), '')
     FROM ledger.entries e WHERE e.organization_id = $1::uuid AND e.reference_type = 'toll'
       AND (e.metadata ->> 'toll_week')::date = $2::date`,
    [co.org, week],
  );
}
async function seal(co: Co, week: string) {
  const v = await val<number>(`SELECT toll_system.week_version($1::uuid, $2::date)::int`, [co.org, week]);
  await cmd(co, "seal_week", { week_key: week, expected_week_version: v });
}
/** Driver presses Mark as sent in the Roam driver app (the driver route's RPC; the server finds the driver). */
async function driverMarksSent(co: Co, d: Dispute, driver = "dt-d1") {
  return await val<Row>(
    `SELECT public.toll_sys_driver_mark_dispute_sent($1::uuid, $2, $3::uuid, $4::jsonb)`,
    [co.org, driver, co.owner, JSON.stringify({ command_id: crypto.randomUUID(), dispute_id: d.id, expected_dispute_version: d.version })],
  );
}
async function driverCards(co: Co, driver = "dt-d1"): Promise<Row[]> {
  const r = await val<{ disputes: Row[] }>(`SELECT public.toll_sys_driver_disputes($1::uuid, $2)`, [co.org, driver]);
  return r.disputes ?? [];
}
/** Time travel: "the driver sent it N days ago". */
async function sentDaysAgo(co: Co, d: Dispute, n: number) {
  await q(
    `UPDATE toll.disputes SET clock_from = now() - make_interval(days => $3::int), sent_at = now() - make_interval(days => $3::int)
     WHERE organization_id = $1::uuid AND id = $2::uuid`,
    [co.org, d.id, n],
  );
}
/** Time travel: "the 9 days have passed" (the deadline was an hour ago). */
async function deadlinePassed(co: Co, d: Dispute) {
  const tx = db.createTransaction(`tt_${crypto.randomUUID().replaceAll("-", "")}`);
  await tx.begin();
  await tx.queryArray(`ALTER TABLE toll.disputes DISABLE TRIGGER USER`);
  await tx.queryArray({
    text: `UPDATE toll.disputes SET deadline = now() - interval '1 hour' WHERE organization_id = $1::uuid AND id = $2::uuid`,
    args: [co.org, d.id],
  });
  await tx.queryArray(`ALTER TABLE toll.disputes ENABLE TRIGGER USER`);
  await tx.commit();
}
async function sentAndPeriodsCovered(co: Co, ref: string, daysAgo: number, periods: number) {
  const d = await dispute(co, ref);
  await cmd(co, "mark_dispute_sent", { dispute_id: d.id, expected_dispute_version: d.version });
  await sentDaysAgo(co, await dispute(co, ref), daysAgo);
  const ws = await val<string>(
    `SELECT ledger.jamaica_week_start(now() - make_interval(days => $1::int))::text`,
    [daysAgo],
  );
  for (let i = 1; i <= periods; i++) {
    await uberWeekUploaded(co, await val<string>(`SELECT ($1::date + $2::int * 7)::text`, [ws, i]));
  }
}

// ───────────────────────── the stories (Part D) ─────────────────────────

type Story = { id: string; title: string; run: () => Promise<string> };
const stories: Story[] = [];
const story = (id: string, title: string, run: () => Promise<string>) => stories.push({ id, title, run });

story("1", "Uber pays J$370 of a J$390 toll → a J$20 dispute opens by itself; the driver sees it", async () => {
  const co = await company("dt1");
  await uberTripWithToll(co, "t1", -2);
  const r = await runMatcher(co);
  const d = await dispute(co, "t1");
  check(d.state === "to_send" && d.owed_minor === 2000, "dispute to send for J$20", d);
  check((await chargeOf(co, "t1")).state === "decided", "toll counts as decided");
  check((await money(co)).owedByUber === 2000, "J$20 owed by Uber", await money(co));
  const cards = await driverCards(co);
  check(cards.length === 1 && String(cards[0]!.text).includes("J$20.00"), "driver app card with the text", cards);
  await nightlyClean(co);
  return `matcher opened ${r.actions.opened}; driver card: "${String(cards[0]!.text).slice(0, 60)}…"`;
});

story("2", "The week seals with the dispute open; the driver's settlement has no J$20; J$20 owed by Uber", async () => {
  const co = await company("dt2");
  const week = await weekStart(-1);
  const sunday = await val<number>(`SELECT ($1::date + 6 - (now() AT TIME ZONE 'America/Jamaica')::date)::int`, [week]);
  await uberTripWithToll(co, "t2", sunday);
  await runMatcher(co);
  check((await dispute(co, "t2")).state === "to_send", "dispute open");
  await seal(co, week);
  const dk = await desk(co, week);
  check(dk.sealed === true, "week sealed");
  const sum = dk.sumLine as Row;
  check(sum.waitingOnUberMinor === 2000 && sum.driverMinor === 0, "sum line: J$20 waiting on Uber, driver J$0", sum);
  const tolls = await val<Row[] | Row>(`SELECT public.toll_sys_driver_week_tolls($1::uuid, $2::date, 'dt-d1')`, [co.org, week]);
  check(!JSON.stringify(tolls).includes('"amountMinor": 2000') && !JSON.stringify(tolls).includes('"amountMinor":2000'), "no J$20 on the driver's settlement", tolls);
  check((await money(co)).owedByUber === 2000, "J$20 owed by Uber");
  await nightlyClean(co);
  return `sealed week of ${week} with ${J(Number(sum.waitingOnUberMinor))} waiting on Uber`;
});

story("3", "Driver taps Mark as sent; Uber's J$20 adjustment comes in next week's report → won", async () => {
  const co = await company("dt3");
  await uberTripWithToll(co, "t3", -8);
  await runMatcher(co);
  await driverMarksSent(co, await dispute(co, "t3"));
  await sentDaysAgo(co, await dispute(co, "t3"), 7); // sent last week → this week is "next week"
  await uberAdjustment(co, "adj-t3", 0, 2000);
  await runMatcher(co);
  const d = await dispute(co, "t3");
  check(d.state === "won" && d.recovered_minor === 2000, "won with J$20 back", d);
  check((await money(co)).owedByUber === 0, "nothing owed by Uber", await money(co));
  await nightlyClean(co);
  return "sent by the driver; refund in the next pay period → won";
});

story("3b", "The adjustment comes one week later (second pay period) → still matched and won", async () => {
  const co = await company("dt3b");
  await uberTripWithToll(co, "t3b", -2);
  await runMatcher(co);
  const d0 = await dispute(co, "t3b");
  await cmd(co, "mark_dispute_sent", { dispute_id: d0.id, expected_dispute_version: d0.version });
  await sentDaysAgo(co, await dispute(co, "t3b"), 14);
  await uberWeekUploaded(co, await weekStart(-1)); // first period: report in, nothing refunded
  await runMatcher(co);
  check((await dispute(co, "t3b")).state === "sent", "still waiting after the first period");
  await uberAdjustment(co, "adj-t3b", 0, 2000);
  await runMatcher(co);
  check((await dispute(co, "t3b")).state === "won", "won in the second period", await dispute(co, "t3b"));
  await nightlyClean(co);
  return "refund in the second pay period → won";
});

story("4", "The driver was charged the J$20 (expired, its week then sealed); Uber's refund arrives → won, the driver's J$20 reversed in the open week", async () => {
  const co = await company("dt4");
  const week = await weekStart(-1);
  const sunday = await val<number>(`SELECT ($1::date + 6 - (now() AT TIME ZONE 'America/Jamaica')::date)::int`, [week]);
  await uberTripWithToll(co, "t4", sunday);
  await runMatcher(co);
  await deadlinePassed(co, await dispute(co, "t4"));
  await runMatcher(co);
  check((await dispute(co, "t4")).bearer === "driver" && (await money(co)).driverOwes === 2000, "driver charged J$20", await money(co));
  const sealedWeek = (await chargeOf(co, "t4")).week;
  await seal(co, sealedWeek);
  const before = await ledgerHash(co, sealedWeek);
  await uberAdjustment(co, "adj-t4", 0, 2000);
  await runMatcher(co);
  const d = await dispute(co, "t4");
  check(d.state === "won" && (await money(co)).driverOwes === 0, "won, driver's J$20 reversed", { d, m: await money(co) });
  check((await ledgerHash(co, sealedWeek)) === before, "sealed week unchanged");
  check(d.posted_in_week_key === (await weekStart(0)), "reversal in the open week", d.posted_in_week_key);
  await nightlyClean(co);
  return `driver charged on expiry; refund after the week sealed → reversed in ${d.posted_in_week_key}`;
});

story("5", "The driver never sends it; the 9 days pass → expired, the driver bears J$20 in the open week", async () => {
  const co = await company("dt5");
  await uberTripWithToll(co, "t5", -2);
  await runMatcher(co);
  await deadlinePassed(co, await dispute(co, "t5"));
  await runMatcher(co); // the nightly sweep
  const d = await dispute(co, "t5");
  check(d.state === "expired" && d.bearer === "driver", "expired, driver bears", d);
  check((await money(co)).driverOwes === 2000 && (await money(co)).owedByUber === 0, "driver owes J$20", await money(co));
  check(d.posted_in_week_key === (await weekStart(0)), "posted in the open week", d.posted_in_week_key);
  await nightlyClean(co);
  return "expired by the nightly job; driver bears J$20";
});

story("5b", "The Uber report comes 10 days after the trip → the dispute opens expired (late), no card, the fleet bears it", async () => {
  const co = await company("dt5b");
  await uberTripWithToll(co, "t5b", -10);
  await runMatcher(co);
  const d = await dispute(co, "t5b");
  check(d.state === "expired" && d.opened_late && d.bearer === "fleet", "opened late, expired, fleet bears", d);
  check(d.posted_in_week_key !== null, "result has its week (listed in Results this week)", d);
  check((await money(co)).fleetExpense === 2000, "fleet bears J$20", await money(co));
  check((await driverCards(co)).length === 0, "no driver card");
  check((await money(co)).driverOwes === 0, "driver never charged", await money(co));
  await nightlyClean(co);
  return "opened late → expired → fleet bears J$20; driver sees nothing";
});

story("5c", "Expired with the driver bearing J$20; Uber's J$20 refund then arrives → won, the driver's J$20 reversed", async () => {
  const co = await company("dt5c");
  await uberTripWithToll(co, "t5c", -2);
  await runMatcher(co);
  await deadlinePassed(co, await dispute(co, "t5c"));
  await runMatcher(co);
  check((await money(co)).driverOwes === 2000, "driver charged on expiry");
  await uberAdjustment(co, "adj-t5c", 0, 2000);
  await runMatcher(co);
  const d = await dispute(co, "t5c");
  check(d.state === "won" && (await money(co)).driverOwes === 0, "won, driver reversed", { d, m: await money(co) });
  await nightlyClean(co);
  return "late refund on an expired dispute → won, driver back to J$0";
});

story("5d", "Opened late, expired, the fleet bore J$20; Uber refunds J$10 → part won; fleet keeps J$10; driver never charged", async () => {
  const co = await company("dt5d");
  await uberTripWithToll(co, "t5d", -10);
  await runMatcher(co);
  const before = await money(co);
  await uberAdjustment(co, "adj-t5d", 0, 1000);
  await runMatcher(co);
  const d = await dispute(co, "t5d");
  const after = await money(co);
  check(d.recovered_minor === 1000, "J$10 recovered", d);
  check(after.fleetExpense === before.fleetExpense - 1000, "fleet's cost drops by J$10", { before, after });
  check(after.driverOwes === 0, "driver never charged");
  await nightlyClean(co);
  return `state ${d.state}; fleet cost ${J(before.fleetExpense)} → ${J(after.fleetExpense)}`;
});

story("6", "Sent, no refund in either pay period → when the second report is in, lost by itself; the fleet bears J$20", async () => {
  const co = await company("dt6");
  await uberTripWithToll(co, "t6", -2);
  await runMatcher(co);
  await sentAndPeriodsCovered(co, "t6", 14, 2);
  await runMatcher(co);
  const d = await dispute(co, "t6");
  check(d.state === "lost" && d.bearer === "fleet", "lost, fleet bears", d);
  check((await money(co)).owedByUber === 0, "nothing left owed by Uber");
  await nightlyClean(co);
  return "both reports in, no refund → lost by itself, fleet bears";
});

story("7", "Uber pays J$10 of J$20 → the person presses Lost → J$10 recovered, J$10 to the lost bearer", async () => {
  const co = await company("dt7");
  await uberTripWithToll(co, "t7", -8);
  await runMatcher(co);
  const d0 = await dispute(co, "t7");
  await cmd(co, "mark_dispute_sent", { dispute_id: d0.id, expected_dispute_version: d0.version });
  await sentDaysAgo(co, await dispute(co, "t7"), 7);
  await uberAdjustment(co, "adj-t7", 0, 1000);
  await runMatcher(co);
  const d1 = await dispute(co, "t7");
  check(d1.recovered_minor === 1000 && d1.state === "sent", "J$10 back, still open", d1);
  await cmd(co, "close_dispute_lost", { dispute_id: d1.id, expected_dispute_version: d1.version });
  const d = await dispute(co, "t7");
  check(d.recovered_minor === 1000 && d.bearer === "fleet" && (await money(co)).owedByUber === 0, "J$10 recovered, J$10 to the fleet", d);
  await nightlyClean(co);
  return `closed by a person: ${d.state}, ${J(d.recovered_minor)} recovered`;
});

story("7b", "Uber pays J$10 and nobody closes it → after the second report, part won by itself", async () => {
  const co = await company("dt7b");
  await uberTripWithToll(co, "t7b", -2);
  await runMatcher(co);
  await sentAndPeriodsCovered(co, "t7b", 14, 2);
  await uberAdjustment(co, "adj-t7b", -6, 1000);
  await runMatcher(co);
  const d = await dispute(co, "t7b");
  check(d.state === "part_won" && d.recovered_minor === 1000, "part won by itself", d);
  await nightlyClean(co);
  return "J$10 back, both reports in → part won";
});

story("8", "A tag toll inside a hand-logged InDrive cash trip → 'Driver pays' suggestion; Confirm → driver; Fleet pays → fleet", async () => {
  const co = await company("dt8");
  for (const [trip, hh] of [["ind-1", "09"], ["ind-2", "11"]] as const) {
    await q(
      `INSERT INTO fleet.trips (id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
         payment_method, service_line, amount, legacy_kv_id, payload_json)
       VALUES ($1, $2, $3::date, 'dt-d1', 'v1', 'InDrive', 'completed', 'live_driver_app', 'cash', 'rideshare', 1500, $4,
         jsonb_build_object('isManual', true, 'requestTime', $3 || 'T${hh}:00:00', 'pickupTime', $3 || 'T${hh}:05:00',
                            'dropoffTime', $3 || 'T${hh}:50:00'))`,
      [`${trip}-${co.org.slice(0, 8)}`, co.org, await day(-2), `kv-${trip}-${co.org.slice(0, 8)}`],
    );
  }
  await tagToll(co, "t8a", -2, "09:20", 28000);
  await tagToll(co, "t8b", -2, "11:20", 28000);
  await runMatcher(co);
  const sug = async (ref: string) =>
    await one<{ id: string }>(
      `SELECT s.id::text FROM toll.suggestions s JOIN toll.charges c ON c.id = s.charge_id
       WHERE s.organization_id = $1::uuid AND c.source_ref = $2 AND s.kind = 'rider_pays_driver' AND s.superseded_by IS NULL`,
      [co.org, `${ref}-toll`],
    );
  const a = await chargeOf(co, "t8a");
  await cmd(co, "driver_pays", { charge_id: a.id, expected_charge_version: a.version, suggestion_id: (await sug("t8a")).id });
  const b = await chargeOf(co, "t8b");
  await cmd(co, "fleet_absorbs", { charge_id: b.id, expected_charge_version: b.version, suggestion_id: (await sug("t8b")).id });
  const m = await money(co);
  check(m.driverOwes === 28000, "driver bears the first", m);
  check((await disputesOf(co, "t8a")).length === 0 && (await disputesOf(co, "t8b")).length === 0, "no dispute");
  const dk = await desk(co, (await chargeOf(co, "t8a")).week);
  const parts = (dk.charges as Row[]).filter((c) => String(c.id) === a.id || String(c.id) === b.id).map((c) => c.part);
  check(parts.every((p) => p === 6), "both decided, none in 'Tolls with no trip'", parts);
  await nightlyClean(co);
  return "suggested from the logged InDrive trips; driver pays one, fleet pays the other";
});

story("8b", "A driver cash toll during the InDrive trip → the same suggestion; Confirm Driver pays", async () => {
  const co = await company("dt8b");
  await q(
    `INSERT INTO fleet.trips (id, organization_id, date, driver_id, vehicle_id, platform, status, batch_id,
       payment_method, service_line, amount, legacy_kv_id, payload_json)
     VALUES ($1, $2, $3::date, 'dt-d1', 'v1', 'InDrive', 'completed', 'live_driver_app', 'cash', 'rideshare', 1500, $4,
       jsonb_build_object('isManual', true, 'requestTime', $3 || 'T10:00:00', 'dropoffTime', $3 || 'T10:50:00'))`,
    [`ind-c-${co.org.slice(0, 8)}`, co.org, await day(-2), `kv-ind-c-${co.org.slice(0, 8)}`],
  );
  await importRows(co, "driver_cash", [{
    source_ref: "t8c-toll", occurred_at: await at(-2, "10:20"), amount_minor: 28000, plaza_id: "dt-pz",
    vehicle_id: "v1", driver_id: "dt-d1", evidence: { receipt_url: "dt-receipt" },
  }]);
  const c0 = await chargeOf(co, "t8c");
  await cmd(co, "verify_cash_receipt", { charge_id: c0.id, expected_charge_version: c0.version });
  await runMatcher(co);
  const s = await one<{ id: string }>(
    `SELECT id::text FROM toll.suggestions WHERE organization_id = $1::uuid AND charge_id = $2::uuid AND kind = 'rider_pays_driver' AND superseded_by IS NULL`,
    [co.org, c0.id],
  );
  const c = await chargeOf(co, "t8c");
  await cmd(co, "driver_pays", { charge_id: c.id, expected_charge_version: c.version, suggestion_id: s.id });
  check((await chargeOf(co, "t8c")).state === "decided", "decided");
  check((await disputesOf(co, "t8c")).length === 0, "no dispute");
  await nightlyClean(co);
  return "driver cash toll inside an InDrive trip → Driver pays; the fleet doesn't pay him back";
});

story("9", "A toll during a Roam ride → native, unchanged (Roam charges the rider; no dispute)", async () => {
  const co = await company("dt9");
  await q(`SELECT public.toll_sys_native_ride_charge($1::uuid, $2::jsonb)`, [co.org, JSON.stringify({
    ride_id: "dt9-ride", payment_method: "card", driver_id: "dt-d1", vehicle_id: "v1",
    ended_at: await at(-1, "18:00"), estimated_tolls_minor: 39000,
    crossings: [{ id: "dt9-x", plaza_id: "dt-pz", amount_minor: 39000, crossed_at: await at(-1, "17:50"), paid_by: "tag" }],
  })]);
  await runMatcher(co);
  const pb = await one<{ kind: string }>(`SELECT kind FROM toll.paybacks WHERE organization_id = $1::uuid AND reference = 'roam:dt9-ride'`, [co.org]);
  check(pb.kind === "native", "Roam native payback", pb);
  check(Number(await val(`SELECT count(*) FROM toll.disputes WHERE organization_id = $1::uuid`, [co.org])) === 0, "no dispute");
  await nightlyClean(co);
  return "Roam ride → native payback, no dispute";
});

story("10", "A toll with no trip on any platform → only in 'Tolls with no trip'", async () => {
  const co = await company("dt10");
  await tagToll(co, "t10", -2, "03:10", 39000);
  await runMatcher(co);
  const c = await chargeOf(co, "t10");
  const row = ((await desk(co, c.week)).charges as Row[]).find((x) => String(x.id) === c.id)!;
  check(row.part === 4 && row.section === "no_trip", "part 4, no trip", row);
  check((await disputesOf(co, "t10")).length === 0, "no dispute");
  return "only in part 4 'Tolls with no trip'";
});

story("12", "The charge's week is sealed; the refund arrives → won; the sealed week's ledger unchanged; the open week posts it", async () => {
  const co = await company("dt12");
  const week = await weekStart(-1);
  const sunday = await val<number>(`SELECT ($1::date + 6 - (now() AT TIME ZONE 'America/Jamaica')::date)::int`, [week]);
  await uberTripWithToll(co, "t12", sunday);
  await runMatcher(co);
  const d0 = await dispute(co, "t12");
  await cmd(co, "mark_dispute_sent", { dispute_id: d0.id, expected_dispute_version: d0.version });
  await seal(co, week);
  const before = await ledgerHash(co, week);
  await uberAdjustment(co, "adj-t12", 0, 2000);
  await runMatcher(co);
  const d = await dispute(co, "t12");
  check(d.state === "won", "won", d);
  check((await ledgerHash(co, week)) === before, "sealed week's ledger unchanged");
  check(d.posted_in_week_key === (await weekStart(0)), "posted in the open week", d.posted_in_week_key);
  await nightlyClean(co);
  return `sealed ${week} unchanged; result posted in ${d.posted_in_week_key}`;
});

story("13", "Uber's trip line for a disputed toll arrives late → it settles the dispute; the toll is never covered twice", async () => {
  const co = await company("dt13");
  await uberTripWithToll(co, "t13", -3);
  await runMatcher(co);
  const d0 = await dispute(co, "t13");
  await cmd(co, "mark_dispute_sent", { dispute_id: d0.id, expected_dispute_version: d0.version });
  // The late trip line: Uber pays the missing J$20 as a second line on the same trip.
  await importRows(co, "uber", [{
    row_type: "trip", platform_trip_id: "t13-trip-late", driver_id: "dt-d1", vehicle_id: "v1",
    request_at: await at(-3, "15:00"), dropoff_at: await at(-3, "15:40"), payment_method: "card", toll_payback_minor: 2000,
  }]);
  await runMatcher(co);
  let d = await dispute(co, "t13");
  if (d.state !== "won") {
    // Nothing settled by itself: the person presses Refund received and picks the trip line (C3).
    const pb = await paybackOf(co, "trip:t13-trip-late");
    await cmd(co, "settle_dispute", { dispute_id: d.id, expected_dispute_version: d.version, payback_id: pb.id, expected_payback_version: pb.version });
    d = await dispute(co, "t13");
  }
  check(d.state === "won", "won by the trip line", d);
  const covered = Number(await val(
    `SELECT coalesce(sum(a.amount_minor), 0) FROM toll.allocations a WHERE a.organization_id = $1::uuid AND a.charge_id = $2::uuid AND a.reversed_by IS NULL`,
    [co.org, d.charge_id],
  ));
  check(covered === 39000, "covered exactly once", covered);
  await nightlyClean(co);
  return "late trip line settled it; toll covered J$390.00 once";
});

story("14", "Uber takes back a J$20 refund that won a sent dispute → reopens as a new 'sent' row; J$20 owed by Uber again", async () => {
  const co = await company("dt14");
  await uberTripWithToll(co, "t14", -3);
  await runMatcher(co);
  const d0 = await dispute(co, "t14");
  await cmd(co, "mark_dispute_sent", { dispute_id: d0.id, expected_dispute_version: d0.version });
  await uberAdjustment(co, "adj-t14", 0, 2000);
  await runMatcher(co);
  check((await dispute(co, "t14")).state === "won", "won first");
  const pb = await paybackOf(co, "adj-t14");
  await cmd(co, "reverse_payback", { payback_id: pb.id, expected_payback_version: pb.version, reference: "rev-t14", paid_on: await day(0) });
  const d = await dispute(co, "t14");
  check(d.state === "sent" && d.reopens_id !== null, "reopened as a new sent row", d);
  check((await money(co)).owedByUber === 2000, "J$20 owed by Uber again", await money(co));
  await nightlyClean(co);
  return "take-back → new sent dispute, J$20 owed by Uber";
});

story("14b", "Uber takes back a refund that had won an expired dispute (driver bearer) → reopens expired; driver charged again", async () => {
  const co = await company("dt14b");
  await uberTripWithToll(co, "t14b", -2);
  await runMatcher(co);
  await deadlinePassed(co, await dispute(co, "t14b"));
  await runMatcher(co);
  await uberAdjustment(co, "adj-t14b", 0, 2000);
  await runMatcher(co);
  check((await dispute(co, "t14b")).state === "won" && (await money(co)).driverOwes === 0, "won, driver reversed");
  const pb = await paybackOf(co, "adj-t14b");
  await cmd(co, "reverse_payback", { payback_id: pb.id, expected_payback_version: pb.version, reference: "rev-t14b", paid_on: await day(0) });
  const d = await dispute(co, "t14b");
  check(d.state === "expired" && (await money(co)).driverOwes === 2000, "reopened expired, driver charged again", { d, m: await money(co) });
  await nightlyClean(co);
  return "take-back on an expired win → expired again, driver owes J$20";
});

story("15", "Undo a dispute result after its result week was sealed (only manager, with a reason) → reversal in the open week", async () => {
  const co = await company("dt15");
  const week = await weekStart(-1);
  const sunday = await val<number>(`SELECT ($1::date + 6 - (now() AT TIME ZONE 'America/Jamaica')::date)::int`, [week]);
  await uberTripWithToll(co, "t15", sunday);
  await runMatcher(co);
  const d0 = await dispute(co, "t15");
  await cmd(co, "mark_dispute_sent", { dispute_id: d0.id, expected_dispute_version: d0.version });
  await sentDaysAgo(co, await dispute(co, "t15"), -sunday);
  await uberAdjustment(co, "adj-t15", sunday, 2000); // the refund lands in that week, before it seals
  await runMatcher(co);
  check((await dispute(co, "t15")).state === "won", "won inside the week");
  await seal(co, week);
  const before = await ledgerHash(co, week);
  const results = (await desk(co, week)).results as Row[];
  const undo = (results.find((r) => String(r.id) === d0.id || r.chargeId === d0.charge_id)?.undo ?? null) as Row | null;
  check(undo && undo.decision_id, "Undo offered on Results this week", results);
  // Undo is four-eyes only above J$5,000 (B14): a J$20 undo goes straight through.
  const code = await refused(co, "undo_decision", { decision_id: undo!.decision_id });
  const needs = code === "NEEDS_APPROVAL";
  check(needs || code === "SUCCEEDED", "undo went through or asked for approval", code);
  if (needs) {
    await cmd(co, "undo_decision", { decision_id: undo!.decision_id, self_approval_reason: "Uber reversed it by phone" });
  }
  check(
    (await refused(co, "undo_decision", { decision_id: undo!.decision_id })) === "WRONG_STATE",
    "a second undo of the same result is refused",
  );
  check((await ledgerHash(co, week)) === before, "sealed week unchanged");
  const d = await dispute(co, "t15");
  check(d.state === "sent", "dispute open again", d);
  check((await money(co)).owedByUber === 2000, "J$20 owed by Uber again in the open week");
  await nightlyClean(co);
  // The reopened dispute still settles: Uber's next J$20 refund wins it in the open week.
  await uberAdjustment(co, "adj-t15b", 0, 2000);
  await runMatcher(co);
  const d2 = await dispute(co, "t15");
  check(d2.state === "won" && d2.posted_in_week_key === (await weekStart(0)), "reopened dispute won again in the open week", d2);
  check((await money(co)).owedByUber === 0, "nothing owed by Uber after the second refund", await money(co));
  check((await ledgerHash(co, week)) === before, "sealed week still unchanged");
  await nightlyClean(co);
  return `undo ${needs ? "needed the only manager's reason" : "went through"}; sealed week unchanged; next refund won it again`;
});

story("16", "Uber's reports for both periods never arrive → 23 days after sending, lost (no report), the fleet bears it; 'report late' alert raised", async () => {
  const co = await company("dt16");
  await q(`UPDATE toll.switch_state SET toll_disputes_on_at = now() - interval '30 days' WHERE organization_id = $1::uuid`, [co.org]);
  await uberTripWithToll(co, "t16", -2);
  await runMatcher(co);
  const d1 = await dispute(co, "t16");
  await cmd(co, "mark_dispute_sent", { dispute_id: d1.id, expected_dispute_version: d1.version });
  await sentDaysAgo(co, await dispute(co, "t16"), 24); // sent 24 days ago; no Uber report uploaded since
  await runMatcher(co);
  const d = await dispute(co, "t16");
  const alerts = Number(await val(
    `SELECT count(*) FROM toll.alerts WHERE organization_id = $1::uuid AND dedupe_key LIKE 'report_late:uber:%'`,
    [co.org],
  ));
  check(alerts > 0, "Uber report late alert raised", alerts);
  check(d.state === "lost" && d.close_reason === "no_report" && d.bearer === "fleet", "lost, no report, fleet bears", d);
  await nightlyClean(co);
  return `lost (${d.close_reason}), fleet bears; ${alerts} late-report alert(s)`;
});

story("17", "Driver taps Mark as sent after the deadline → refused 'The 9 days … have passed'; the nightly job expires it", async () => {
  const co = await company("dt17");
  await uberTripWithToll(co, "t17", -2);
  await runMatcher(co);
  await deadlinePassed(co, await dispute(co, "t17"));
  let msg = "";
  try {
    await driverMarksSent(co, await dispute(co, "t17"));
  } catch (e) {
    msg = String((e as Error).message);
  }
  check(/window_closed/.test(msg), "refused window_closed", msg);
  const card = (await driverCards(co))[0]!;
  check(card.windowClosed === true && card.canMarkSent === false, "card shows window closed, no Mark as sent", card);
  await runMatcher(co);
  check((await dispute(co, "t17")).state === "expired", "expired by the nightly job");
  await nightlyClean(co);
  return "refused after the deadline; expired that night";
});

story("19", "Sent in one week, refunded two weeks later → posts in the week open when it arrives", async () => {
  const co = await company("dt19");
  const lastWeek = await weekStart(-1);
  const sun19 = await val<number>(`SELECT ($1::date + 6 - (now() AT TIME ZONE 'America/Jamaica')::date)::int`, [lastWeek]);
  await uberTripWithToll(co, "t19", sun19);
  await runMatcher(co);
  const d0 = await dispute(co, "t19");
  await cmd(co, "mark_dispute_sent", { dispute_id: d0.id, expected_dispute_version: d0.version });
  await sentDaysAgo(co, await dispute(co, "t19"), 14);
  // The charge's week is sealed, so the result can't post there.
  const cw = (await chargeOf(co, "t19")).week;
  await seal(co, cw);
  await uberAdjustment(co, "adj-t19", 0, 2000);
  await runMatcher(co);
  const d = await dispute(co, "t19");
  check(d.state === "won" && d.posted_in_week_key === (await weekStart(0)), "won, posted in the open week", d);
  await nightlyClean(co);
  return `charge week ${cw}; result posted in ${d.posted_in_week_key}`;
});

// ───────────────────────── run ─────────────────────────

const only = (Deno.env.get("TOLL_DT_ONLY") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const results: Array<{ id: string; title: string; ok: boolean; note: string }> = [];
for (const s of stories) {
  if (only.length && !only.includes(s.id)) continue;
  try {
    const note = await s.run();
    results.push({ id: s.id, title: s.title, ok: true, note });
    console.log(`PASS ${s.id.padEnd(3)} ${s.title}\n       ${note}`);
  } catch (e) {
    const note = e instanceof Fail ? e.message : String((e as Error)?.stack ?? e);
    results.push({ id: s.id, title: s.title, ok: false, note });
    console.log(`FAIL ${s.id.padEnd(3)} ${s.title}\n       ${note}`);
  }
}
console.log("NOT RUN 11, 18 — staging only (a copy of production data), per Part D.");

if (Deno.env.get("TOLL_DT_KEEP") !== "1") {
  for (const co of made) {
    try {
      await q(`SELECT 1`); // keep the connection warm
      await q(`DELETE FROM public.organizations WHERE id = $1::uuid`, [co.org]);
    } catch {
      /* test companies are kept if a foreign key holds them; they are named "Toll done-test …" */
    }
  }
}
await db.end();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
Deno.exit(failed ? 1 : 0);
