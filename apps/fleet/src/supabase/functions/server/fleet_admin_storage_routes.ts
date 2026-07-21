/**
 * Roam Fleet product-admin Storage Center APIs (roamfleet.co/admin).
 * Not for customer fleet managers — requireProductAdmin only.
 */
import type { Context } from "npm:hono";
import {
  EPHEMERAL_EVIDENCE_BUCKET,
  LEGACY_DOCS_BUCKET,
  collectLinkedLegacyRefs,
  collectLinkedVehicleRefs,
  collectReferencedLegacyPaths,
  isEvidenceTtlEnabled,
  runEvidenceCleanup,
} from "./evidence_storage.ts";
import type { ProductAdminUser } from "./product_admin_guard.ts";
import { requireProductAdmin } from "./product_admin_guard.ts";

const FILE_CHUNK = 50;
const VEHICLES_BUCKET = "make-37f42386-vehicles";
const FREE_PLAN_STORAGE_BYTES = 1 * 1024 * 1024 * 1024;
const LIST_LIMIT = 1000;

const PURGE_ROLES = new Set(["fleet_admin", "platform_owner", "superadmin"]);

function canPurge(auth: ProductAdminUser): boolean {
  return PURGE_ROLES.has(auth.role) || auth.isPlatformRole;
}

type OrgRollup = {
  orgId: string;
  ephemeral: {
    fileCount: number;
    bytes: number;
    pendingHold: number;
    scheduled: number;
  };
  legacy: { linkedCount: number; linkedBytes: number };
  vehicles: { linkedCount: number; linkedBytes: number };
  totalBytes: number;
};

async function bucketStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bucketId: string,
  folder?: string,
): Promise<{ fileCount: number; totalBytes: number; reachable: boolean }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucketId)
      .list(folder ?? "", { limit: LIST_LIMIT });
    if (error) {
      return { fileCount: 0, totalBytes: 0, reachable: false };
    }
    let totalBytes = 0;
    for (const obj of data || []) {
      const sz = Number(obj?.metadata?.size ?? 0);
      if (sz > 0) totalBytes += sz;
    }
    return {
      fileCount: (data || []).length,
      totalBytes,
      reachable: true,
    };
  } catch {
    return { fileCount: 0, totalBytes: 0, reachable: false };
  }
}

async function listBucketObjects(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bucketId: string,
  folder?: string,
): Promise<{ path: string; bytes: number }[]> {
  const { data, error } = await supabase.storage
    .from(bucketId)
    .list(folder ?? "", { limit: LIST_LIMIT });
  if (error) return [];
  return (data || [])
    .filter((obj: { name?: string }) => obj?.name && !String(obj.name).endsWith("/"))
    .map((obj: { name: string; metadata?: { size?: number } }) => ({
      path: folder ? `${folder}/${obj.name}` : obj.name,
      bytes: Number(obj?.metadata?.size ?? 0),
    }));
}

