import type { CatalogRow, VehicleLook } from "../_shared/vehiclePictures/lookKey.ts";
import {
  type AdminPictureListFilters,
  type AdminPictureStatusCounts,
  type VehiclePictureDb,
  type VehiclePictureVersionRow,
} from "./vehicle_picture_db.ts";
import type { VehiclePictureRow } from "./vehicle_picture_types.ts";
import type { VehiclePicturesSettingsKv } from "./vehicle_pictures_settings.ts";
import { mergeVehiclePicturesSettings } from "./vehicle_pictures_settings.ts";

export type FakeR2 = Map<string, Uint8Array>;

function memoryBecomeReady(
  pictures: Map<string, VehiclePictureRow>,
  versions: Map<string, VehiclePictureVersionRow[]>,
  args: Parameters<VehiclePictureDb["becomeReady"]>[0],
): void {
  const p = pictures.get(args.pictureId);
  if (!p) return;
  const now = new Date().toISOString();
  const source = args.source ?? "ai";
  const list = [...(versions.get(args.pictureId) ?? [])];
  list.push({
    picture_id: args.pictureId,
    version: args.version,
    r2_key: args.r2Key,
    source,
    cost_usd: args.costUsd,
    provider: args.provider,
    ai_model: args.aiModel,
    prompt_version: args.promptVersion,
    created_at: now,
    retired_at: null,
    file_deleted_at: null,
  });
  for (const v of list) {
    if (v.version < args.version && !v.retired_at) v.retired_at = now;
  }
  versions.set(args.pictureId, list);
  pictures.set(args.pictureId, {
    ...p,
    status: "ready",
    version: args.version,
    r2_key: args.r2Key,
    source,
    cost_usd: args.costUsd,
    provider: args.provider,
    ai_model: args.aiModel,
    prompt_version: args.promptVersion,
    prompt: args.prompt,
    made_at: now,
    made_by: args.staffUserId ?? p.made_by,
    lease_until: null,
    last_error: null,
  });
}

export function createSettingsStore(initial?: Partial<VehiclePicturesSettingsKv>) {
  let state = mergeVehiclePicturesSettings({ ai_vehicle_pictures: true, ...initial });
  return {
    load: async () => state,
    save: async (patch: Partial<VehiclePicturesSettingsKv>) => {
      state = mergeVehiclePicturesSettings({ ...state, ...patch });
    },
    snapshot: () => state,
  };
}

export function fakeR2WithCopy(): {
  map: FakeR2;
  contentTypes: Map<string, string>;
  r2: {
    put: (bucket: string, key: string, bytes: Uint8Array, ct?: string, _cc?: string) => Promise<void>;
    copy: (
      from: { bucket: string; key: string },
      to: { bucket: string; key: string },
      meta: { contentType: string; cacheControl: string },
    ) => Promise<void>;
    remove: (bucket: string, keys: string[]) => Promise<void>;
    head: (bucket: string, key: string) => Promise<{ size: number; contentType: string | null } | null>;
  };
  failDeleteOnce: Set<string>;
  setContentType: (key: string, contentType: string) => void;
} {
  const map: FakeR2 = new Map();
  const contentTypes = new Map<string, string>();
  const failDeleteOnce = new Set<string>();

  function inferContentType(key: string): string {
    if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
    if (key.endsWith(".webp")) return "image/webp";
    return "image/png";
  }

  return {
    map,
    contentTypes,
    failDeleteOnce,
    setContentType: (key, contentType) => {
      contentTypes.set(key, contentType);
    },
    r2: {
      put: async (_b, key, bytes, ct) => {
        map.set(key, bytes);
        contentTypes.set(key, ct ?? inferContentType(key));
      },
      copy: async (from, to, meta) => {
        const bytes = map.get(from.key);
        if (!bytes) throw new Error(`copy missing ${from.key}`);
        map.set(to.key, bytes);
        contentTypes.set(to.key, meta.contentType);
      },
      remove: async (_b, keys) => {
        for (const k of keys) {
          if (failDeleteOnce.has(k)) {
            failDeleteOnce.delete(k);
            throw new Error("delete failed");
          }
          map.delete(k);
          contentTypes.delete(k);
        }
      },
      head: async (_b, key) =>
        map.has(key)
          ? {
            size: map.get(key)!.length,
            contentType: contentTypes.get(key) ?? inferContentType(key),
          }
          : null,
    },
  };
}

