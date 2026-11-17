/**
 * Certificate parse-document logic (C3a). Injectable deps for Deno tests.
 */
import { detectFileMagicBytes } from "../_shared/fileMagic.ts";
import { sha256Hex } from "../_shared/objectStorage/sigv4.ts";
import {
  checkDocumentDates,
  normalizeDocumentDate,
  whitelistDocumentFields,
} from "../_shared/vehiclePictures/documentFields.ts";
import { mapVehicleColor } from "../_shared/vehiclePictures/color.ts";
import { buildCertificateReaderPrompt } from "../_shared/vehiclePictures/readerPrompt.ts";
import { ProviderBlockedError } from "./api_usage_logger.ts";

export const MAX_CERTIFICATE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MAGIC = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export const DEFAULT_READER_PROVIDER = "gemini";
export const DEFAULT_READER_MODEL = "gemini-3.8-flash";

export type VehiclePictureSettings = {
  reader_provider?: string;
  reader_model?: string;
};

export type DocumentReadError = {
  ok: false;
  httpStatus: number;
  code: string;
  error: string;
};

export type DocumentReadSuccess = {
  ok: true;
  fields: Record<string, unknown>;
  colorStandard: string | null;
  flags: string[];
  fileSha256: string;
};

export type CertificateDocType = "fitness" | "registration";

export type ReaderCallInput = {
  provider: string;
  model: string;
  prompt: string;
  imageBytes: Uint8Array;
  mime: string;
  userId: string;
  orgId: string;
};

export type DocumentReadDeps = {
  now: () => Date;
  loadSettings: () => Promise<VehiclePictureSettings>;
  assertUserRateLimit: (userId: string) => Promise<DocumentReadError | null>;
  assertOrgRateLimit: (orgId: string, now: Date) => Promise<DocumentReadError | null>;
  recordRead: (userId: string, orgId: string, now: Date) => Promise<void>;
  callReader: (input: ReaderCallInput) => Promise<Record<string, unknown>>;
};

export function jamaicaCalendarDay(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

function aliasReaderFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  if (out.chassis == null && out.chassisNo != null) out.chassis = out.chassisNo;
  if (out.chassis == null && out.vin != null) out.chassis = out.vin;
  if (out.bodyAsWritten == null && out.bodyType != null) out.bodyAsWritten = out.bodyType;
  if (out.cc == null && out.ccRating != null) out.cc = out.ccRating;
  if (out.plate == null && out.plateNumber != null) out.plate = out.plateNumber;
  return out;
}

function normalizeCertificateDates(
  docType: CertificateDocType,
  whitelisted: Record<string, unknown>,
  now: Date,
): { fields: Record<string, unknown>; dateFlags: string[] } {
  const issueRaw = typeof whitelisted.issueDate === "string" ? whitelisted.issueDate : "";
  const expiryRaw = typeof whitelisted.expiryDate === "string" ? whitelisted.expiryDate : "";

  let issueDate: string | null = null;
  let expiryDate: string | null = null;

  if (docType === "fitness") {
    if (issueRaw) issueDate = normalizeDocumentDate(issueRaw, "fitness");
    if (expiryRaw) expiryDate = normalizeDocumentDate(expiryRaw, "fitness");
  } else {
    if (issueRaw) issueDate = normalizeDocumentDate(issueRaw, "registration-issue");
    if (expiryRaw) expiryDate = normalizeDocumentDate(expiryRaw, "registration-expiry");
  }

  const checked = checkDocumentDates(
    {
      year: typeof whitelisted.year === "number" || typeof whitelisted.year === "string"
        ? whitelisted.year
        : null,
      issueDate,
      expiryDate,
    },
    now,
  );

  const fields = {
    ...whitelisted,
    issueDate: checked.issueDate,
    expiryDate: checked.expiryDate,
    year: checked.year,
  };
  return { fields, dateFlags: checked.flagged };
}

