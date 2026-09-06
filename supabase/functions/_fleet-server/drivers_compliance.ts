/**
 * Driver compliance read model + document verify action.
 * GET  /drivers/:id/compliance
 * POST /drivers/:id/compliance/verify
 */
import type { Context, Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { filterByOrgSafe, getOrgId, stampOrg } from "./org_scope.ts";
import { shouldReadTable, listByOrg } from "./repos/baseRepo.ts";

const PREFIX = "/make-server-37f42386";

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v != null ? String(v) : fallback;
}

async function loadDriverRecord(c: Context, driverId: string): Promise<Record<string, unknown> | null> {
  const id = asStr(driverId).trim();
  if (!id) return null;

  if (shouldReadTable("drivers")) {
    const orgId = getOrgId(c);
    const rows = await listByOrg("drivers", orgId, { limit: 2000 });
    const hit = (rows || []).find((d: any) => asStr(d?.id) === id);
    if (hit) return hit as Record<string, unknown>;
  }

  const fromKv = await kv.get(`driver:${id}`);
  if (!fromKv || typeof fromKv !== "object") return null;
  const scoped = await filterByOrgSafe([fromKv as Record<string, unknown>], c, {
    endpoint: "/drivers/:id/compliance",
  });
  return (scoped[0] as Record<string, unknown>) || null;
}

export type ComplianceDocument = {
  id: string;
  name: string;
  type: string;
  status: "Verified" | "Pending" | "Expired" | "Rejected";
  expiryDate: string;
  uploadDate: string;
  url?: string;
  verifiedAt?: string;
  verifiedBy?: string;
};

function buildDocuments(driver: Record<string, unknown>): ComplianceDocument[] {
  const docs: ComplianceDocument[] = [];
  const expiry = asStr(driver.licenseExpiry).slice(0, 10);
  const verifications = (driver.complianceVerifications || {}) as Record<
    string,
    { status?: string; verifiedAt?: string; verifiedBy?: string }
  >;

  const expiryExpired = (() => {
    if (!expiry) return false;
    const d = new Date(expiry);
    return Number.isFinite(d.getTime()) && d < new Date();
  })();

  const resolveStatus = (docId: string, fallback: ComplianceDocument["status"]): ComplianceDocument["status"] => {
    const v = verifications[docId];
    if (v?.status === "Verified" || v?.status === "Rejected" || v?.status === "Pending") {
      if (expiryExpired && (docId === "license-front" || docId === "license-back")) return "Expired";
      return v.status;
    }
    if (expiryExpired && (docId === "license-front" || docId === "license-back")) return "Expired";
    return fallback;
  };

  if (driver.licenseFrontUrl) {
    const id = "license-front";
    const v = verifications[id];
    docs.push({
      id,
      name: "Driver License (Front)",
      type: "License",
      status: resolveStatus(id, "Pending"),
      expiryDate: expiry || "",
      uploadDate: "",
      url: asStr(driver.licenseFrontUrl),
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  if (driver.licenseBackUrl) {
    const id = "license-back";
    const v = verifications[id];
    docs.push({
      id,
      name: "Driver License (Back)",
      type: "License Back",
      status: resolveStatus(id, "Pending"),
      expiryDate: expiry || "",
      uploadDate: "",
      url: asStr(driver.licenseBackUrl),
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  const proofUrl = asStr(driver.proofOfAddressUrl || driver.addressDocUrl);
  if (proofUrl) {
    const id = "proof-address";
    const v = verifications[id];
    docs.push({
      id,
      name: `Proof of Address (${asStr(driver.proofOfAddressType) || "Document"})`,
      type: "Address Proof",
      status: resolveStatus(id, "Pending"),
      expiryDate: "",
      uploadDate: "",
      url: proofUrl,
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  return docs;
}

async function handleGetCompliance(c: Context) {
  const driverId = c.req.param("id");
  try {
    const driver = await loadDriverRecord(c, driverId);
    if (!driver) return c.json({ error: "Driver not found" }, 404);
    const documents = buildDocuments(driver);
    return c.json({
      success: true,
      driverId: asStr(driver.id) || driverId,
      licenseNumber: asStr(driver.licenseNumber) || null,
      licenseExpiry: asStr(driver.licenseExpiry).slice(0, 10) || null,
      documents,
      complianceVerifications: driver.complianceVerifications || {},
    });
  } catch (e: any) {
    console.error("[drivers/compliance] GET failed:", e?.message || e);
    return c.json({ error: e?.message || "Compliance fetch failed" }, 500);
  }
}

async function handleVerifyDocument(c: Context) {
  const driverId = c.req.param("id");
  try {
    const body = await c.req.json().catch(() => ({}));
    const documentId = asStr(body?.documentId).trim();
    if (!documentId) return c.json({ error: "documentId is required" }, 400);

    const driver = await loadDriverRecord(c, driverId);
    if (!driver) return c.json({ error: "Driver not found" }, 404);

    const rbacUser = c.get("rbacUser") as { userId?: string; email?: string } | undefined;
    const reviewerId = asStr(body?.reviewerId) || asStr(rbacUser?.userId) || asStr(rbacUser?.email) || "unknown";
    const now = new Date().toISOString();
    const status = asStr(body?.status) === "Rejected" ? "Rejected" : "Verified";

    const prev = (driver.complianceVerifications || {}) as Record<string, unknown>;
    const next = {
      ...prev,
      [documentId]: {
        status,
        verifiedAt: now,
        verifiedBy: reviewerId,
      },
    };

    const updated = stampOrg(
      {
        ...driver,
        complianceVerifications: next,
        updatedAt: now,
      },
      c,
    );

    await kv.set(`driver:${asStr(driver.id) || driverId}`, updated);

    return c.json({
      success: true,
      documentId,
      verification: next[documentId],
      documents: buildDocuments(updated as Record<string, unknown>),
    });
  } catch (e: any) {
    console.error("[drivers/compliance] verify failed:", e?.message || e);
    return c.json({ error: e?.message || "Verify failed" }, 500);
  }
}

export function registerDriversComplianceRoutes(app: Hono) {
  app.get(
    `${PREFIX}/drivers/:id/compliance`,
    requireAuth({ requireOrg: true }),
    handleGetCompliance,
  );
  app.post(
    `${PREFIX}/drivers/:id/compliance/verify`,
    requireAuth({ requireOrg: true }),
    requirePermission("drivers.edit"),
    handleVerifyDocument,
  );
}
