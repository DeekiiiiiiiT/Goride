import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyDriverNumbers,
  applyFleetNumbers,
  canFleetAddNumbers,
  applyPhotoRead,
  buildRefusedFillReview,
  canDriverAddNumbers,
  captureIdOf,
  fillPhotoKey,
  isOfflineFillResent,
  markWaitingForPhotoRead,
  needsPhotoRead,
  parseOutboxReport,
  photoReadAttemptFailed,
  pickActiveCardForFill,
  withFixAgeFromCapture,
} from "./fuel_offline_fill.ts";

// Made-up ids; shapes follow a real 5179KZ cash fill.
const CAPTURE = "0b8f6d2a-3c41-4e7a-9a11-5d2c7e9f0a01";
const OTHER = "6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

const storedFill = {
  id: "zz-tx-1",
  category: "Fuel",
  type: "Expense",
  amount: -4000,
  timestamp: "2026-11-22T13:00:00Z",
  metadata: { captureId: CAPTURE, fuelVolume: 18.7 },
};

Deno.test("S3: same captureId is the same fill, even days later", () => {
  const resend = { ...storedFill, timestamp: undefined, metadata: { captureId: CAPTURE } };
  assertEquals(isOfflineFillResent(storedFill, resend), true);
});

Deno.test("S3: different captureId or none is not a re-send", () => {
  assertEquals(isOfflineFillResent(storedFill, { ...storedFill, metadata: { captureId: OTHER } }), false);
  assertEquals(isOfflineFillResent(storedFill, { ...storedFill, metadata: {} }), false);
  assertEquals(isOfflineFillResent({ ...storedFill, metadata: {} }, storedFill), false);
  assertEquals(isOfflineFillResent(null, storedFill), false);
});

Deno.test("S3: only fuel expenses count", () => {
  assertEquals(isOfflineFillResent({ ...storedFill, category: "Maintenance" }, storedFill), false);
});

Deno.test("captureId must be a uuid", () => {
  assertEquals(captureIdOf({ metadata: { captureId: "abc" } }), "");
  assertEquals(captureIdOf({ metadata: { captureId: CAPTURE.toUpperCase() } }), CAPTURE);
});

Deno.test("S5: new-flow fill with no total waits for the photo reader", () => {
  const photoOnly = { category: "Fuel", type: "Expense", metadata: { captureId: CAPTURE } };
  assertEquals(needsPhotoRead(photoOnly), true);
  assertEquals(needsPhotoRead({ ...photoOnly, amount: 0 }), true);
  // DSH CR-03: a total with no litres still waits for the reader; both numbers = normal path.
  assertEquals(needsPhotoRead({ ...photoOnly, amount: -4000 }), true);
  assertEquals(needsPhotoRead({ ...photoOnly, amount: -4000, metadata: { captureId: CAPTURE, fuelVolume: 18.7 } }), false);
  assertEquals(needsPhotoRead({ ...photoOnly, amount: -4000, quantity: 18.7 }), false);
  // Old app (no captureId) keeps today's path.
  assertEquals(needsPhotoRead({ category: "Fuel", type: "Expense" }), false);
});

Deno.test("S5: waiting fill is Pending, not reconciled, labelled", () => {
  const out = markWaitingForPhotoRead(
    { category: "Fuel", type: "Expense", status: "Approved", metadata: { captureId: CAPTURE } },
    "2026-11-25T12:03:00.000Z",
  );
  assertEquals(out.status, "Pending");
  assertEquals(out.isReconciled, false);
  const m = out.metadata as Record<string, unknown>;
  assertEquals(m.photoReadStatus, "waiting");
  assertEquals(m.decisionReason, "WAITING_PHOTO_READ");
  assertEquals(m.photoReadQueuedAt, "2026-11-25T12:03:00.000Z");
  assertEquals(m.captureId, CAPTURE);
});

