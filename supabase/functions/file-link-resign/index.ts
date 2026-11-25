/**
 * Monthly re-sign of stored private file links — cron / service-role only.
 *
 *   POST /functions/v1/file-link-resign            → renew every stored link expiring in <= 60 days
 *   POST /functions/v1/file-link-resign?dryRun=true → report only, writes nothing
 *
 * Every stored private address (`file-link?...&e=…&s=…`) expires one year after signing. Left alone
 * the ~2,300 links written by the M5 rewrite die on 25 Nov 2027. This job rewrites only `e=`/`s=`
 * with a fresh one-year signature for the same key, using FILE_LINK_SECRET and the exact format of
 * fileLink.ts. See _shared/objectStorage/fileLinkResign.ts for the targets and safety rules.
 *
 * Door: the same check as the other cron jobs — `authorizeCronOrServiceRole` accepts the
 * `X-Fleet-Cron-Secret` sent by private.invoke_file_link_resign (or a service-role caller).
 * `verify_jwt = false` is set because the cron header is not a JWT; the shared helper is the lock.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrServiceRole } from "../_shared/authorizeCronOrServiceRole.ts";
import { attentionFor, runFileLinkResign } from "../_shared/objectStorage/fileLinkResign.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Short log line: counts only, never a signature. */
function logSummary(summary: Awaited<ReturnType<typeof runFileLinkResign>>): void {
  console.log(
    "[file-link-resign] " +
      JSON.stringify({
        dryRun: summary.dryRun,
        scanned: summary.scanned,
        due: summary.due,
        renewed: summary.renewed,
        skippedChanged: summary.skippedChanged,
        skippedInvalid: summary.skippedInvalid,
        errors: summary.errors,
        perTarget: summary.targets.map((t) => ({
          target: t.target,
          scanned: t.scanned,
          links: t.links,
          renewed: t.renewed,
          skippedChanged: t.skippedChanged,
          skippedInvalid: t.skippedInvalid,
        })),
      }),
  );
}

/**
 * Save the run (counts only) in private.file_link_resign_runs, so a failed or partial run is on
 * record even though pg_net throws the HTTP answer away. Never fails the run itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordRun(sb: any, report: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await sb.rpc("file_link_resign_record_run", { p_report: report });
    if (error) console.error("[file-link-resign] could not record the run:", error.message);
  } catch (e) {
    console.error("[file-link-resign] could not record the run:", e instanceof Error ? e.message : String(e));
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authorization = await authorizeCronOrServiceRole(req);
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const secretKey = (Deno.env.get("SUPABASE_SECRET_KEY") || "").trim();
  const fileLinkSecret = (Deno.env.get("FILE_LINK_SECRET") || "").trim();
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
  if (!fileLinkSecret || !supabaseUrl || !(serviceKey || secretKey)) {
    return json({ error: "FILE_LINK_SECRET, SUPABASE_URL or the service key is not set" }, 503);
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const sb = createClient(supabaseUrl, serviceKey || secretKey, { auth: { persistSession: false } });

  try {
    const summary = await runFileLinkResign(sb, {
      secret: fileLinkSecret,
      supabaseUrl,
      nowSeconds: Math.floor(Date.now() / 1000),
      dryRun,
    });
    logSummary(summary);
    const attention = attentionFor(summary);
    await recordRun(sb, { ...summary, attention });
    if (attention.length) console.error("[file-link-resign] NEEDS ATTENTION:", JSON.stringify(attention));
    return json({ ok: attention.length === 0, attention, ...summary }, summary.errors.length ? 207 : 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[file-link-resign] failed:", message);
    await recordRun(sb, { dryRun, renewed: 0, due: 0, skippedChanged: 0, skippedInvalid: 0, attention: [`run failed: ${message}`] });
    return json({ error: message }, 500);
  }
});
