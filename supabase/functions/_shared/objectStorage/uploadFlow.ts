/**
 * Upload / finish / download flow for R2. Routes call these after they have
 * proved the user may act for `scopeId` (org, merchant, self, or platform staff).
 *
 *  1. startUpload  → one-time PUT link to roam-private/pending/<uuid> + signed ticket
 *  2. app PUTs the file straight to R2
 *  3. finishUpload → size + content check (+ virus scan for KYC) → copy to the
 *                    final key → delete pending → caller writes its DB row
 *  4. downloadLink → 10-minute link (private) or public media address
 *
 * Unfinished uploads are removed by the R2 lifecycle rule on pending/ (1 day).
 */
import { scanForMalware } from "../malwareScan.ts";
import { contentMatches, extForMime, needsFullRead, SVG_MAX_SCAN_BYTES } from "./contentCheck.ts";
import { folderPrefix, getPurpose, isValidScopeId, type UploadPurpose } from "./purposes.ts";
import type { ObjectHead, R2BucketKind } from "./r2Client.ts";
import { sha256Hex } from "./sigv4.ts";

export const UPLOAD_LINK_SECONDS = 300;
export const TICKET_SECONDS = 15 * 60;
export const DOWNLOAD_LINK_SECONDS = 600;
export const PUBLIC_CACHE = "public, max-age=31536000, immutable";
export const PRIVATE_CACHE = "private, no-store";

/** The parts of R2Client the flow needs (tests pass an in-memory fake). */
export interface ObjectStore {
  presignUpload(bucket: R2BucketKind, key: string, contentType: string, seconds?: number): Promise<string>;
  presignDownload(bucket: R2BucketKind, key: string, seconds?: number, downloadName?: string): Promise<string>;
  publicUrl(key: string): string;
  head(bucket: R2BucketKind, key: string): Promise<ObjectHead | null>;
  readStart(bucket: R2BucketKind, key: string, bytes?: number): Promise<Uint8Array>;
  read(bucket: R2BucketKind, key: string): Promise<Uint8Array>;
  copy(
    from: { bucket: R2BucketKind; key: string },
    to: { bucket: R2BucketKind; key: string },
    meta: { contentType: string; cacheControl: string },
  ): Promise<void>;
  remove(bucket: R2BucketKind, keys: string[]): Promise<void>;
  put(
    bucket: R2BucketKind,
    key: string,
    bytes: Uint8Array,
    contentType: string,
    cacheControl: string,
  ): Promise<void>;
}

export type FlowDeps = {
  store: ObjectStore;
  /** HMAC secret for tickets (r2 secret access key is fine — never leaves the server). */
  ticketSecret: string;
  scan?: (bytes: Uint8Array) => Promise<{ clean: boolean; reason?: string }>;
  now?: () => number;
  uuid?: () => string;
};

export class StorageFlowError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 413 | 415 | 422, message: string) {
    super(message);
  }
}

type Ticket = {
  v: 1;
  purpose: string;
  scopeId: string;
  userId: string;
  pendingKey: string;
  finalKey: string;
  contentType: string;
  exp: number; // epoch seconds
};

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function ticketKey(secret: string): Promise<CryptoKey> {
  const raw = enc.encode(await sha256Hex("roam-upload-ticket:" + secret));
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sealTicket(t: Ticket, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(t)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await ticketKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

async function openTicket(token: string, secret: string): Promise<Ticket | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await ticketKey(secret), fromB64url(sig) as BufferSource, enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const t = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Ticket;
    return t?.v === 1 ? t : null;
  } catch {
    return null;
  }
}

function requirePurpose(name: string, scopeId: string): UploadPurpose {
  const p = getPurpose(name);
  if (!p) throw new StorageFlowError(400, `unknown upload purpose: ${name}`);
  if (!isValidScopeId(p, scopeId)) throw new StorageFlowError(400, "invalid scope id");
  return p;
}

export type StartUploadInput = {
  purpose: string;
  scopeId: string;
  userId: string;
  contentType: string;
  size: number;
};

export type StartUploadResult = {
  uploadUrl: string;
  /** App must send exactly this header on the PUT. */
  headers: { "content-type": string };
  ticket: string;
  expiresInSeconds: number;
};

