/**
 * Fuel log offline-first — server rules (docs/fuel-log-offline-first-audit.md, Server layer).
 *
 * A fill made with the new phone flow carries `metadata.captureId`: a random id the phone
 * makes when the first photo is taken. Every re-send of that fill uses the same id.
 *
 * - S3: a driver re-send of a fill already stored with the same captureId is the same fill,
 *   at any age (the old rule only covered 15 minutes).
 * - S4: each fill photo has one fixed file key, so a re-send replaces the photo instead of
 *   adding a copy.
 * - S5: a fill with photos but no total yet is stored as Pending, waiting for the photo reader.
 *   It is never auto-approved and never posted while the total is missing.
 * - S1: the phone's outbox report is cleaned before it is stored.
 * - S6: the photo reader writes what it read onto the fill (or marks it Needs a look).
 * - S7: a fill saved later keeps the age of its GPS fix relative to the photo, not arrival.
 * - S9: a phone fill the server would refuse for good is stored for review instead.
 * - S10: the driver adds missing numbers to their own waiting / Needs a look fill.
 *
 * Fills finished here (S6, S10) go to the Review Queue as ready to approve; approval there
 * is the one step that posts a fill (ensureFuelEntryForApprovedTx).
 */

type Rec = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FILL_PHOTO_KINDS = ["odometer", "pump", "receipt"] as const;
export type FillPhotoKind = typeof FILL_PHOTO_KINDS[number];

export const PHOTO_READ_WAITING = "waiting";
export const PHOTO_READ_READ = "read";
export const PHOTO_READ_NEEDS_LOOK = "needs_look";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function meta(tx: Rec | null | undefined): Rec {
  const m = tx?.metadata;
  return m && typeof m === "object" ? (m as Rec) : {};
}

function isFuelExpense(tx: Rec): boolean {
  const c = str(tx.category);
  return (c === "Fuel" || c === "Fuel Reimbursement") && str(tx.type) === "Expense";
}

/** The fill's phone id, only when it is a well-formed uuid. */
export function captureIdOf(tx: Rec | null | undefined): string {
  const id = str(meta(tx).captureId);
  return UUID_RE.test(id) ? id.toLowerCase() : "";
}

/** S3: is `incoming` a re-send of the stored fill (same captureId), at any age? */
export function isOfflineFillResent(stored: Rec | null | undefined, incoming: Rec): boolean {
  if (!stored || typeof stored !== "object") return false;
  if (!isFuelExpense(stored)) return false;
  const a = captureIdOf(stored);
  return a !== "" && a === captureIdOf(incoming);
}

/** Positive amount on the fill (top-level amount, sign ignored). */
function hasAmount(tx: Rec): boolean {
  const n = Math.abs(Number(tx.amount));
  return Number.isFinite(n) && n > 0;
}

/** Litres on the fill (quantity or metadata.fuelVolume). */
function hasLiters(tx: Rec): boolean {
  return positive(tx.quantity) != null || positive(meta(tx).fuelVolume) != null;
}

/**
 * S5: a new-flow fuel fill missing its total or its litres — store it and wait for the photo
 * reader. DSH CR-03: a total with no litres must not post as 0 L.
 */
export function needsPhotoRead(tx: Rec): boolean {
  return isFuelExpense(tx) && captureIdOf(tx) !== "" && (!hasAmount(tx) || !hasLiters(tx));
}

/** S5: mark the fill as waiting for the photo reader. Pending, never approved, never posted. */
export function markWaitingForPhotoRead(tx: Rec, nowIso: string): Rec {
  const m = meta(tx);
  return {
    ...tx,
    status: "Pending",
    isReconciled: false,
    metadata: {
      ...m,
      photoReadStatus: PHOTO_READ_WAITING,
      photoReadQueuedAt: str(m.photoReadQueuedAt) || nowIso,
      decisionReason: "WAITING_PHOTO_READ",
    },
  };
}

function safeSegment(v: string, fallback: string): string {
  const s = v.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^[_-]+/, "");
  return s || fallback;
}

/**
 * S4: fixed file key for one fill photo. Same fill + same kind = same key.
 * Returns null when the upload is not a new-flow fill photo (callers keep the random key).
 */
export function fillPhotoKey(
  orgId: string,
  evidenceType: string,
  captureId: unknown,
  photoKind: unknown,
  fileExt: string,
  layout: "r2" | "supabase",
): string | null {
  const id = str(captureId).toLowerCase();
  const kind = str(photoKind).toLowerCase();
  if (!UUID_RE.test(id)) return null;
  if (!(FILL_PHOTO_KINDS as readonly string[]).includes(kind)) return null;
  const type = safeSegment(str(evidenceType), "");
  if (!type) return null;
  const ext = fileExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const name = `${id}-${kind}.${ext}`;
  if (layout === "r2") {
    return `evidence/${safeSegment(orgId, "no-org")}/${type}/${name}`;
  }
  return `${safeSegment(orgId, "unknown")}/${type}/${name}`;
}

