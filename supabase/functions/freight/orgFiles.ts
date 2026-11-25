/**
 * Enterprise org Files — upload to enterprise-freight-docs (or roam-private when the R2 switch is
 * on) + freight.org_files registry.
 */
import { serviceClient } from "../_shared/enterpriseAccess.ts";
import {
  detectFileMagicBytes,
  extForMime,
  IMAGE_AND_PDF_MIMES,
} from "../_shared/fileMagic.ts";
import {
  buildFreightDocR2Key,
  FREIGHT_DOCS_BUCKET,
  FREIGHT_DOCS_LINK_SECONDS,
  isFreightDocOnR2,
  isR2FreightDocsEnabled,
  legacyFreightDocPath,
  putFreightDoc,
  R2_PRIVATE_BUCKET_ID,
  removeFreightDoc,
  signFreightDocUrl,
} from "./freight_docs_storage.ts";

export const ORG_FILES_BUCKET = FREIGHT_DOCS_BUCKET;
export const ORG_FILE_KINDS = [
  "pod",
  "invoice",
  "bol",
  "customs",
  "packing_list",
  "other",
] as const;
export type OrgFileKind = (typeof ORG_FILE_KINDS)[number];

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set([...IMAGE_AND_PDF_MIMES, "image/heic"]);

function freightDb() {
  return serviceClient().schema("freight");
}

