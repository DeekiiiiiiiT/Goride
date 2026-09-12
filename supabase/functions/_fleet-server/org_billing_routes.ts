/**
 * Org billing — Payment methods (WiPay-ready cards) + Payout bank accounts.
 * v1: persist masked details only; live charge/deposit later.
 */
import type { Context, Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId, stampOrg, belongsToOrg } from "./org_scope.ts";

const PREFIX = "/make-server-37f42386";
const PM_PREFIX = "org_payment_method:";
const PA_PREFIX = "org_payout_account:";

function digitsOnly(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

function actorId(c: Context): string {
  const rbac = c.get("rbacUser") as RbacUser | undefined;
  return String(rbac?.userId || rbac?.email || "unknown");
}

async function listOrgRecords(c: Context, keyPrefix: string, orgId: string) {
  const items = ((await kv.getByPrefix(`${keyPrefix}${orgId}:`)) || []) as Record<
    string,
    unknown
  >[];
  // Prefix already org-scoped; still filter for safety.
  return filterByOrg(items, c).filter(
    (r) => String(r.organizationId || "") === orgId && String(r.status || "active") !== "archived",
  );
}

async function clearDefaultFlags(
  c: Context,
  keyPrefix: string,
  orgId: string,
  exceptId?: string,
) {
  const items = await listOrgRecords(c, keyPrefix, orgId);
  for (const row of items) {
    const id = String(row.id || "");
    if (!id || id === exceptId) continue;
    if (!row.isDefault) continue;
    const key = `${keyPrefix}${orgId}:${id}`;
    await kv.set(
      key,
      stampOrg(
        {
          ...row,
          isDefault: false,
          updatedAt: new Date().toISOString(),
        },
        c,
      ),
    );
  }
}

export function registerOrgBillingRoutes(app: Hono) {
  // ── Payment methods ──────────────────────────────────────────────
  app.get(`${PREFIX}/org-billing/payment-methods`, requireAuth({ requireOrg: true }), async (c) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
      const data = await listOrgRecords(c, PM_PREFIX, orgId);
      data.sort((a, b) => {
        if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? -1 : 1;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post(
    `${PREFIX}/org-billing/payment-methods`,
    requireAuth({ requireOrg: true }),
    requirePermission("transactions.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const body = await c.req.json();
        const brand = String(body?.brand || "").trim();
        const last4 = digitsOnly(String(body?.last4 || "")).slice(-4);
        const expMonth = Number(body?.expMonth);
        const expYear = Number(body?.expYear);
        if (!brand) return c.json({ error: "brand is required" }, 400);
        if (!/^\d{4}$/.test(last4)) return c.json({ error: "last4 must be 4 digits" }, 400);
        if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
          return c.json({ error: "expMonth must be 1–12" }, 400);
        }
        if (!Number.isInteger(expYear) || expYear < 2024 || expYear > 2100) {
          return c.json({ error: "expYear is invalid" }, 400);
        }
        // Reject accidental full PAN in brand/nickname fields
        const nickname = String(body?.nickname || "").trim().slice(0, 80);
        if (digitsOnly(nickname).length >= 12) {
          return c.json({ error: "Do not enter a full card number" }, 400);
        }

        const existing = await listOrgRecords(c, PM_PREFIX, orgId);
        const makeDefault = body?.isDefault === true || existing.length === 0;
        if (makeDefault) await clearDefaultFlags(c, PM_PREFIX, orgId);

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const record = stampOrg(
          {
            id,
            organizationId: orgId,
            provider: "wipay",
            brand,
            last4,
            expMonth,
            expYear,
            nickname: nickname || null,
            isDefault: makeDefault,
            vaultStatus: "manual_pending",
            wipayToken: null,
            status: "active",
            createdAt: now,
            updatedAt: now,
            createdBy: actorId(c),
          },
          c,
        );
        await kv.set(`${PM_PREFIX}${orgId}:${id}`, record);
        return c.json({ success: true, data: record }, 201);
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );

  app.patch(
    `${PREFIX}/org-billing/payment-methods/:id`,
    requireAuth({ requireOrg: true }),
    requirePermission("transactions.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const id = String(c.req.param("id") || "").trim();
        const key = `${PM_PREFIX}${orgId}:${id}`;
        const existing = await kv.get(key);
        if (!existing || !belongsToOrg(existing as Record<string, unknown>, c)) {
          return c.json({ error: "Not found" }, 404);
        }
        const body = await c.req.json();
        const next = { ...(existing as Record<string, unknown>) };
        if (body?.nickname != null) {
          const nickname = String(body.nickname).trim().slice(0, 80);
          if (digitsOnly(nickname).length >= 12) {
            return c.json({ error: "Do not enter a full card number" }, 400);
          }
          next.nickname = nickname || null;
        }
        if (body?.isDefault === true) {
          await clearDefaultFlags(c, PM_PREFIX, orgId, id);
          next.isDefault = true;
        }
        next.updatedAt = new Date().toISOString();
        const record = stampOrg(next, c);
        await kv.set(key, record);
        return c.json({ success: true, data: record });
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );

  app.delete(
    `${PREFIX}/org-billing/payment-methods/:id`,
    requireAuth({ requireOrg: true }),
    requirePermission("transactions.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const id = String(c.req.param("id") || "").trim();
        const key = `${PM_PREFIX}${orgId}:${id}`;
        const existing = await kv.get(key);
        if (!existing || !belongsToOrg(existing as Record<string, unknown>, c)) {
          return c.json({ error: "Not found" }, 404);
        }
        const wasDefault = Boolean((existing as any).isDefault);
        await kv.del(key);
        if (wasDefault) {
          const rest = await listOrgRecords(c, PM_PREFIX, orgId);
          if (rest[0]) {
            const firstId = String(rest[0].id);
            await kv.set(
              `${PM_PREFIX}${orgId}:${firstId}`,
              stampOrg({ ...rest[0], isDefault: true, updatedAt: new Date().toISOString() }, c),
            );
          }
        }
        return c.json({ success: true });
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );

  // ── Payout accounts ──────────────────────────────────────────────
  app.get(`${PREFIX}/org-billing/payout-accounts`, requireAuth({ requireOrg: true }), async (c) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
      const data = await listOrgRecords(c, PA_PREFIX, orgId);
      data.sort((a, b) => {
        if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? -1 : 1;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
      // Never return a plaintext full account number
      const safe = data.map((r) => {
        const { accountNumberEnc: _drop, ...rest } = r as Record<string, unknown> & {
          accountNumberEnc?: string;
        };
        return rest;
      });
      return c.json({ success: true, data: safe });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post(
    `${PREFIX}/org-billing/payout-accounts`,
    requireAuth({ requireOrg: true }),
    requirePermission("transactions.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const body = await c.req.json();
        const bankName = String(body?.bankName || "").trim().slice(0, 120);
        const accountHolderName = String(body?.accountHolderName || "").trim().slice(0, 120);
        const accountTypeRaw = String(body?.accountType || "checking").toLowerCase();
        const accountType = accountTypeRaw === "savings" ? "savings" : "checking";
        const accountDigits = digitsOnly(String(body?.accountNumber || ""));
        if (!bankName) return c.json({ error: "bankName is required" }, 400);
        if (!accountHolderName) return c.json({ error: "accountHolderName is required" }, 400);
        if (accountDigits.length < 4 || accountDigits.length > 34) {
          return c.json({ error: "accountNumber must be 4–34 digits" }, 400);
        }

        const existing = await listOrgRecords(c, PA_PREFIX, orgId);
        const makeDefault = body?.isDefault === true || existing.length === 0;
        if (makeDefault) await clearDefaultFlags(c, PA_PREFIX, orgId);

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const record = stampOrg(
          {
            id,
            organizationId: orgId,
            bankName,
            accountHolderName,
            accountType,
            accountLast4: accountDigits.slice(-4),
            // v1: do not persist full account number
            currency: "JMD",
            isDefault: makeDefault,
            status: "active",
            createdAt: now,
            updatedAt: now,
            createdBy: actorId(c),
          },
          c,
        );
        await kv.set(`${PA_PREFIX}${orgId}:${id}`, record);
        const { accountNumberEnc: _x, ...safe } = record as any;
        return c.json({ success: true, data: safe }, 201);
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );

  app.patch(
    `${PREFIX}/org-billing/payout-accounts/:id`,
    requireAuth({ requireOrg: true }),
    requirePermission("transactions.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const id = String(c.req.param("id") || "").trim();
        const key = `${PA_PREFIX}${orgId}:${id}`;
        const existing = await kv.get(key);
        if (!existing || !belongsToOrg(existing as Record<string, unknown>, c)) {
          return c.json({ error: "Not found" }, 404);
        }
        const body = await c.req.json();
        const next = { ...(existing as Record<string, unknown>) };
        if (body?.bankName != null) next.bankName = String(body.bankName).trim().slice(0, 120);
        if (body?.accountHolderName != null) {
          next.accountHolderName = String(body.accountHolderName).trim().slice(0, 120);
        }
        if (body?.accountType != null) {
          next.accountType =
            String(body.accountType).toLowerCase() === "savings" ? "savings" : "checking";
        }
        if (body?.isDefault === true) {
          await clearDefaultFlags(c, PA_PREFIX, orgId, id);
          next.isDefault = true;
        }
        next.updatedAt = new Date().toISOString();
        delete next.accountNumberEnc;
        const record = stampOrg(next, c);
        await kv.set(key, record);
        return c.json({ success: true, data: record });
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );

  app.delete(
    `${PREFIX}/org-billing/payout-accounts/:id`,
    requireAuth({ requireOrg: true }),
    requirePermission("transactions.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const id = String(c.req.param("id") || "").trim();
        const key = `${PA_PREFIX}${orgId}:${id}`;
        const existing = await kv.get(key);
        if (!existing || !belongsToOrg(existing as Record<string, unknown>, c)) {
          return c.json({ error: "Not found" }, 404);
        }
        const wasDefault = Boolean((existing as any).isDefault);
        await kv.del(key);
        if (wasDefault) {
          const rest = await listOrgRecords(c, PA_PREFIX, orgId);
          if (rest[0]) {
            const firstId = String(rest[0].id);
            await kv.set(
              `${PA_PREFIX}${orgId}:${firstId}`,
              stampOrg({ ...rest[0], isDefault: true, updatedAt: new Date().toISOString() }, c),
            );
          }
        }
        return c.json({ success: true });
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );
}