async function buildEvidenceSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId?: string | null,
) {
  const base = () => {
    let q = supabase.from("evidence_files").select("*", { count: "exact", head: true });
    if (orgId) q = q.eq("org_id", orgId);
    return q;
  };

  const { count: activeCount } = await base()
    .in("status", ["active", "pending_hold"])
    .is("deleted_at", null);

  const { count: scheduledCount } = await base()
    .eq("status", "scheduled")
    .is("deleted_at", null);

  const { count: deletedCount } = await base().eq("status", "deleted");

  const { count: pendingHoldCount } = await base()
    .eq("status", "pending_hold")
    .is("deleted_at", null);

  const weekAhead = new Date();
  weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);
  const { count: expiringWithin7Days } = await base()
    .eq("status", "scheduled")
    .lte("delete_after", weekAhead.toISOString())
    .gt("delete_after", new Date().toISOString())
    .is("deleted_at", null);

  const { data: bucketList } = await supabase.storage
    .from(EPHEMERAL_EVIDENCE_BUCKET)
    .list("", { limit: 1 });

  let totalBytes = 0;
  let sizeQ = supabase
    .from("evidence_files")
    .select("metadata")
    .eq("bucket_id", EPHEMERAL_EVIDENCE_BUCKET)
    .is("deleted_at", null)
    .limit(5000);
  if (orgId) sizeQ = sizeQ.eq("org_id", orgId);
  const { data: sizeRows } = await sizeQ;
  for (const row of sizeRows || []) {
    const sz = Number((row.metadata as { size?: number })?.size);
    if (sz > 0) totalBytes += sz;
  }

  let lastQ = supabase
    .from("evidence_files")
    .select("deleted_at")
    .eq("status", "deleted")
    .order("deleted_at", { ascending: false })
    .limit(1);
  if (orgId) lastQ = lastQ.eq("org_id", orgId);
  const { data: lastDeleted } = await lastQ;

  let purgedQ = supabase
    .from("evidence_files")
    .select("*", { count: "exact", head: true })
    .eq("status", "deleted")
    .gte("deleted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (orgId) purgedQ = purgedQ.eq("org_id", orgId);
  const { count: lastPurged } = await purgedQ;

  return {
    activeCount: activeCount ?? 0,
    scheduledCount: scheduledCount ?? 0,
    deletedCount: deletedCount ?? 0,
    pendingHoldCount: pendingHoldCount ?? 0,
    totalBytes,
    expiringWithin7Days: expiringWithin7Days ?? 0,
    lastCleanupAt: lastDeleted?.[0]?.deleted_at || null,
    lastCleanupPurged: lastPurged ?? 0,
    bucketReachable: Array.isArray(bucketList),
    ttlEnabled: isEvidenceTtlEnabled(),
  };
}

function emptyOrg(orgId: string): OrgRollup {
  return {
    orgId,
    ephemeral: { fileCount: 0, bytes: 0, pendingHold: 0, scheduled: 0 },
    legacy: { linkedCount: 0, linkedBytes: 0 },
    vehicles: { linkedCount: 0, linkedBytes: 0 },
    totalBytes: 0,
  };
}

async function buildByOrgRollup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: any,
) {
  const orgs = new Map<string, OrgRollup>();
  const ensure = (orgId: string) => {
    let row = orgs.get(orgId);
    if (!row) {
      row = emptyOrg(orgId);
      orgs.set(orgId, row);
    }
    return row;
  };

  const { data: evidenceRows } = await supabase
    .from("evidence_files")
    .select("org_id, status, metadata")
    .is("deleted_at", null)
    .limit(5000);

  let ephemeralUnknownCount = 0;
  let ephemeralUnknownBytes = 0;
  for (const row of evidenceRows || []) {
    const orgRaw = typeof row.org_id === "string" ? row.org_id.trim() : "";
    const bytes = Number((row.metadata as { size?: number })?.size ?? 0);
    const isUnknown = !orgRaw || orgRaw === "unknown";
    if (isUnknown) {
      ephemeralUnknownCount += 1;
      if (bytes > 0) ephemeralUnknownBytes += bytes;
      continue;
    }
    const o = ensure(orgRaw);
    o.ephemeral.fileCount += 1;
    if (bytes > 0) o.ephemeral.bytes += bytes;
    if (row.status === "pending_hold") o.ephemeral.pendingHold += 1;
    if (row.status === "scheduled") o.ephemeral.scheduled += 1;
  }

  const [legacyObjects, vehicleObjects, legacyRefs, vehicleRefs] = await Promise.all([
    listBucketObjects(supabase, LEGACY_DOCS_BUCKET, "driver-docs"),
    listBucketObjects(supabase, VEHICLES_BUCKET),
    collectLinkedLegacyRefs(kv),
    collectLinkedVehicleRefs(kv),
  ]);

  const legacyBytesByPath = new Map(legacyObjects.map((o) => [o.path, o.bytes]));
  const vehicleBytesByPath = new Map(vehicleObjects.map((o) => [o.path, o.bytes]));
  const referencedLegacy = new Set(legacyRefs.map((r) => r.path));
  const referencedVehicles = new Set(vehicleRefs.map((r) => r.path));

  for (const ref of legacyRefs) {
    if (!ref.orgId) continue;
    const o = ensure(ref.orgId);
    const bytes = legacyBytesByPath.get(ref.path) ?? 0;
    o.legacy.linkedCount += 1;
    o.legacy.linkedBytes += bytes;
  }

  for (const ref of vehicleRefs) {
    if (!ref.orgId) continue;
    const o = ensure(ref.orgId);
    const bytes = vehicleBytesByPath.get(ref.path) ?? 0;
    o.vehicles.linkedCount += 1;
    o.vehicles.linkedBytes += bytes;
  }

  let legacyOrphanCount = 0;
  let legacyOrphanBytes = 0;
  for (const obj of legacyObjects) {
    if (!referencedLegacy.has(obj.path)) {
      legacyOrphanCount += 1;
      legacyOrphanBytes += obj.bytes;
    }
  }

  let vehicleOrphanCount = 0;
  let vehicleOrphanBytes = 0;
  for (const obj of vehicleObjects) {
    if (!referencedVehicles.has(obj.path)) {
      vehicleOrphanCount += 1;
      vehicleOrphanBytes += obj.bytes;
    }
  }

  const orgList = [...orgs.values()].map((o) => ({
    ...o,
    totalBytes: o.ephemeral.bytes + o.legacy.linkedBytes + o.vehicles.linkedBytes,
  }));
  orgList.sort((a, b) => b.totalBytes - a.totalBytes);

  return {
    generatedAt: new Date().toISOString(),
    orgs: orgList,
    unattributed: {
      legacyOrphans: { count: legacyOrphanCount, bytes: legacyOrphanBytes },
      vehicleOrphans: { count: vehicleOrphanCount, bytes: vehicleOrphanBytes },
      ephemeralUnknown: { count: ephemeralUnknownCount, bytes: ephemeralUnknownBytes },
    },
  };
}

