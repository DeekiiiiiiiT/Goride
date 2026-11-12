import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Rev 24 (WRA-31): the "calculator paused" alert must be able to fire while the calculator is
 * paused. The database used to skip every wake while paused, and alerts only run inside a wake.
 */
const root = new URL("../../../", import.meta.url);
const read = (p: string) => Deno.readTextFile(new URL(p, root));

Deno.test("paused: the database still wakes the calculator, alerts-only, every 10 minutes", async () => {
  const dir = new URL("supabase/migrations/", root);
  let latest = "";
  for await (const e of Deno.readDir(dir)) {
    if (!e.isFile || !e.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(e.name, dir));
    if (/CREATE OR REPLACE FUNCTION\s+"?private"?\."?invoke_recon_worker_wake"?\(\)/.test(sql) && e.name > latest) latest = e.name;
  }
  const sql = await Deno.readTextFile(new URL(latest, dir));
  assert(!/emergencyOff'\)::boolean, false\) THEN\s+RETURN NULL;/.test(sql), `${latest}: paused must not skip the wake`);
  assert(/% 10\) <> 0/.test(sql), `${latest}: alerts-only wake every 10 minutes`);
  assert(/'alertsOnly', alerts_only/.test(sql), `${latest}: sends alertsOnly`);
});

Deno.test("the cron door and the calculator pass alertsOnly through and run only the alert pass", async () => {
  const cron = await read("supabase/functions/fleet-recon-cron/index.ts");
  assert(/alertsOnly: body\.alertsOnly === true/.test(cron), "cron passes alertsOnly");
  const worker = await read("scripts/recon-worker.ts");
  assert(/if \(body\.alertsOnly === true\) \{\s*return Response\.json\(\{ alertsOnly: await runAlertPass\(\) \}\);/.test(worker), "alerts-only wake runs only the alert pass");
});
