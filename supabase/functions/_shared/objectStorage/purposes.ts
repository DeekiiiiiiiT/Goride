/**
 * Every kind of file the apps store, and its rules.
 * One row per old Supabase bucket (+ AI catalogue images). Limits match the live
 * bucket settings of 16 Nov 2026 — see docs/cloudflare-r2-storage-migration-audit.md §2.
 *
 * Final key: <folder>/<scopeId>/<uuid>.<ext>
 *   scope "org"      → organization id
 *   scope "merchant" → merchant id
 *   scope "user"     → auth user id
 *   scope "platform" → literal "platform" (staff-only content)
 * The caller (route) must already have proved the user may act for scopeId.
 */
import type { R2BucketKind } from "./r2Client.ts";

export type ScopeKind = "org" | "merchant" | "user" | "platform";

export type UploadPurpose = {
  bucket: R2BucketKind;
  folder: string;
  scope: ScopeKind;
  mimes: readonly string[];
  maxBytes: number;
  /** Run the virus scan (ID / KYC documents opened by staff). */
  scan: boolean;
  /** Old Supabase bucket this replaces (null = new). */
  replaces: string | null;
};

const MB = 1024 * 1024;
const IMG = ["image/jpeg", "image/png", "image/webp"] as const;
const IMG_HEIC = [...IMG, "image/heic"] as const;
const IMG_PDF = [...IMG, "application/pdf"] as const;
const IMG_HEIC_PDF = [...IMG_HEIC, "application/pdf"] as const;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const UPLOAD_PURPOSES = {
  "evidence": { bucket: "private", folder: "evidence", scope: "org", mimes: IMG_HEIC_PDF, maxBytes: 5 * MB, scan: false, replaces: "ephemeral-evidence" },
  "fleet-docs": { bucket: "private", folder: "fleet-docs", scope: "org", mimes: IMG_HEIC_PDF, maxBytes: 10 * MB, scan: false, replaces: "make-37f42386-docs" },
  "fleet-vehicles": { bucket: "private", folder: "fleet-vehicles", scope: "org", mimes: IMG_HEIC_PDF, maxBytes: 10 * MB, scan: false, replaces: "make-37f42386-vehicles" },
  "freight-docs": { bucket: "private", folder: "freight-docs", scope: "org", mimes: IMG_HEIC_PDF, maxBytes: 20 * MB, scan: false, replaces: "enterprise-freight-docs" },
  "inventory-docs": { bucket: "private", folder: "inventory-docs", scope: "org", mimes: [...IMG_PDF, "text/plain", "text/csv", XLSX], maxBytes: 20 * MB, scan: false, replaces: "inventory-docs" },
  "parts-requests": { bucket: "private", folder: "parts-requests", scope: "org", mimes: IMG, maxBytes: 8 * MB, scan: false, replaces: "parts-request-photos" },
  "parts-imports": { bucket: "private", folder: "parts-imports", scope: "platform", mimes: ["text/csv", "text/plain", XLSX], maxBytes: 5 * MB, scan: false, replaces: "parts-imports" },
  "refinery-sources": { bucket: "private", folder: "refinery-sources", scope: "platform", mimes: IMG_PDF, maxBytes: 10 * MB, scan: false, replaces: "refinery-price-sources" },
  "merchant-assets": { bucket: "public", folder: "merchant", scope: "merchant", mimes: IMG, maxBytes: 5 * MB, scan: false, replaces: "merchant-assets" },
  "merchant-kyc": { bucket: "private", folder: "merchant-kyc", scope: "merchant", mimes: IMG_PDF, maxBytes: 10 * MB, scan: true, replaces: "merchant-documents" },
  "in-house-receipts": { bucket: "private", folder: "in-house-receipts", scope: "merchant", mimes: IMG_PDF, maxBytes: 5 * MB, scan: false, replaces: "in-house-receipts" },
  "courier-docs": { bucket: "private", folder: "courier-docs", scope: "user", mimes: IMG_PDF, maxBytes: 10 * MB, scan: true, replaces: "courier-documents" },
  "driver-photos": { bucket: "private", folder: "driver-photos", scope: "user", mimes: IMG, maxBytes: 5 * MB, scan: false, replaces: "driver-photos" },
  "driver-docs": { bucket: "private", folder: "driver-docs", scope: "user", mimes: IMG_PDF, maxBytes: 10 * MB, scan: true, replaces: "driver-documents" },
  "customer-avatars": { bucket: "public", folder: "avatars", scope: "user", mimes: IMG, maxBytes: 2 * MB, scan: false, replaces: "customer-avatars" },
  "customer-issues": { bucket: "private", folder: "customer-issues", scope: "user", mimes: IMG, maxBytes: 2 * MB, scan: false, replaces: "customer-issue-photos" },
  "explorer": { bucket: "private", folder: "explorer", scope: "user", mimes: IMG_HEIC, maxBytes: 10 * MB, scan: false, replaces: "explorer-photos" },
  "catalogue-logos": { bucket: "public", folder: "catalogue/logos", scope: "platform", mimes: [...IMG, "image/svg+xml"], maxBytes: 2 * MB, scan: false, replaces: "catalog-maker-logos" },
  "catalogue-images": { bucket: "public", folder: "catalogue/images", scope: "platform", mimes: IMG, maxBytes: 5 * MB, scan: false, replaces: null },
} as const satisfies Record<string, UploadPurpose>;

export type UploadPurposeName = keyof typeof UPLOAD_PURPOSES;

export function getPurpose(name: string): UploadPurpose | null {
  return Object.hasOwn(UPLOAD_PURPOSES, name) ? UPLOAD_PURPOSES[name as UploadPurposeName] : null;
}

const SCOPE_ID_RE = /^[a-z0-9][a-z0-9\-_]{0,63}$/i;

export function isValidScopeId(purpose: UploadPurpose, scopeId: string): boolean {
  if (purpose.scope === "platform") return scopeId === "platform";
  return SCOPE_ID_RE.test(scopeId);
}

export function folderPrefix(purpose: UploadPurpose, scopeId: string): string {
  return `${purpose.folder}/${scopeId}/`;
}
