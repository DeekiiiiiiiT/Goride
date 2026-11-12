/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearLogServiceDraft,
  logServiceDraftKey,
  readLogServiceDraft,
  writeLogServiceDraft,
  type LogServiceDraftPayload,
} from "./logServiceDraft";

const userId = "user-test";
const vehicleId = "veh-test";

const basePayload = (): LogServiceDraftPayload => ({
  version: 1,
  savedAt: new Date().toISOString(),
  step: "review",
  formMeta: {
    date: "2026-11-11",
    type: "Regular Maintenance",
    currency: "JMD",
    odo: 1000,
    provider: "",
    notes: "",
    invoiceUrl: "",
  },
  lines: [{ categoryId: "1", categoryCode: "x", categoryName: "Oil" }],
  logMode: "quick_job",
  selectedPackageId: null,
  selectedSystemId: null,
  selectedCategoryIds: [],
  idempotencyKey: "key-1",
  anomalyAcknowledged: false,
});

afterEach(() => {
  clearLogServiceDraft(userId, vehicleId);
});

describe("logServiceDraft discount", () => {
  it("saves and restores discountAmount and discountRowOpen", () => {
    const payload = basePayload();
    payload.discountAmount = 1000;
    payload.discountRowOpen = true;
    writeLogServiceDraft(userId, vehicleId, payload);
    const restored = readLogServiceDraft(userId, vehicleId);
    expect(restored?.discountAmount).toBe(1000);
    expect(restored?.discountRowOpen).toBe(true);
    expect(localStorage.getItem(logServiceDraftKey(userId, vehicleId))).toContain('"discountAmount":1000');
  });
});