Deno.test("S4: one fixed key per fill photo", () => {
  const a = fillPhotoKey("org-1", "fuel_receipt", CAPTURE, "pump", "jpg", "r2");
  const b = fillPhotoKey("org-1", "fuel_receipt", CAPTURE, "pump", ".JPG", "r2");
  assertEquals(a, `evidence/org-1/fuel_receipt/${CAPTURE}-pump.jpg`);
  assertEquals(a, b);
  assertEquals(
    fillPhotoKey("org-1", "odometer_proof", CAPTURE, "odometer", "jpg", "supabase"),
    `org-1/odometer_proof/${CAPTURE}-odometer.jpg`,
  );
});

Deno.test("S4: anything else keeps the random key", () => {
  assertEquals(fillPhotoKey("org-1", "fuel_receipt", "not-a-uuid", "pump", "jpg", "r2"), null);
  assertEquals(fillPhotoKey("org-1", "fuel_receipt", CAPTURE, "selfie", "jpg", "r2"), null);
  assertEquals(fillPhotoKey("org-1", "", CAPTURE, "pump", "jpg", "r2"), null);
  assertEquals(fillPhotoKey("org-1", "../x", CAPTURE, "pump", "jpg", "r2"), `evidence/org-1/x/${CAPTURE}-pump.jpg`);
});

Deno.test("S1: outbox report is cleaned", () => {
  const now = Date.parse("2026-11-25T12:10:00Z");
  assertEquals(
    parseOutboxReport(
      { deviceId: "zz-device-0001", appVersion: "1.0.30", pendingCount: 2, oldestPendingAt: "2026-11-25T12:03:00Z", lastError: "no signal" },
      now,
    ),
    {
      deviceId: "zz-device-0001",
      appVersion: "1.0.30",
      pendingCount: 2,
      oldestPendingAt: "2026-11-25T12:03:00.000Z",
      lastError: "no signal",
    },
  );
});

Deno.test("S1: zero waiting clears time and error; bad values are fixed", () => {
  const now = Date.parse("2026-11-25T12:10:00Z");
  assertEquals(
    parseOutboxReport({ deviceId: "zz-device-0001", pendingCount: 0, oldestPendingAt: "2026-11-25T12:03:00Z", lastError: "x" }, now),
    { deviceId: "zz-device-0001", appVersion: null, pendingCount: 0, oldestPendingAt: null, lastError: null },
  );
  const future = parseOutboxReport({ deviceId: "zz-device-0001", pendingCount: 1, oldestPendingAt: "2030-01-01T00:00:00Z" }, now);
  assertEquals((future as { oldestPendingAt: string }).oldestPendingAt, "2026-11-25T12:10:00.000Z");
  const negative = parseOutboxReport({ deviceId: "zz-device-0001", pendingCount: -4 }, now);
  assertEquals((negative as { pendingCount: number }).pendingCount, 0);
  assertEquals(parseOutboxReport({ deviceId: "short" }, now), { error: "deviceId required" });
});

const NOW = "2026-11-25T12:20:00.000Z";
const waitingFill = {
  id: "zz-tx-2",
  category: "Fuel",
  type: "Expense",
  status: "Pending",
  driverId: "zz-driver-1",
  receiptUrl: "https://example.test/pump.jpg",
  odometer: 200412,
  metadata: { captureId: CAPTURE, photoReadStatus: "waiting", odometerMethod: "ai_verified" },
};

Deno.test("S6: total and litres read -> ready for review, J$ and price per litre set", () => {
  const out = applyPhotoRead(waitingFill, { amount: 4000, liters: 18.7, odometer: 999 }, NOW);
  const m = out.metadata as Record<string, unknown>;
  assertEquals(out.amount, -4000);
  assertEquals(out.status, "Pending");
  assertEquals(out.odometer, 200412); // a reading already on the fill is kept
  assertEquals(m.fuelVolume, 18.7);
  assertEquals(m.pricePerLiter, 213.9);
  assertEquals(m.photoReadStatus, "read");
  assertEquals(m.readFromPhoto, ["amount", "liters"]);
  assertEquals(m.decisionReason, "PHOTO_READ_REVIEW");
  // DSH CR-04: the odometer was read, so it goes to Pending (not the odometer window).
  assertEquals(m.needsLogReview, undefined);
});