export interface OutboxReport {
  deviceId: string;
  appVersion: string | null;
  pendingCount: number;
  oldestPendingAt: string | null;
  lastError: string | null;
}

/** S1: clean the phone's outbox report. Returns an error message instead when it can't be used. */
export function parseOutboxReport(body: unknown, nowMs: number): OutboxReport | { error: string } {
  const b = body && typeof body === "object" ? (body as Rec) : {};
  const deviceId = str(b.deviceId);
  if (deviceId.length < 8 || deviceId.length > 128) return { error: "deviceId required" };
  const rawCount = Number(b.pendingCount);
  const pendingCount = Number.isFinite(rawCount) ? Math.min(10000, Math.max(0, Math.floor(rawCount))) : 0;
  let oldestPendingAt: string | null = null;
  if (pendingCount > 0) {
    const t = Date.parse(str(b.oldestPendingAt));
    // A phone clock in the future is clamped to now; no time = now.
    oldestPendingAt = new Date(Number.isFinite(t) ? Math.min(t, nowMs) : nowMs).toISOString();
  }
  const appVersion = str(b.appVersion).slice(0, 32) || null;
  const lastError = pendingCount > 0 ? (str(b.lastError).slice(0, 500) || null) : null;
  return { deviceId, appVersion, pendingCount, oldestPendingAt, lastError };
}

// ---------------------------------------------------------------------------
// S6 — photo reader results
// ---------------------------------------------------------------------------

export interface PhotoReadResult {
  amount: number | null;
  liters: number | null;
  odometer: number | null;
}

export const PHOTO_READ_MAX_ATTEMPTS = 3;

