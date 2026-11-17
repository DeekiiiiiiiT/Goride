import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { R2Client } from "../_shared/objectStorage/r2Client.ts";
import { createVehiclePictureDb, type VehiclePictureDb } from "./vehicle_picture_db.ts";
import { kickVehiclePictureWorker } from "./vehicle_picture_kick.ts";

export class PictureInUseError extends Error {
  readonly code = "PICTURE_IN_USE";
  constructor() {
    super("PICTURE_IN_USE");
  }
}

export class UploadTypeNotAllowedError extends Error {
  readonly code = "UPLOAD_TYPE_NOT_ALLOWED";
  constructor() {
    super("UPLOAD_TYPE_NOT_ALLOWED");
  }
}

function pictureFileFromContentType(contentType: string | null | undefined): { ext: string; contentType: string } {
  const ct = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (ct === "image/png") return { ext: "png", contentType: "image/png" };
  if (ct === "image/jpeg" || ct === "image/jpg") return { ext: "jpg", contentType: "image/jpeg" };
  if (ct === "image/webp") return { ext: "webp", contentType: "image/webp" };
  throw new UploadTypeNotAllowedError();
}

export type VersionFnsDeps = {
  supabase: SupabaseClient;
  r2: R2Client | null;
  now: () => Date;
  db?: VehiclePictureDb;
};

function depsDb(deps: VersionFnsDeps) {
  return deps.db ?? createVehiclePictureDb(deps.supabase);
}

export async function regeneratePicture(
  deps: VersionFnsDeps,
  id: string,
  _staffUserId: string,
): Promise<void> {
  const db = depsDb(deps);
  const row = await db.queueRegenerate(id, deps.now().toISOString());
  if (!row) throw new Error("Picture not found");
  await kickVehiclePictureWorker(deps.supabase);
}

export async function replacePicture(
  deps: VersionFnsDeps,
  id: string,
  uploadedKey: string,
  staffUserId: string,
): Promise<void> {
  const db = depsDb(deps);
  const pic = await db.getPictureById(id);
  if (!pic || pic.deleted_at) throw new Error("Picture not found");
  if (!deps.r2) throw new Error("R2 not configured");

  const head = await deps.r2.head("public", uploadedKey);
  if (!head) throw new Error("Upload not found");
  const { ext, contentType } = pictureFileFromContentType(head.contentType);
  const version = pic.version + 1;
  const destKey = `catalogue/images/${id}/v${version}.${ext}`;
  await deps.r2.copy(
    { bucket: "public", key: uploadedKey },
    { bucket: "public", key: destKey },
    { contentType, cacheControl: "public, max-age=31536000, immutable" },
  );

  await db.becomeReady({
    pictureId: id,
    version,
    r2Key: destKey,
    costUsd: pic.cost_usd,
    provider: pic.provider ?? "staff",
    aiModel: pic.ai_model ?? "",
    promptVersion: pic.prompt_version ?? 0,
    prompt: pic.prompt ?? "",
    source: "staff_upload",
    staffUserId,
  });

  try {
    await deps.r2.remove("public", [uploadedKey]);
  } catch {
    // non-fatal
  }
}

export async function restorePrevious(
  deps: VersionFnsDeps,
  id: string,
  staffUserId: string,
): Promise<void> {
  const db = depsDb(deps);
  const pic = await db.getPictureById(id);
  if (!pic || pic.deleted_at) throw new Error("Picture not found");
  if (!deps.r2) throw new Error("R2 not configured");

  const versions = await db.listVersions(id);
  const retired = versions
    .filter((v) => v.retired_at && !v.file_deleted_at)
    .sort((a, b) => b.version - a.version);

  let sourceKey: string | null = null;
  let sourceCost: number | null = null;
  let sourceContentType: string | null = null;
  for (const v of retired) {
    const head = await deps.r2.head("public", v.r2_key);
    if (head) {
      sourceKey = v.r2_key;
      sourceCost = v.cost_usd;
      sourceContentType = head.contentType;
      break;
    }
  }
  if (!sourceKey) throw new Error("No restorable version");

  // Keep the restored file's real type (a staff upload may be JPEG or WebP); AI files are PNG.
  const { ext, contentType } = pictureFileFromContentType(sourceContentType ?? "image/png");
  const version = pic.version + 1;
  const destKey = `catalogue/images/${id}/v${version}.${ext}`;
  await deps.r2.copy(
    { bucket: "public", key: sourceKey },
    { bucket: "public", key: destKey },
    { contentType, cacheControl: "public, max-age=31536000, immutable" },
  );

  await db.becomeReady({
    pictureId: id,
    version,
    r2Key: destKey,
    costUsd: sourceCost,
    provider: pic.provider ?? "gemini",
    aiModel: pic.ai_model ?? "",
    promptVersion: pic.prompt_version ?? 0,
    prompt: pic.prompt ?? "",
    source: "restore",
    staffUserId,
  });
}

export async function removePicture(deps: VersionFnsDeps, id: string): Promise<void> {
  const db = depsDb(deps);
  const inUse = await db.countVehiclesWithPicture(id);
  if (inUse > 0) throw new PictureInUseError();
  await db.softRemovePicture(id, deps.now().toISOString());
}

/** Testable variant using an injected db (harness). */
export async function removePictureOnDb(
  db: ReturnType<typeof createVehiclePictureDb>,
  id: string,
  nowIso: string,
): Promise<void> {
  const inUse = await db.countVehiclesWithPicture(id);
  if (inUse > 0) throw new PictureInUseError();
  await db.softRemovePicture(id, nowIso);
}