Deno.test("CR-04: a typed or missing odometer still goes to the odometer window", () => {
  const typed = { ...waitingFill, metadata: { ...waitingFill.metadata, odometerMethod: "manual_override" } };
  assertEquals((applyPhotoRead(typed, { amount: 4000, liters: 18.7, odometer: null }, NOW).metadata as Record<string, unknown>).needsLogReview, true);
  const none = { ...waitingFill, odometer: undefined };
  assertEquals((applyPhotoRead(none, { amount: 4000, liters: 18.7, odometer: null }, NOW).metadata as Record<string, unknown>).needsLogReview, true);
  const readNow = applyPhotoRead(none, { amount: 4000, liters: 18.7, odometer: 200500 }, NOW);
  assertEquals((readNow.metadata as Record<string, unknown>).needsLogReview, undefined);
});

Deno.test("S6: odometer filled from the photo only when missing", () => {
  const noOdo = { ...waitingFill, odometer: undefined };
  const out = applyPhotoRead(noOdo, { amount: 4000, liters: 18.7, odometer: 200412.4 }, NOW);
  const m = out.metadata as Record<string, unknown>;
  assertEquals(out.odometer, 200412);
  assertEquals(m.odometerMethod, "photo_read");
  assertEquals(m.readFromPhoto, ["amount", "liters", "odometer"]);
});

Deno.test("S6: total not read -> Needs a look with the reason, amount untouched", () => {
  const out = applyPhotoRead(waitingFill, { amount: null, liters: 18.7, odometer: null }, NOW);
  const m = out.metadata as Record<string, unknown>;
  assertEquals(out.amount, undefined);
  assertEquals(m.photoReadStatus, "needs_look");
  assertEquals(m.needsLookReason, "Pump photo not readable — total not read");
});

Deno.test("S6: litres the driver typed win over the photo", () => {
  const typed = { ...waitingFill, metadata: { ...waitingFill.metadata, fuelVolume: 18.64 } };
  const out = applyPhotoRead(typed, { amount: 5000, liters: 30, odometer: null }, NOW);
  assertEquals((out.metadata as Record<string, unknown>).fuelVolume, 18.64);
  assertEquals((out.metadata as Record<string, unknown>).readFromPhoto, ["amount"]);
});

Deno.test("S6: reader errors retry, then Needs a look", () => {
  const first = photoReadAttemptFailed(waitingFill, "Couldn't open the pump photo", 1, NOW);
  assertEquals(first.giveUp, false);
  assertEquals((first.tx.metadata as Record<string, unknown>).photoReadStatus, "waiting");
  const last = photoReadAttemptFailed(waitingFill, "Couldn't open the pump photo", 3, NOW);
  assertEquals(last.giveUp, true);
  assertEquals((last.tx.metadata as Record<string, unknown>).photoReadStatus, "needs_look");
});

Deno.test("S7: fix age is photo time minus fix time, not arrival", () => {
  const tx = {
    metadata: {
      capturedAt: "2026-11-25T12:03:40Z",
      locationMetadata: { lat: 18, lng: -77, fixAt: "2026-11-25T12:03:05Z", ageS: 0 },
    },
  };
  const out = withFixAgeFromCapture(tx);
  assertEquals(((out.metadata as Record<string, unknown>).locationMetadata as Record<string, unknown>).ageS, 35);
  assertEquals(withFixAgeFromCapture({ metadata: {} }), { metadata: {} });
});

Deno.test("S9: refused phone fill becomes one review row with the reason and payload", () => {
  const payload = {
    id: "zz-fe-1",
    date: "2026-11-19",
    driverId: "zz-driver-1",
    vehicleId: "5179KZ",
    liters: 23.69,
    odometer: 199231,
    metadata: { captureId: CAPTURE, odometerProofUrl: "https://example.test/odo.jpg" },
  };
  const out = buildRefusedFillReview({
    payload,
    kind: "gas_card",
    reason: "Another gas card fill is already logged for this car and day",
    code: "DUPLICATE_GAS_CARD_ANCHOR",
    nowIso: NOW,
  });
  const m = out.metadata as Record<string, unknown>;
  assertEquals(out.id, `refused-fill-${CAPTURE}`);
  assertEquals(out.status, "Pending");
  assertEquals(out.amount, 0);
  assertEquals(out.odometer, 199231);
  assertEquals(out.vehicleId, "5179KZ");
  assertEquals(m.photoReadStatus, "needs_look");
  assertEquals(m.refusedCode, "DUPLICATE_GAS_CARD_ANCHOR");
  assertEquals(m.refusedPayload, payload);
  assertEquals(m.fuelVolume, 23.69);
  assertEquals(m.odometerProofUrl, "https://example.test/odo.jpg");
});