export async function startUpload(input: StartUploadInput, deps: FlowDeps): Promise<StartUploadResult> {
  const p = requirePurpose(input.purpose, input.scopeId);
  const contentType = String(input.contentType ?? "").toLowerCase().trim();
  if (!p.mimes.includes(contentType)) throw new StorageFlowError(415, `file type not allowed: ${contentType}`);
  if (!Number.isFinite(input.size) || input.size <= 0) throw new StorageFlowError(400, "file size required");
  if (input.size > p.maxBytes) throw new StorageFlowError(413, `file too large (max ${p.maxBytes} bytes)`);
  if (!input.userId) throw new StorageFlowError(403, "sign-in required");

  const id = (deps.uuid ?? (() => crypto.randomUUID()))();
  const nowSec = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const ticket: Ticket = {
    v: 1,
    purpose: input.purpose,
    scopeId: input.scopeId,
    userId: input.userId,
    pendingKey: `pending/${id}`,
    finalKey: `${folderPrefix(p, input.scopeId)}${id}.${extForMime(contentType)}`,
    contentType,
    exp: nowSec + TICKET_SECONDS,
  };
  const uploadUrl = await deps.store.presignUpload("private", ticket.pendingKey, contentType, UPLOAD_LINK_SECONDS);
  return {
    uploadUrl,
    headers: { "content-type": contentType },
    ticket: await sealTicket(ticket, deps.ticketSecret),
    expiresInSeconds: UPLOAD_LINK_SECONDS,
  };
}

export type FinishedUpload = {
  purpose: string;
  scopeId: string;
  /** Store this in the database. Never store a URL. */
  key: string;
  bucket: R2BucketKind;
  size: number;
  contentType: string;
  /** Only for public purposes. */
  publicUrl: string | null;
};

export async function finishUpload(
  input: { ticket: string; userId: string },
  deps: FlowDeps,
): Promise<FinishedUpload> {
  const t = await openTicket(input.ticket, deps.ticketSecret);
  if (!t) throw new StorageFlowError(400, "invalid upload ticket");
  const nowSec = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  if (t.exp < nowSec) throw new StorageFlowError(400, "upload ticket expired");
  if (t.userId !== input.userId) throw new StorageFlowError(403, "upload belongs to another user");
  const p = requirePurpose(t.purpose, t.scopeId);
  const store = deps.store;
  const done = (size: number): FinishedUpload => ({
    purpose: t.purpose,
    scopeId: t.scopeId,
    key: t.finalKey,
    bucket: p.bucket,
    size,
    contentType: t.contentType,
    publicUrl: p.bucket === "public" ? store.publicUrl(t.finalKey) : null,
  });

  const pending = await store.head("private", t.pendingKey);
  if (!pending) {
    // Finish called twice: the first call already moved it.
    const final = await store.head(p.bucket, t.finalKey);
    if (final) return done(final.size);
    throw new StorageFlowError(404, "upload not found — send the file first");
  }

  const reject = async (status: 413 | 415 | 422, msg: string): Promise<never> => {
    await store.remove("private", [t.pendingKey]);
    throw new StorageFlowError(status, msg);
  };

  if (pending.size <= 0) await reject(422, "file is empty");
  if (pending.size > p.maxBytes) await reject(413, `file too large (max ${p.maxBytes} bytes)`);

  let full: Uint8Array | null = null;
  if (needsFullRead(t.contentType) || p.scan) {
    if (needsFullRead(t.contentType) && pending.size > SVG_MAX_SCAN_BYTES) await reject(413, "file too large");
    full = await store.read("private", t.pendingKey);
  }
  const head = full ?? await store.readStart("private", t.pendingKey, 4096);
  if (!contentMatches(t.contentType, head)) await reject(415, "file content does not match its type");

  if (p.scan) {
    const result = await (deps.scan ?? scanForMalware)(full!);
    if (!result.clean) await reject(422, `file failed the virus check${result.reason ? `: ${result.reason}` : ""}`);
  }

  await store.copy(
    { bucket: "private", key: t.pendingKey },
    { bucket: p.bucket, key: t.finalKey },
    { contentType: t.contentType, cacheControl: p.bucket === "public" ? PUBLIC_CACHE : PRIVATE_CACHE },
  );
  await store.remove("private", [t.pendingKey]);
  return done(pending.size);
}

/** Read address for a stored key. The key must sit inside the caller's scope folder. */
export async function downloadLink(
  input: { purpose: string; scopeId: string; key: string; downloadName?: string },
  deps: Pick<FlowDeps, "store">,
): Promise<{ url: string; expiresInSeconds: number | null }> {
  const p = requirePurpose(input.purpose, input.scopeId);
  if (!input.key.startsWith(folderPrefix(p, input.scopeId))) {
    throw new StorageFlowError(403, "file is outside your access");
  }
  if (p.bucket === "public") return { url: deps.store.publicUrl(input.key), expiresInSeconds: null };
  const url = await deps.store.presignDownload("private", input.key, DOWNLOAD_LINK_SECONDS, input.downloadName);
  return { url, expiresInSeconds: DOWNLOAD_LINK_SECONDS };
}

/** Delete a stored file. Same scope rule as downloadLink. */
export async function deleteStoredFile(
  input: { purpose: string; scopeId: string; key: string },
  deps: Pick<FlowDeps, "store">,
): Promise<void> {
  const p = requirePurpose(input.purpose, input.scopeId);
  if (!input.key.startsWith(folderPrefix(p, input.scopeId))) {
    throw new StorageFlowError(403, "file is outside your access");
  }
  await deps.store.remove(p.bucket, [input.key]);
}
