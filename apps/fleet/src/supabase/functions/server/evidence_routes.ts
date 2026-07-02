/**
 * Evidence storage admin + cleanup routes.
 */
import type { Context } from "npm:hono";
import {
  EPHEMERAL_EVIDENCE_BUCKET,
  LEGACY_DOCS_BUCKET,
  computeDeleteAfter,
  extractEvidenceUrlsFromRecord,
  isEvidenceTtlEnabled,
  markEvidenceFilesDeleted,
  parseStoragePathFromUrl,
  runEvidenceCleanup,
  scheduleEvidenceDeletion,
  storagePathsFromUrls,
} from "./evidence_storage.ts";

const FILE_CHUNK = 50;

function cronAuthorized(c: Context): boolean {
  const secret = Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("RIDES_CRON_SECRET");
  if (!secret) return false;
  return c.req.header("X-Fleet-Cron-Secret") === secret ||
    c.req.header("X-Rides-Cron-Secret") === secret;
}

export function registerEvidenceRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: any,
  requireAuth: () => unknown,
  requirePermission: (p: string) => unknown,
) {
  app.get(
    "/make-server-37f42386/admin/evidence-storage/summary",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      try {
        const { count: activeCount } = await supabase
          .from("evidence_files")
          .select("*", { count: "exact", head: true })
          .in("status", ["active", "pending_hold"])
          .is("deleted_at", null);

        const { count: scheduledCount } = await supabase
          .from("evidence_files")
          .select("*", { count: "exact", head: true })
          .eq("status", "scheduled")
          .is("deleted_at", null);

        const { count: deletedCount } = await supabase
          .from("evidence_files")
          .select("*", { count: "exact", head: true })
          .eq("status", "deleted");

        const { count: pendingHoldCount } = await supabase
          .from("evidence_files")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending_hold")
          .is("deleted_at", null);

        const weekAhead = new Date();
        weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);
        const { count: expiringWithin7Days } = await supabase
          .from("evidence_files")
          .select("*", { count: "exact", head: true })
          .eq("status", "scheduled")
          .lte("delete_after", weekAhead.toISOString())
          .gt("delete_after", new Date().toISOString())
          .is("deleted_at", null);

        const { data: bucketList } = await supabase.storage.from(EPHEMERAL_EVIDENCE_BUCKET).list("", { limit: 1 });
        let totalBytes = 0;
        const { data: sizeRows } = await supabase
          .from("evidence_files")
          .select("metadata")
          .eq("bucket_id", EPHEMERAL_EVIDENCE_BUCKET)
          .is("deleted_at", null)
          .limit(5000);
        for (const row of sizeRows || []) {
          const sz = Number((row.metadata as { size?: number })?.size);
          if (sz > 0) totalBytes += sz;
        }

        const { data: lastDeleted } = await supabase
          .from("evidence_files")
          .select("deleted_at")
          .eq("status", "deleted")
          .order("deleted_at", { ascending: false })
          .limit(1);

        const { count: lastPurged } = await supabase
          .from("evidence_files")
          .select("*", { count: "exact", head: true })
          .eq("status", "deleted")
          .gte("deleted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        return c.json({
          activeCount: activeCount ?? 0,
          scheduledCount: scheduledCount ?? 0,
          deletedCount: deletedCount ?? 0,
          pendingHoldCount: pendingHoldCount ?? 0,
          totalBytes,
          expiringWithin7Days: expiringWithin7Days ?? 0,
          lastCleanupAt: lastDeleted?.[0]?.deleted_at || null,
          lastCleanupPurged: lastPurged ?? 0,
          bucketReachable: Array.isArray(bucketList),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  app.post(
    "/make-server-37f42386/internal/evidence-cleanup",
    async (c: Context) => {
      if (!cronAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
      try {
        const dryRun = c.req.query("dryRun") === "true";
        const result = await runEvidenceCleanup(supabase, kv, { dryRun });
        return c.json({ success: true, ...result });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  app.post(
    "/make-server-37f42386/admin/evidence-storage/audit-legacy",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      try {
        const { data: objects, error } = await supabase.storage
          .from(LEGACY_DOCS_BUCKET)
          .list("driver-docs", { limit: 1000 });

        if (error) throw error;

        const referenced = new Set<string>();
        const txs = await kv.getByPrefix("transaction:");
        const fuel = await kv.getByPrefix("fuel_entry:");
        for (const rec of [...(txs || []), ...(fuel || [])]) {
          for (const url of extractEvidenceUrlsFromRecord(rec)) {
            const parsed = parseStoragePathFromUrl(url);
            if (parsed?.bucket === LEGACY_DOCS_BUCKET) {
              referenced.add(parsed.path);
            }
          }
        }

        const orphan: string[] = [];
        const linked: string[] = [];
        for (const obj of objects || []) {
          const path = `driver-docs/${obj.name}`;
          if (referenced.has(path)) linked.push(path);
          else orphan.push(path);
        }

        return c.json({
          success: true,
          bucket: LEGACY_DOCS_BUCKET,
          scanned: (objects || []).length,
          linkedCount: linked.length,
          orphanCount: orphan.length,
          orphans: orphan.slice(0, 100),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  app.post(
    "/make-server-37f42386/admin/evidence-storage/purge-legacy",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c: Context) => {
      try {
        const body = await c.req.json().catch(() => ({}));
        let paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
        const orphanOnly = body?.orphanOnly !== false;

        if (!paths.length && orphanOnly) {
          const { data: objects } = await supabase.storage
            .from(LEGACY_DOCS_BUCKET)
            .list("driver-docs", { limit: 500 });
          const referenced = new Set<string>();
          const txs = await kv.getByPrefix("transaction:");
          for (const rec of txs || []) {
            for (const url of extractEvidenceUrlsFromRecord(rec)) {
              const parsed = parseStoragePathFromUrl(url);
              if (parsed) referenced.add(parsed.path);
            }
          }
          for (const obj of objects || []) {
            const path = `driver-docs/${obj.name}`;
            if (!referenced.has(path)) paths.push(path);
          }
        }

        let deleted = 0;
        for (let i = 0; i < paths.length; i += FILE_CHUNK) {
          const chunk = paths.slice(i, i + FILE_CHUNK);
          const { error } = await supabase.storage.from(LEGACY_DOCS_BUCKET).remove(chunk);
          if (!error) deleted += chunk.length;
        }

        return c.json({ success: true, deleted, pathsProcessed: paths.length });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}

export async function applyEvidenceResolution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sourceType: "transaction" | "fuel_entry" | "maintenance_log",
  sourceId: string,
  resolvedAt: Date = new Date(),
): Promise<string> {
  if (!isEvidenceTtlEnabled()) return "";
  await scheduleEvidenceDeletion(supabase, sourceType, sourceId, resolvedAt);
  return computeDeleteAfter(resolvedAt);
}

export async function cleanupEphemeralPathsOnDelete(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  urls: string[],
): Promise<number> {
  if (!isEvidenceTtlEnabled() || !urls.length) return 0;
  const ephemeral = storagePathsFromUrls(urls).filter(
    (p) => p.bucket === EPHEMERAL_EVIDENCE_BUCKET,
  );
  if (!ephemeral.length) return 0;
  const paths = ephemeral.map((p) => p.path);
  for (let i = 0; i < paths.length; i += FILE_CHUNK) {
    await supabase.storage.from(EPHEMERAL_EVIDENCE_BUCKET).remove(paths.slice(i, i + FILE_CHUNK));
  }
  await markEvidenceFilesDeleted(supabase, paths);
  return paths.length;
}