Deno.test("S10: only the fill's own driver, only while waiting or Needs a look", () => {
  assertEquals(canDriverAddNumbers(waitingFill, ["zz-driver-1"]), true);
  assertEquals(canDriverAddNumbers(waitingFill, ["zz-driver-2"]), false);
  assertEquals(canDriverAddNumbers({ ...waitingFill, status: "Approved" }, ["zz-driver-1"]), false);
  assertEquals(
    canDriverAddNumbers({ ...waitingFill, metadata: { ...waitingFill.metadata, photoReadStatus: "read" } }, ["zz-driver-1"]),
    false,
  );
});

Deno.test("S10: typed numbers -> ready for review, labelled typed by driver", () => {
  const out = applyDriverNumbers(waitingFill, { total: "1000", liters: 4.593 }, NOW) as Record<string, unknown>;
  const m = out.metadata as Record<string, unknown>;
  assertEquals(out.amount, -1000);
  assertEquals(m.pricePerLiter, 217.72);
  assertEquals(m.typedByDriver, ["amount", "liters"]);
  assertEquals(m.decisionReason, "DRIVER_NUMBERS_REVIEW");
});

Deno.test("S10: one number alone is refused; a new photo alone goes back to the reader", () => {
  assertEquals(applyDriverNumbers(waitingFill, { total: 1000 }, NOW), { error: "Add both the total and the litres" });
  assertEquals(applyDriverNumbers(waitingFill, {}, NOW), { error: "Add the total and litres, or a new pump photo" });
  const back = applyDriverNumbers(waitingFill, { pumpPhotoUrl: "https://example.test/pump2.jpg" }, NOW) as Record<string, unknown>;
  assertEquals(back.receiptUrl, "https://example.test/pump2.jpg");
  assertEquals((back.metadata as Record<string, unknown>).photoReadStatus, "waiting");
});

Deno.test("FO-12: card on the car first, then on the driver, only active", () => {
  const cards = [
    { id: "card-old", status: "Retired", assignedVehicleId: "5179KZ" },
    { id: "card-driver", status: "Active", assignedDriverId: "zz-driver-1" },
    { id: "card-car", status: "Active", assignedVehicleId: "5179KZ" },
  ];
  assertEquals(pickActiveCardForFill(cards, "5179KZ", ["zz-driver-1"])?.id, "card-car");
  assertEquals(pickActiveCardForFill(cards, "OTHER", ["zz-driver-1"])?.id, "card-driver");
  assertEquals(pickActiveCardForFill(cards, "OTHER", ["nobody"]), null);
});

Deno.test("Fleet numbers: owner's total + litres → ready to approve, labelled", () => {
  const needsLook = { ...waitingFill, metadata: { ...waitingFill.metadata, photoReadStatus: "needs_look" } };
  assertEquals(canFleetAddNumbers(needsLook), true);
  assertEquals(canFleetAddNumbers({ ...needsLook, status: "Approved" }), false);
  assertEquals(canFleetAddNumbers({ ...waitingFill, metadata: {} }), false);
  const out = applyFleetNumbers(needsLook, { total: 1000, liters: 4.593 }, "zz-owner", NOW) as Record<string, unknown>;
  const m = out.metadata as Record<string, unknown>;
  assertEquals(out.amount, -1000);
  assertEquals(out.status, "Pending");
  assertEquals(m.pricePerLiter, 217.72);
  assertEquals(m.photoReadStatus, "read");
  assertEquals(m.typedByFleet, ["amount", "liters"]);
  assertEquals(m.decisionReason, "FLEET_NUMBERS_REVIEW");
  assertEquals(applyFleetNumbers(needsLook, { total: 1000 }, "zz-owner", NOW), { error: "Add both the total and the litres" });
});