export type OrgFileRow = {
  id: string;
  organization_id: string;
  bucket_id: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  byte_size: number | null;
  kind: string;
  source_type: string | null;
  source_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type UploadOrgFileInput = {
  organizationId: string;
  file: File;
  kind: OrgFileKind;
  sourceType?: string | null;
  sourceId?: string | null;
  uploadedBy?: string | null;
  /** Override client file name when provided. */
  fileName?: string | null;
};

export type UploadOrgFileResult =
  | { ok: true; file: OrgFileRow }
  | { ok: false; status: number; error: string };

export async function uploadOrgFile(
  input: UploadOrgFileInput,
): Promise<UploadOrgFileResult> {
  if (input.file.size > MAX_BYTES) {
    return { ok: false, status: 400, error: "File must be 20MB or smaller" };
  }

  const buffer = new Uint8Array(await input.file.arrayBuffer());
  const detected = detectFileMagicBytes(buffer);
  if (!detected || !ALLOWED.has(detected)) {
    return {
      ok: false,
      status: 400,
      error: "File content does not match an allowed type (PDF or image)",
    };
  }

  try {
    const { scanForMalware } = await import("../_shared/malwareScan.ts");
    const scan = await scanForMalware(buffer);
    if (!scan.clean) {
      // Magic-byte validation already ran. KYC uses fail-closed malwareScan;
      // org Files stay usable when VirusTotal isn't provisioned on the project.
      if (scan.unavailable || scan.reason === "scanner not configured") {
        console.warn(
          "[orgFiles] MALWARE_SCAN_API_KEY unset — allowing upload after type check",
        );
      } else {
        return {
          ok: false,
          status: 422,
          error: scan.reason ||
            "This file failed a security scan and was not uploaded.",
        };
      }
    }
  } catch {
    // Malware scanner optional — continue if module unavailable.
  }

  const ext = extForMime(detected);
  const id = crypto.randomUUID();
  // Cloudflare R2 (freight-docs/<org>/<kind>/<uuid>.<ext>) when switched on. Same checks and
  // same answer as before; only where the bytes live changes.
  const useR2 = isR2FreightDocsEnabled();
  const storagePath = useR2
    ? buildFreightDocR2Key(input.organizationId, input.kind, ext)
    : legacyFreightDocPath(input.organizationId, input.kind, ext, id);
  const bucketId = useR2 ? R2_PRIVATE_BUCKET_ID : ORG_FILES_BUCKET;
  const fileName =
    (input.fileName && input.fileName.trim()) ||
    input.file.name ||
    `${input.kind}.${ext}`;

  const svc = serviceClient();
  if (useR2) {
    try {
      await putFreightDoc(storagePath, buffer, detected);
    } catch (e) {
      // Same answer shape as a failed Supabase upload; callers don't catch throws.
      return { ok: false, status: 500, error: e instanceof Error ? e.message : "Upload failed" };
    }
  } else {
    const { error: uploadError } = await svc.storage
      .from(ORG_FILES_BUCKET)
      .upload(storagePath, buffer, {
        contentType: detected,
        upsert: false,
      });
    if (uploadError) {
      return { ok: false, status: 500, error: uploadError.message };
    }
  }

  const { data, error } = await freightDb()
    .from("org_files")
    .insert({
      organization_id: input.organizationId,
      bucket_id: bucketId,
      storage_path: storagePath,
      file_name: fileName.slice(0, 500),
      content_type: detected,
      byte_size: buffer.byteLength,
      kind: input.kind,
      source_type: input.sourceType || null,
      source_id: input.sourceId || null,
      uploaded_by: input.uploadedBy || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    await removeFreightDoc(svc, bucketId, storagePath);
    return { ok: false, status: 500, error: error?.message || "Failed to register file" };
  }

  return { ok: true, file: data as OrgFileRow };
}

/** Register an already-uploaded storage object into org_files (shipment docs dual-write). */
export async function registerOrgFile(input: {
  organizationId: string;
  storagePath: string;
  fileName: string;
  contentType?: string | null;
  kind: OrgFileKind;
  sourceType?: string | null;
  sourceId?: string | null;
  uploadedBy?: string | null;
  byteSize?: number | null;
}): Promise<UploadOrgFileResult> {
  // A caller may hand us a key that already lives in roam-private; mark the row so reads and
  // deletes go to the right place.
  const onR2 = isFreightDocOnR2(null, input.storagePath);
  const { data, error } = await freightDb()
    .from("org_files")
    .insert({
      organization_id: input.organizationId,
      bucket_id: onR2 ? R2_PRIVATE_BUCKET_ID : ORG_FILES_BUCKET,
      storage_path: input.storagePath,
      file_name: input.fileName.slice(0, 500),
      content_type: input.contentType || null,
      byte_size: input.byteSize ?? null,
      kind: input.kind,
      source_type: input.sourceType || null,
      source_id: input.sourceId || null,
      uploaded_by: input.uploadedBy || null,
    })
    .select("*")
    .single();
  if (error || !data) {
    return { ok: false, status: 500, error: error?.message || "Failed to register file" };
  }
  return { ok: true, file: data as OrgFileRow };
}

export async function listOrgFiles(input: {
  organizationId: string;
  kind?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}): Promise<{ files: OrgFileRow[]; error?: string }> {
  let q = freightDb()
    .from("org_files")
    .select("*")
    .eq("organization_id", input.organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(input.limit ?? 200, 500));

  if (input.kind) q = q.eq("kind", input.kind);
  if (input.from) q = q.gte("created_at", input.from);
  if (input.to) q = q.lte("created_at", input.to);
  if (input.q && input.q.trim()) {
    q = q.ilike("file_name", `%${input.q.trim()}%`);
  }

  const { data, error } = await q;
  if (error) return { files: [], error: error.message };
  return { files: (data ?? []) as OrgFileRow[] };
}

export async function getOrgFile(
  organizationId: string,
  fileId: string,
): Promise<OrgFileRow | null> {
  const { data } = await freightDb()
    .from("org_files")
    .select("*")
    .eq("id", fileId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as OrgFileRow | null) ?? null;
}

/**
 * Read link for one stored document. Rows in roam-private get a short-lived R2 link;
 * rows written before the switch keep the Supabase signed URL.
 */
export async function signedOrgFileUrl(
  file: OrgFileRow,
  expiresIn: number = FREIGHT_DOCS_LINK_SECONDS,
): Promise<{ url: string } | { error: string }> {
  if (isFreightDocOnR2(file.bucket_id, file.storage_path)) {
    try {
      return { url: await signFreightDocUrl(file.storage_path, expiresIn) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not create signed URL" };
    }
  }

  const { data, error } = await serviceClient().storage
    .from(file.bucket_id || ORG_FILES_BUCKET)
    .createSignedUrl(file.storage_path, expiresIn);
  if (error || !data?.signedUrl) {
    return { error: error?.message || "Could not create signed URL" };
  }
  return { url: data.signedUrl };
}

export type DeleteOrgFileResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Soft-delete registry, remove storage object, clear known parent pointers. */
export async function deleteOrgFile(
  organizationId: string,
  fileId: string,
): Promise<DeleteOrgFileResult> {
  const file = await getOrgFile(organizationId, fileId);
  if (!file) return { ok: false, status: 404, error: "File not found" };

  const now = new Date().toISOString();
  const { error: softErr } = await freightDb()
    .from("org_files")
    .update({ deleted_at: now })
    .eq("id", file.id)
    .eq("organization_id", organizationId);
  if (softErr) return { ok: false, status: 500, error: softErr.message };

  // Row is soft-deleted first, then the bytes go (R2 or the old bucket).
  await removeFreightDoc(serviceClient(), file.bucket_id, file.storage_path);

  // Clear POD photo pointers that reference this storage path
  await freightDb()
    .from("delivery_batch_stops")
    .update({ pod_photo_path: null, updated_at: now })
    .eq("organization_id", organizationId)
    .eq("pod_photo_path", file.storage_path);

  return { ok: true };
}