export function createMemoryVehiclePictureDb(): {
  db: VehiclePictureDb;
  pictures: Map<string, VehiclePictureRow>;
  versions: Map<string, VehiclePictureVersionRow[]>;
  fleetVehicles: Map<string, {
    id: string;
    organization_id: string;
    vehicle_catalog_id: string;
    color_standard: string;
    picture_id: string | null;
  }>;
  catalogs: Map<string, CatalogRow>;
  leaseHolder: string | null;
  leaseUntil: string | null;
} {
  const pictures = new Map<string, VehiclePictureRow>();
  const versions = new Map<string, VehiclePictureVersionRow[]>();
  const fleetVehicles = new Map<string, {
    id: string;
    organization_id: string;
    vehicle_catalog_id: string;
    color_standard: string;
    picture_id: string | null;
  }>();
  const catalogs = new Map<string, CatalogRow>();
  let leaseHolder: string | null = null;
  let leaseUntil: string | null = null;

  const db: VehiclePictureDb = {
    async getCatalogRow(catalogId) {
      return catalogs.get(catalogId) ?? null;
    },
    async getCatalogRowsIn(catalogIds) {
      const out = new Map<string, CatalogRow>();
      for (const id of catalogIds) {
        const row = catalogs.get(id);
        if (row) out.set(id, row);
      }
      return out;
    },
    async getPicturesByIdsIn(ids) {
      const out = new Map<string, VehiclePictureRow>();
      for (const id of ids) {
        const p = pictures.get(id);
        if (p) out.set(id, p);
      }
      return out;
    },
    async getLivePicturesByLookKeysIn(lookKeys) {
      const out = new Map<string, VehiclePictureRow>();
      const want = new Set(lookKeys);
      for (const p of pictures.values()) {
        if (!p.deleted_at && want.has(p.look_key)) out.set(p.look_key, p);
      }
      return out;
    },
    async getLivePictureByLookKey(lookKey) {
      for (const p of pictures.values()) {
        if (p.look_key === lookKey && !p.deleted_at) return p;
      }
      return null;
    },
    async getRemovedPictureByLookKey(lookKey) {
      const rows = [...pictures.values()]
        .filter((p) => p.look_key === lookKey && p.deleted_at)
        .sort((a, b) => Date.parse(b.deleted_at!) - Date.parse(a.deleted_at!));
      return rows[0] ?? null;
    },
    async insertQueuedPicture(look, orgId, catalogId) {
      if ([...pictures.values()].some((p) => p.look_key === look.key && !p.deleted_at)) {
        return null;
      }
      const id = crypto.randomUUID();
      const row: VehiclePictureRow = {
        id,
        look_key: look.key,
        make: look.make,
        model: look.model,
        generation: look.generation,
        body_type: look.bodyType,
        facelift_stage: look.faceliftStage,
        start_year: look.startYear,
        end_year: look.endYear,
        color: look.color,
        example_catalog_id: catalogId,
        status: "queued",
        lane: "live",
        r2_key: null,
        version: 1,
        source: "ai",
        provider: null,
        ai_model: null,
        prompt: null,
        prompt_version: null,
        cost_usd: null,
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        lease_until: null,
        last_error: null,
        staff_rating: null,
        made_at: null,
        made_by: null,
        deleted_at: null,
        stale: false,
        queued_by_org: orgId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      pictures.set(id, row);
      return row;
    },
    async resurrectPicture(id) {
      const row = pictures.get(id);
      if (!row || !row.deleted_at) return null;
      const next: VehiclePictureRow = {
        ...row,
        deleted_at: null,
        status: "queued",
        lane: "live",
        version: row.version + 1,
        next_attempt_at: new Date().toISOString(),
      };
      pictures.set(id, next);
      return next;
    },
    async getPictureById(id) {
      return pictures.get(id) ?? null;
    },
    async setVehiclePictureId(vehicleId, pictureId) {
      const v = fleetVehicles.get(vehicleId);
      if (v) fleetVehicles.set(vehicleId, { ...v, picture_id: pictureId });
    },
    async countOrgQueuedToday(orgId, now) {
      const day = now.toISOString().slice(0, 10);
      let count = 0;
      for (const p of pictures.values()) {
        if (p.queued_by_org === orgId && p.created_at.slice(0, 10) === day) count += 1;
      }
      return count;
    },
    async listVehiclesNeedingPicture(afterId, limit) {
      const rows = [...fleetVehicles.values()]
        .filter((v) => v.vehicle_catalog_id && v.color_standard && !v.picture_id)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const filtered = afterId ? rows.filter((r) => r.id > afterId) : rows;
      return filtered.slice(0, limit);
    },
    async tryAcquireWorkerLease(holderId, heldUntilIso) {
      const now = Date.now();
      if (leaseUntil && Date.parse(leaseUntil) > now) return false;
      leaseHolder = holderId;
      leaseUntil = heldUntilIso;
      return true;
    },
    async releaseWorkerLease(holderId) {
      if (leaseHolder === holderId) {
        leaseHolder = null;
        leaseUntil = null;
      }
    },
    async claimQueuedRows(lane, limit, leaseUntilIso) {
      const now = Date.now();
      const due = [...pictures.values()]
        .filter((p) =>
          !p.deleted_at &&
          p.status === "queued" &&
          p.lane === lane &&
          p.next_attempt_at &&
          Date.parse(p.next_attempt_at) <= now
        )
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        .slice(0, limit);
      for (const p of due) {
        pictures.set(p.id, { ...p, status: "generating", lease_until: leaseUntilIso });
      }
      return due.map((p) => pictures.get(p.id)!);
    },
    async releaseClaimedToQueued(id) {
      const p = pictures.get(id);
      if (p && p.status === "generating") {
        pictures.set(id, { ...p, status: "queued", lease_until: null });
      }
    },
    async incrementAttempts(id) {
      const p = pictures.get(id);
      if (!p) return 0;
      const n = p.attempts + 1;
      pictures.set(id, { ...p, attempts: n });
      return n;
    },
    async requeuePicture(id, nextAttemptIso) {
      const p = pictures.get(id);
      if (!p) return;
      pictures.set(id, { ...p, status: "queued", next_attempt_at: nextAttemptIso, lease_until: null });
    },
    async failPicture(id, lastError) {
      const p = pictures.get(id);
      if (!p) return;
      pictures.set(id, { ...p, status: "failed", last_error: lastError, lease_until: null });
    },
    async becomeReady(args) {
      memoryBecomeReady(pictures, versions, args);
    },
    async sweepStuck() {
      const now = Date.now();
      let count = 0;
      for (const [id, p] of pictures) {
        if (
          p.status === "generating" &&
          !p.deleted_at &&
          p.lease_until &&
          Date.parse(p.lease_until) < now
        ) {
          pictures.set(id, {
            ...p,
            status: "queued",
            lease_until: null,
            next_attempt_at: new Date().toISOString(),
          });
          count += 1;
        }
      }
      return count;
    },
    async requeueGiveBackAttempt(id, nextAttemptIso) {
      const p = pictures.get(id);
      if (!p) return;
      pictures.set(id, {
        ...p,
        status: "queued",
        attempts: Math.max(0, p.attempts - 1),
        next_attempt_at: nextAttemptIso ?? new Date().toISOString(),
        lease_until: null,
      });
    },
    async deferAllRemakeRows(nextAttemptIso) {
      for (const [id, p] of pictures) {
        if (p.lane === "remake" && !p.deleted_at && (p.status === "queued" || p.status === "generating")) {
          pictures.set(id, {
            ...p,
            status: "queued",
            next_attempt_at: nextAttemptIso,
            lease_until: null,
          });
        }
      }
    },
    async listVersions(pictureId) {
      return [...(versions.get(pictureId) ?? [])].sort((a, b) => a.version - b.version);
    },
    async markVersionFileDeleted(pictureId, version, deletedAtIso) {
      const list = versions.get(pictureId);
      if (!list) return;
      versions.set(
        pictureId,
        list.map((v) => (v.version === version ? { ...v, file_deleted_at: deletedAtIso } : v)),
      );
    },
    async listCleanupDeleteCandidates(retentionDays, now, limit) {
      const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
      const out: Array<{ pictureId: string; version: number; r2Key: string }> = [];

      for (const p of pictures.values()) {
        if (p.deleted_at && Date.parse(p.deleted_at) < cutoff) {
          const vers = versions.get(p.id) ?? [];
          for (const v of vers) {
            if (!v.file_deleted_at) {
              out.push({ pictureId: p.id, version: v.version, r2Key: v.r2_key });
              if (out.length >= limit) return out;
            }
          }
        }
      }

      for (const p of pictures.values()) {
        if (p.deleted_at) continue;
        const vers = [...(versions.get(p.id) ?? [])].filter((v) => v.retired_at && !v.file_deleted_at);
        if (!vers.length) continue;
        vers.sort((a, b) => b.version - a.version);
        const keepSecond = vers[0]?.version;
        for (const v of vers) {
          if (v.version === p.version || v.version === keepSecond) continue;
          if (!v.retired_at || Date.parse(v.retired_at) >= cutoff) continue;
          out.push({ pictureId: p.id, version: v.version, r2Key: v.r2_key });
          if (out.length >= limit) return out;
        }
      }
      return out;
    },
    async queueRegenerate(id, nowIso) {
      const p = pictures.get(id);
      if (!p || p.deleted_at) return null;
      const next: VehiclePictureRow = {
        ...p,
        version: p.version + 1,
        status: "queued",
        lane: "live",
        next_attempt_at: nowIso,
        lease_until: null,
      };
      pictures.set(id, next);
      return next;
    },
    async softRemovePicture(id, nowIso) {
      const p = pictures.get(id);
      if (!p) return;
      pictures.set(id, { ...p, deleted_at: nowIso, status: "failed", lease_until: null });
      const list = versions.get(id) ?? [];
      versions.set(
        id,
        list.map((v) => (v.retired_at ? v : { ...v, retired_at: nowIso })),
      );
    },
    async countVehiclesWithPicture(pictureId) {
      let n = 0;
      for (const v of fleetVehicles.values()) {
        if (v.picture_id === pictureId) n += 1;
      }
      return n;
    },

    async listCatalogRowsForStaleLooks() {
      return [...catalogs.values()];
    },

    async listAdminPictures(filters: AdminPictureListFilters) {
      let rows = [...pictures.values()].filter((p) => !p.deleted_at);
      if (filters.color?.trim()) rows = rows.filter((p) => p.color === filters.color?.trim());
      if (filters.status?.trim()) rows = rows.filter((p) => p.status === filters.status?.trim());
      if (filters.rating?.trim()) rows = rows.filter((p) => p.staff_rating === filters.rating?.trim());
      const search = filters.search?.trim().toLowerCase();
      if (search) {
        rows = rows.filter((p) =>
          `${p.make} ${p.model} ${p.generation}`.toLowerCase().includes(search)
        );
      }
      if (filters.staleOnly) rows = rows.filter((p) => p.stale);
      rows.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      const from = (filters.page - 1) * filters.pageSize;
      return { items: rows.slice(from, from + filters.pageSize), total: rows.length };
    },

    async adminPictureCounts(): Promise<AdminPictureStatusCounts> {
      let ready = 0;
      let beingMade = 0;
      let failed = 0;
      let stale = 0;
      for (const p of pictures.values()) {
        if (p.deleted_at) continue;
        if (p.status === "ready") ready += 1;
        else if (p.status === "queued" || p.status === "generating") beingMade += 1;
        else if (p.status === "failed") failed += 1;
        if (p.stale) stale += 1;
      }
      return { ready, beingMade, failed, stale };
    },

    async listLivePictureIdsAndLookKeysPage(offset, limit) {
      const live = [...pictures.values()]
        .filter((p) => !p.deleted_at)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return live.slice(offset, offset + limit).map((p) => ({ id: p.id, look_key: p.look_key }));
    },

    async setStalePictureIds(staleIds) {
      const want = new Set(staleIds);
      for (const [id, p] of pictures) {
        if (p.deleted_at) continue;
        const nextStale = want.has(id);
        if (p.stale !== nextStale) pictures.set(id, { ...p, stale: nextStale });
      }
    },

    async countRemakeLaneActive() {
      let n = 0;
      for (const p of pictures.values()) {
        if (!p.deleted_at && p.lane === "remake" && (p.status === "queued" || p.status === "generating")) {
          n += 1;
        }
      }
      return n;
    },

    async setStaffRating(id, rating) {
      const p = pictures.get(id);
      if (!p || p.deleted_at) return;
      pictures.set(id, { ...p, staff_rating: rating });
    },

    async listOutdatedReadyPictureIds(currentPromptVersion, currentModel) {
      const out: string[] = [];
      for (const p of pictures.values()) {
        if (p.deleted_at || p.status !== "ready") continue;
        const pv = p.prompt_version ?? 0;
        const model = p.ai_model ?? "";
        if (pv < currentPromptVersion || model !== currentModel) out.push(p.id);
      }
      return out;
    },

    async queueRemakeBatch(ids, nowIso) {
      let n = 0;
      for (const id of ids) {
        const p = pictures.get(id);
        if (!p || p.deleted_at || p.status !== "ready") continue;
        pictures.set(id, {
          ...p,
          version: p.version + 1,
          status: "queued",
          lane: "remake",
          next_attempt_at: nowIso,
          lease_until: null,
        });
        n += 1;
      }
      return n;
    },
  };

  return {
    db,
    pictures,
    versions,
    fleetVehicles,
    catalogs,
    get leaseHolder() { return leaseHolder; },
    get leaseUntil() { return leaseUntil; },
  };
}

export function defaultTestCatalog(catalogId = "cat-1"): CatalogRow {
  return {
    make: "toyota",
    model: "roomy",
    generation: "1st gen",
    body_type: "hatchback",
    trim_series: null,
    start_year: 2018,
    end_year: 2022,
  };
}

export function defaultSettings(overrides?: Partial<VehiclePicturesSettingsKv>) {
  return mergeVehiclePicturesSettings({ ai_vehicle_pictures: true, ...overrides });
}

export function seedReadyLook(
  pictures: Map<string, VehiclePictureRow>,
  look: VehicleLook,
  orgId: string,
): VehiclePictureRow {
  const id = crypto.randomUUID();
  const row: VehiclePictureRow = {
    id,
    look_key: look.key,
    make: look.make,
    model: look.model,
    generation: look.generation,
    body_type: look.bodyType,
    facelift_stage: look.faceliftStage,
    start_year: look.startYear,
    end_year: look.endYear,
    color: look.color,
    example_catalog_id: "cat-1",
    status: "ready",
    lane: "live",
    r2_key: `catalogue/images/${id}/v1.png`,
    version: 1,
    source: "ai",
    provider: "gemini",
    ai_model: "gemini-3.1-flash-image",
    prompt: "test",
    prompt_version: 1,
    cost_usd: 0.04,
    attempts: 1,
    next_attempt_at: null,
    lease_until: null,
    last_error: null,
    staff_rating: null,
    made_at: new Date().toISOString(),
    made_by: null,
    deleted_at: null,
    stale: false,
    queued_by_org: orgId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  pictures.set(id, row);
  return row;
}