function positive(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Pump photo address on a fill (cash: receiptUrl). */
export function pumpPhotoUrlOf(tx: Rec): string {
  return str(tx.receiptUrl) || str(meta(tx).receiptUrl);
}

/** Odometer photo address on a fill. */
export function odometerPhotoUrlOf(tx: Rec): string {
  return str(meta(tx).odometerProofUrl);
}

/** Mark a fill Needs a look with a plain reason. Pending, never approved. */
export function markNeedsLook(tx: Rec, reason: string, nowIso: string): Rec {
  const m = meta(tx);
  return {
    ...tx,
    status: "Pending",
    isReconciled: false,
    metadata: {
      ...m,
      photoReadStatus: PHOTO_READ_NEEDS_LOOK,
      needsLookReason: reason,
      needsLookAt: nowIso,
      needsLogReview: true,
      logReviewReason: reason,
      decisionReason: "NEEDS_LOOK",
    },
  };
}

/** Ready for the owner to approve in the Review Queue, with what came from where. */
function markReadyForReview(tx: Rec, m: Rec, source: "photo" | "driver", nowIso: string): Rec {
  // DSH CR-04: only send it to the odometer window (Log Review) when the odometer is missing or
  // was typed rather than read; a read odometer goes to Pending, ready to approve.
  const odoRead = positive(tx.odometer) != null && (m.odometerMethod === "ai_verified" || m.odometerMethod === "photo_read");
  const next: Rec = {
    ...m,
    photoReadStatus: PHOTO_READ_READ,
    photoReadAt: nowIso,
    needsLogReview: odoRead ? undefined : true,
    logReviewReason: source === "photo"
      ? "Numbers read from the photos — check and approve"
      : "Numbers added by the driver — check and approve",
    decisionReason: source === "photo" ? "PHOTO_READ_REVIEW" : "DRIVER_NUMBERS_REVIEW",
  };
  delete next.needsLookReason;
  return { ...tx, status: "Pending", isReconciled: false, metadata: next };
}

/**
 * S6: apply what the reader got. Total and litres are both needed; the odometer is only filled
 * when the fill has none. Values already on the fill are never overwritten.
 */
export function applyPhotoRead(tx: Rec, read: PhotoReadResult, nowIso: string): Rec {
  const m = meta(tx);
  const amount = hasAmount(tx) ? Math.abs(Number(tx.amount)) : positive(read.amount);
  const typedLiters = positive(m.fuelVolume) ?? positive(tx.quantity);
  const liters = typedLiters ?? positive(read.liters);
  if (amount == null || liters == null) {
    const missing = amount == null && liters == null
      ? "total and litres"
      : amount == null ? "total" : "litres";
    return markNeedsLook(tx, `Pump photo not readable — ${missing} not read`, nowIso);
  }
  const fromPhoto: string[] = [];
  if (!hasAmount(tx)) fromPhoto.push("amount");
  if (typedLiters == null) fromPhoto.push("liters");
  let odometer = positive(tx.odometer);
  let odometerMethod = m.odometerMethod;
  if (odometer == null && positive(read.odometer) != null) {
    odometer = Math.round(Number(read.odometer));
    odometerMethod = "photo_read";
    fromPhoto.push("odometer");
  }
  const next: Rec = {
    ...tx,
    amount: -Math.abs(amount),
    ...(odometer != null ? { odometer } : {}),
  };
  return markReadyForReview(next, {
    ...m,
    fuelVolume: round(liters, 3),
    pricePerLiter: round(amount / liters, 2),
    odometerMethod,
    readFromPhoto: fromPhoto,
  }, "photo", nowIso);
}

/** S6: the reader couldn't run (no photo, provider error). Retry, then Needs a look. */
export function photoReadAttemptFailed(
  tx: Rec,
  reason: string,
  attempts: number,
  nowIso: string,
): { tx: Rec; giveUp: boolean } {
  if (attempts >= PHOTO_READ_MAX_ATTEMPTS) {
    return { tx: markNeedsLook(tx, reason, nowIso), giveUp: true };
  }
  return { tx: { ...tx, metadata: { ...meta(tx), photoReadLastError: reason } }, giveUp: false };
}

// ---------------------------------------------------------------------------
// S7 — GPS fix age is measured against the photo, not the arrival
// ---------------------------------------------------------------------------

/** When the fix time and photo time are both on the fill, set ageS = photo − fix (seconds). */
export function withFixAgeFromCapture(tx: Rec): Rec {
  const m = meta(tx);
  const loc = m.locationMetadata && typeof m.locationMetadata === "object" ? (m.locationMetadata as Rec) : null;
  if (!loc) return tx;
  const fixMs = Date.parse(str(loc.fixAt) || str(loc.timestamp));
  const capMs = Date.parse(str(m.capturedAt));
  if (!Number.isFinite(fixMs) || !Number.isFinite(capMs)) return tx;
  const ageS = Math.max(0, Math.round((capMs - fixMs) / 1000));
  return { ...tx, metadata: { ...m, locationMetadata: { ...loc, ageS } } };
}

// ---------------------------------------------------------------------------
// S9 — a phone fill the server would refuse for good is kept for review
// ---------------------------------------------------------------------------

/**
 * The review record for a refused phone fill: a Pending fuel expense in the Review Queue
 * with the reason. The original payload is kept, so nothing the driver sent is lost.
 * The id is stable per fill, so a re-send of the same refused fill lands on the same row.
 */
export function buildRefusedFillReview(input: {
  payload: Rec;
  kind: "gas_card" | "split";
  reason: string;
  code: string;
  nowIso: string;
}): Rec {
  const p = input.payload;
  const pm = meta(p);
  const captureId = captureIdOf(p);
  const liters = positive(p.liters) ?? positive(pm.fuelVolume);
  const amount = positive(p.amount);
  const record: Rec = {
    id: `refused-fill-${captureId}`,
    date: str(p.date).slice(0, 10) || input.nowIso.slice(0, 10),
    category: "Fuel",
    type: "Expense",
    status: "Pending",
    isReconciled: false,
    amount: amount != null ? -amount : 0,
    paymentMethod: input.kind === "gas_card" ? "Gas Card" : "RideShare Cash",
    description: "Fuel fill from the driver's phone — needs a look",
    metadata: {
      captureId,
      paymentSource: input.kind === "gas_card" ? "company_card" : "rideshare_cash",
      photoReadStatus: PHOTO_READ_NEEDS_LOOK,
      needsLookReason: input.reason,
      needsLookAt: input.nowIso,
      needsLogReview: true,
      logReviewReason: input.reason,
      decisionReason: "NEEDS_LOOK",
      refusedCode: input.code,
      refusedKind: input.kind,
      refusedPayload: p,
      entrySource: "driver-portal",
    } as Rec,
  };
  const m = record.metadata as Rec;
  for (const [k, v] of [
    ["time", str(p.time)],
    ["driverId", str(p.driverId)],
    ["driverName", str(p.driverName)],
    ["vehicleId", str(p.vehicleId)],
  ] as const) if (v) record[k] = v;
  const odo = positive(p.odometer);
  if (odo != null) record.odometer = odo;
  if (liters != null) m.fuelVolume = liters;
  const capturedAt = str(pm.capturedAt);
  if (capturedAt) m.capturedAt = capturedAt;
  const odoPhoto = str(pm.odometerProofUrl) || str(p.odometerImageUrl);
  if (odoPhoto) m.odometerProofUrl = odoPhoto;
  return record;
}

// ---------------------------------------------------------------------------
// S10 — the driver adds missing numbers to their own fill
// ---------------------------------------------------------------------------

/** Only the fill's own driver, only while it waits for numbers or needs a look. */
export function canDriverAddNumbers(tx: Rec | null | undefined, callerIds: string[]): boolean {
  if (!tx || !isFuelExpense(tx)) return false;
  const status = str(meta(tx).photoReadStatus);
  if (status !== PHOTO_READ_WAITING && status !== PHOTO_READ_NEEDS_LOOK) return false;
  if (str(tx.status) !== "Pending") return false;
  const owner = str(tx.driverId);
  return owner !== "" && callerIds.map(str).includes(owner);
}

/** S10: typed total + litres (and an optional new pump photo) → ready for review. */
export function applyDriverNumbers(
  tx: Rec,
  input: { total?: unknown; liters?: unknown; pumpPhotoUrl?: unknown },
  nowIso: string,
): Rec | { error: string } {
  const total = positive(input.total);
  const liters = positive(input.liters);
  const photo = str(input.pumpPhotoUrl);
  const m = meta(tx);
  if (total == null && liters == null) {
    if (!photo) return { error: "Add the total and litres, or a new pump photo" };
    // New pump photo only: back to the reader.
    const rest: Rec = { ...m };
    delete rest.needsLookReason;
    return markWaitingForPhotoRead({ ...tx, receiptUrl: photo, metadata: rest }, nowIso);
  }
  if (total == null || liters == null) return { error: "Add both the total and the litres" };
  const next: Rec = { ...tx, amount: -total, ...(photo ? { receiptUrl: photo } : {}) };
  return markReadyForReview(next, {
    ...m,
    fuelVolume: round(liters, 3),
    pricePerLiter: round(total / liters, 2),
    typedByDriver: ["amount", "liters"],
    typedByDriverAt: nowIso,
  }, "driver", nowIso);
}

// ---------------------------------------------------------------------------
// FO-12 — a Gas Card fill sent without its card: the server attaches the card
// Keep in sync with apps/driver/src/utils/fuelCardMatch.ts (findActiveFuelCardForSession).
// ---------------------------------------------------------------------------

function isActiveCard(c: Rec): boolean {
  return str(c.status).toLowerCase() === "active";
}

/** Active card on the car first, then on the driver. Null when none. */
export function pickActiveCardForFill(
  cards: Rec[],
  vehicleId: unknown,
  driverIds: unknown[],
): Rec | null {
  const vid = str(vehicleId);
  if (vid) {
    const onCar = cards.find((c) => isActiveCard(c) && str(c.assignedVehicleId) === vid);
    if (onCar) return onCar;
  }
  const ids = new Set(driverIds.map(str).filter(Boolean));
  if (!ids.size) return null;
  return cards.find((c) => isActiveCard(c) && ids.has(str(c.assignedDriverId))) ?? null;
}

// ---------------------------------------------------------------------------
// Fleet review — the owner types the missing numbers ("Save numbers")
// ---------------------------------------------------------------------------

/** Only phone fills still waiting or needing a look, and still Pending. */
export function canFleetAddNumbers(tx: Rec | null | undefined): boolean {
  if (!tx || !isFuelExpense(tx) || str(tx.status) !== "Pending") return false;
  const status = str(meta(tx).photoReadStatus);
  return status === PHOTO_READ_WAITING || status === PHOTO_READ_NEEDS_LOOK || status === PHOTO_READ_READ;
}

/** Owner's total + litres → ready to approve, labelled "typed by you" in Fleet. */
export function applyFleetNumbers(
  tx: Rec,
  input: { total?: unknown; liters?: unknown },
  byUserId: string,
  nowIso: string,
): Rec | { error: string } {
  const total = positive(input.total);
  const liters = positive(input.liters);
  if (total == null || liters == null) return { error: "Add both the total and the litres" };
  const m = meta(tx);
  const next: Rec = { ...tx, amount: -total };
  const ready = markReadyForReview(next, {
    ...m,
    fuelVolume: round(liters, 3),
    pricePerLiter: round(total / liters, 2),
    typedByFleet: ["amount", "liters"],
    typedByFleetAt: nowIso,
    typedByFleetUser: byUserId,
  }, "driver", nowIso);
  const rm = ready.metadata as Rec;
  rm.logReviewReason = "Numbers typed in Fleet — approve to post";
  rm.decisionReason = "FLEET_NUMBERS_REVIEW";
  return ready;
}