export function registerFleetAdminStorageRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: any,
) {
  app.get("/make-server-37f42386/fleet-admin/storage/overview", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;

      const [docs, ephemeral, vehicles, evidence] = await Promise.all([
        bucketStats(supabase, LEGACY_DOCS_BUCKET, "driver-docs"),
        bucketStats(supabase, EPHEMERAL_EVIDENCE_BUCKET),
        bucketStats(supabase, VEHICLES_BUCKET),
        buildEvidenceSummary(supabase),
      ]);

      const totalBytes = docs.totalBytes + ephemeral.totalBytes + vehicles.totalBytes;
      const overQuota = totalBytes > FREE_PLAN_STORAGE_BYTES;
      let status: "healthy" | "over_quota" | "ttl_off" = "healthy";
      if (!evidence.ttlEnabled) status = "ttl_off";
      if (overQuota) status = "over_quota";

      return c.json({
        ttlEnabled: evidence.ttlEnabled,
        freePlanLimitBytes: FREE_PLAN_STORAGE_BYTES,
        totalBytes,
        overQuota,
        status,
        canPurge: canPurge(auth),
        buckets: [
          {
            id: LEGACY_DOCS_BUCKET,
            label: "Legacy evidence docs",
            purpose: "Receipts & proofs (pre-TTL / permanent uploads)",
            folder: "driver-docs",
            ...docs,
          },
          {
            id: EPHEMERAL_EVIDENCE_BUCKET,
            label: "Ephemeral evidence",
            purpose: "Scan photos with 14-day retention after resolve",
            ...ephemeral,
          },
          {
            id: VEHICLES_BUCKET,
            label: "Vehicle images",
            purpose: "Vehicle catalog / plate images",
            ...vehicles,
          },
        ],
        evidence,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/make-server-37f42386/fleet-admin/storage/by-org", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      return c.json(await buildByOrgRollup(supabase, kv));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/make-server-37f42386/fleet-admin/storage/orgs/:orgId", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;

      const orgId = String(c.req.param("orgId") || "").trim();
      if (!orgId) return c.json({ error: "orgId required" }, 400);

      const [evidence, evidenceRows, legacyRefs, vehicleRefs, legacyObjects, vehicleObjects] =
        await Promise.all([
          buildEvidenceSummary(supabase, orgId),
          supabase
            .from("evidence_files")
            .select(
              "id, storage_path, evidence_type, status, metadata, uploaded_at, delete_after",
            )
            .eq("org_id", orgId)
            .is("deleted_at", null)
            .order("uploaded_at", { ascending: false })
            .limit(50),
          collectLinkedLegacyRefs(kv, orgId),
          collectLinkedVehicleRefs(kv, orgId),
          listBucketObjects(supabase, LEGACY_DOCS_BUCKET, "driver-docs"),
          listBucketObjects(supabase, VEHICLES_BUCKET),
        ]);

      const legacyBytesByPath = new Map(legacyObjects.map((o) => [o.path, o.bytes]));
      const vehicleBytesByPath = new Map(vehicleObjects.map((o) => [o.path, o.bytes]));

      const byStatus: Record<string, { count: number; bytes: number }> = {};
      const byType: Record<string, { count: number; bytes: number }> = {};
      for (const row of evidenceRows.data || []) {
        const bytes = Number((row.metadata as { size?: number })?.size ?? 0);
        const st = String(row.status || "unknown");
        const ty = String(row.evidence_type || "unknown");
        byStatus[st] = byStatus[st] || { count: 0, bytes: 0 };
        byStatus[st].count += 1;
        byStatus[st].bytes += bytes;
        byType[ty] = byType[ty] || { count: 0, bytes: 0 };
        byType[ty].count += 1;
        byType[ty].bytes += bytes;
      }

      const legacyLinked = legacyRefs.map((r) => ({
        path: r.path,
        bytes: legacyBytesByPath.get(r.path) ?? 0,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
      }));
      const vehiclesLinked = vehicleRefs.map((r) => ({
        path: r.path,
        bytes: vehicleBytesByPath.get(r.path) ?? 0,
        vehicleId: r.vehicleId,
        licensePlate: r.licensePlate,
      }));

      const ephemeralBytes = evidence.totalBytes;
      const legacyLinkedBytes = legacyLinked.reduce((s, r) => s + r.bytes, 0);
      const vehicleLinkedBytes = vehiclesLinked.reduce((s, r) => s + r.bytes, 0);

      return c.json({
        orgId,
        evidence,
        ephemeral: {
          byStatus,
          byType,
          recent: (evidenceRows.data || []).map(
            (r: {
              id: string;
              storage_path: string;
              evidence_type: string;
              status: string;
              metadata?: { size?: number };
              uploaded_at: string;
            }) => ({
              id: r.id,
              storage_path: r.storage_path,
              evidence_type: r.evidence_type,
              status: r.status,
              size: Number(r.metadata?.size ?? 0),
              uploaded_at: r.uploaded_at,
            }),
          ),
        },
        legacy: {
          linked: legacyLinked,
          note: "Platform orphans are not assigned to this fleet — see Unattributed on the main list.",
        },
        vehicles: { linked: vehiclesLinked },
        totals: {
          ephemeralBytes,
          legacyLinkedBytes,
          vehicleLinkedBytes,
          totalBytes: ephemeralBytes + legacyLinkedBytes + vehicleLinkedBytes,
        },
        canPurge: canPurge(auth),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get("/make-server-37f42386/fleet-admin/storage/evidence-summary", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      return c.json(await buildEvidenceSummary(supabase));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/make-server-37f42386/fleet-admin/storage/cleanup", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;

      const body = await c.req.json().catch(() => ({}));
      const dryRun = body?.dryRun !== false;
      const orgId =
        typeof body?.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
      const result = await runEvidenceCleanup(supabase, kv, { dryRun, orgId });
      return c.json({ success: true, orgId, ...result });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/make-server-37f42386/fleet-admin/storage/audit-legacy", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;

      const body = await c.req.json().catch(() => ({}));
      const orgId =
        typeof body?.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;

      const { data: objects, error } = await supabase.storage
        .from(LEGACY_DOCS_BUCKET)
        .list("driver-docs", { limit: LIST_LIMIT });
      if (error) throw error;

      if (orgId) {
        const refs = await collectLinkedLegacyRefs(kv, orgId);
        const bytesByName = new Map(
          (objects || []).map((obj: { name: string; metadata?: { size?: number } }) => [
            `driver-docs/${obj.name}`,
            Number(obj?.metadata?.size ?? 0),
          ]),
        );
        let linkedBytes = 0;
        const linked = refs.map((r) => {
          const bytes = bytesByName.get(r.path) ?? 0;
          linkedBytes += bytes;
          return { path: r.path, bytes, sourceType: r.sourceType, sourceId: r.sourceId };
        });
        return c.json({
          success: true,
          bucket: LEGACY_DOCS_BUCKET,
          orgId,
          scanned: linked.length,
          linkedCount: linked.length,
          orphanCount: 0,
          linkedBytes,
          orphanBytes: 0,
          orphans: [],
          linked,
          note: "Org-scoped audit returns linked files only; orphans are platform-global.",
        });
      }

      const referenced = await collectReferencedLegacyPaths(kv);
      const orphan: { path: string; bytes: number }[] = [];
      const linked: { path: string; bytes: number }[] = [];
      let orphanBytes = 0;
      let linkedBytes = 0;

      for (const obj of objects || []) {
        const path = `driver-docs/${obj.name}`;
        const bytes = Number(obj?.metadata?.size ?? 0);
        if (referenced.has(path)) {
          linked.push({ path, bytes });
          linkedBytes += bytes;
        } else {
          orphan.push({ path, bytes });
          orphanBytes += bytes;
        }
      }

      return c.json({
        success: true,
        bucket: LEGACY_DOCS_BUCKET,
        scanned: (objects || []).length,
        linkedCount: linked.length,
        orphanCount: orphan.length,
        linkedBytes,
        orphanBytes,
        orphans: orphan.slice(0, 100),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/make-server-37f42386/fleet-admin/storage/purge-legacy", async (c: Context) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      if (!canPurge(auth)) {
        return c.json(
          { error: "Forbidden", message: "Purge requires fleet_admin or platform owner" },
          403,
        );
      }

      const body = await c.req.json().catch(() => ({}));
      if (body?.confirm !== true) {
        return c.json({ error: "confirm_required", message: "Pass confirm: true to purge" }, 400);
      }

      const orgId =
        typeof body?.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
      let paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
      const orphanOnly = body?.orphanOnly !== false;
      const olderThanDays =
        typeof body?.olderThanDays === "number" && body.olderThanDays > 0
          ? body.olderThanDays
          : null;

      // Org-scoped: only linked legacy for that org (never claim org orphans)
      if (orgId && !paths.length) {
        const refs = await collectLinkedLegacyRefs(kv, orgId);
        paths = refs.map((r) => r.path);
      } else if (!paths.length) {
        const { data: objects } = await supabase.storage
          .from(LEGACY_DOCS_BUCKET)
          .list("driver-docs", { limit: LIST_LIMIT });
        const referenced =
          orphanOnly || olderThanDays == null
            ? await collectReferencedLegacyPaths(kv)
            : null;
        const cutoffMs =
          olderThanDays != null
            ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
            : null;

        for (const obj of objects || []) {
          const path = `driver-docs/${obj.name}`;
          if (orphanOnly && referenced && !referenced.has(path)) {
            paths.push(path);
            continue;
          }
          if (!orphanOnly && olderThanDays != null && cutoffMs != null) {
            const created = obj?.created_at ? new Date(obj.created_at).getTime() : 0;
            if (created > 0 && created < cutoffMs) paths.push(path);
          }
        }
      }

      let deleted = 0;
      for (let i = 0; i < paths.length; i += FILE_CHUNK) {
        const chunk = paths.slice(i, i + FILE_CHUNK);
        const { error } = await supabase.storage.from(LEGACY_DOCS_BUCKET).remove(chunk);
        if (!error) deleted += chunk.length;
      }

      return c.json({
        success: true,
        deleted,
        pathsProcessed: paths.length,
        orgId,
        mode: orgId
          ? "org_linked"
          : orphanOnly
            ? "orphan"
            : olderThanDays != null
              ? "aged"
              : "paths",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