export function processReaderRaw(
  docType: CertificateDocType,
  readerJson: Record<string, unknown>,
  now: Date = new Date(),
): { fields: Record<string, unknown>; colorStandard: string | null; flags: string[] } {
  const aliased = aliasReaderFields(readerJson);
  const whitelisted = whitelistDocumentFields(aliased);
  const { fields, dateFlags } = normalizeCertificateDates(docType, whitelisted, now);
  const colorStandard = mapVehicleColor(String(fields.colorAsWritten ?? ""));
  return { fields, colorStandard, flags: dateFlags };
}

export async function readVehicleCertificate(
  deps: DocumentReadDeps,
  input: {
    docType: CertificateDocType;
    fileBytes: Uint8Array;
    userId: string;
    orgId: string;
  },
): Promise<DocumentReadSuccess | DocumentReadError> {
  const t0 = Date.now();
  if (input.fileBytes.length > MAX_CERTIFICATE_BYTES) {
    console.error("[vehicle_document_read] FILE_TOO_LARGE", { ms: Date.now() - t0 });
    return {
      ok: false,
      httpStatus: 413,
      code: "FILE_TOO_LARGE",
      error: "This file is too large to scan.",
    };
  }

  const magic = detectFileMagicBytes(input.fileBytes.subarray(0, Math.min(input.fileBytes.length, 32)));
  if (!magic || !ALLOWED_MAGIC.has(magic)) {
    console.error("[vehicle_document_read] FILE_TYPE_NOT_ALLOWED", { ms: Date.now() - t0 });
    return {
      ok: false,
      httpStatus: 415,
      code: "FILE_TYPE_NOT_ALLOWED",
      error: "We couldn't read this file — please use a photo of the certificate (JPEG, PNG, WebP, or HEIC).",
    };
  }

  const userBlock = await deps.assertUserRateLimit(input.userId);
  if (userBlock) return userBlock;

  const now = deps.now();
  const orgBlock = await deps.assertOrgRateLimit(input.orgId, now);
  if (orgBlock) return orgBlock;

  const settings = await deps.loadSettings();
  const provider = settings.reader_provider?.trim() || DEFAULT_READER_PROVIDER;
  const model = settings.reader_model?.trim() || DEFAULT_READER_MODEL;
  const prompt = buildCertificateReaderPrompt(input.docType);

  let readerJson: Record<string, unknown>;
  try {
    readerJson = await deps.callReader({
      provider,
      model,
      prompt,
      imageBytes: input.fileBytes,
      mime: magic,
      userId: input.userId,
      orgId: input.orgId,
    });
  } catch (e: unknown) {
    if (e instanceof ProviderBlockedError) {
      console.error("[vehicle_document_read] READ_PAUSED", { ms: Date.now() - t0 });
      return {
        ok: false,
        httpStatus: 503,
        code: "READ_PAUSED",
        error: "Scanning is paused right now — type the details instead.",
      };
    }
    const isTimeout =
      e instanceof Error &&
      (e.name === "AbortError" || /timeout/i.test(e.message));
    if (isTimeout) {
      console.error("[vehicle_document_read] READ_TIMEOUT", { ms: Date.now() - t0 });
      return {
        ok: false,
        httpStatus: 504,
        code: "READ_TIMEOUT",
        error: "We couldn't read this file — the scan took too long. Try again or type the details.",
      };
    }
    // Provider error text only (e.g. "Gemini HTTP 503: …"); never the reader's output or the file.
    // A JSON.parse error quotes the reply text, which can hold personal details: log only its type.
    const reason = e instanceof SyntaxError
      ? "reader reply was not JSON"
      : e instanceof Error ? e.message.slice(0, 200) : "unknown";
    console.error("[vehicle_document_read] READER_FAILED", { ms: Date.now() - t0, reason });
    return {
      ok: false,
      httpStatus: 500,
      code: "READ_FAILED",
      error: "We couldn't read this file.",
    };
  }

  await deps.recordRead(input.userId, input.orgId, now);

  const fileSha256 = await sha256Hex(input.fileBytes);
  const { fields, colorStandard, flags } = processReaderRaw(input.docType, readerJson, now);

  return { ok: true, fields, colorStandard, flags, fileSha256 };
}

export function mapLegacyParseType(type: string): CertificateDocType | null {
  if (type === "fitness_certificate") return "fitness";
  if (type === "vehicle_registration") return "registration";
  return null;
}