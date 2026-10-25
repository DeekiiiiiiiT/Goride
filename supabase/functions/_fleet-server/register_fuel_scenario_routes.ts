/**
 * Fuel policy routes. Login and fuel.configure required to save or archive.
 * Reads and writes are limited to the caller's company.
 */
import type { Hono } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import { getOrgId, stampOrgRequired } from "./org_scope.ts";
import { validateFuelScenarioPayload } from "./fuel_scenario_validation.ts";
import {
  filterFuelScenariosForOrg,
  fuelScenarioOrgId,
  standardFuelScenario,
  type FuelScenarioRecord,
} from "./fuel_scenario_scope.ts";
import {
  frozenWeeksInWindow,
  validateScenarioSchedule,
} from "../../../packages/fuel-core/src/fuelPolicyVersion.ts";
import type { FuelScenario } from "../../../packages/fuel-core/src/fuelTypes.ts";
import { getServiceClient } from "./service_client.ts";
import { loadFuelDualApproval, saveFuelDualApproval } from "./fuel_org_preferences.ts";

const PREFIX = "fuel_scenario:";

async function loadAll(): Promise<FuelScenarioRecord[]> {
  return ((await kv.getByPrefix(PREFIX)) || []) as FuelScenarioRecord[];
}

function changeKey(orgId: string): string {
  return `fuel_policy_change:${orgId}:${new Date().toISOString()}:${crypto.randomUUID()}`;
}

async function writeChange(opts: {
  orgId: string;
  actorId: string | null;
  action: string;
  before: unknown;
  after: unknown;
}) {
  await kv.set(changeKey(opts.orgId), {
    organizationId: opts.orgId,
    actorId: opts.actorId,
    action: opts.action,
    at: new Date().toISOString(),
    before: opts.before,
    after: opts.after,
  });
}

async function frozenMondays(orgId: string): Promise<string[]> {
  const sb = getServiceClient();
  const keys = new Set<string>();
  const { data: periods, error } = await sb
    .from("driver_financial_periods")
    .select("period_anchor, status, closed_at")
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
  for (const row of periods || []) {
    const closed =
      String(row.status || "").toLowerCase() === "closed" || row.closed_at != null;
    if (!closed) continue;
    keys.add(String(row.period_anchor).slice(0, 10));
  }
  const { data: locks, error: lockErr } = await sb
    .from("finance_period_locks")
    .select("week_start")
    .eq("organization_id", orgId);
  if (lockErr) {
    const msg = String(lockErr.message || "");
    if (!/does not exist|schema cache|Could not find/i.test(msg)) throw new Error(msg);
  }
  for (const row of locks || []) {
    keys.add(String(row.week_start).slice(0, 10));
  }
  return [...keys];
}

function scheduleHitsFrozen(
  before: FuelScenarioRecord | null,
  after: FuelScenarioRecord,
  frozen: string[],
): string | null {
  const prior = new Map(
    ((before?.versions as Array<Record<string, unknown>> | undefined) || []).map((v) => [
      String(v.id),
      v,
    ]),
  );
  const next = ((after.versions as Array<Record<string, unknown>> | undefined) || []);
  const nextIds = new Set(next.map((v) => String(v.id)));
  const changed: Array<Record<string, unknown>> = [];
  for (const v of next) {
    const old = prior.get(String(v.id));
    if (!old || JSON.stringify(old) !== JSON.stringify(v)) changed.push(v);
    if (old && JSON.stringify(old) !== JSON.stringify(v)) changed.push(old);
  }
  for (const [id, old] of prior) {
    if (!nextIds.has(id)) changed.push(old);
  }
  for (const v of changed) {
    const hits = frozenWeeksInWindow(
      String(v.effectiveFrom || ""),
      v.effectiveUntil ? String(v.effectiveUntil) : null,
      frozen,
    );
    if (hits.length) {
      return `This schedule covers a closed week (${hits[0]}). Start a new window from the first open week.`;
    }
  }
  return null;
}

export function registerFuelScenarioRoutes(app: Hono) {
  app.get("/make-server-37f42386/scenarios", requireAuth(), async (c) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
      const items = filterFuelScenariosForOrg(await loadAll(), orgId);
      return c.json(items);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post(
    "/make-server-37f42386/scenarios",
    requireAuth(),
    requirePermission("fuel.configure"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const user = c.get("rbacUser") as RbacUser | undefined;
        const item = await c.req.json();
        const validationError = validateFuelScenarioPayload(item);
        if (validationError) return c.json({ error: validationError }, 400);

        if (!item.id) item.id = crypto.randomUUID();
        const all = await loadAll();
        const existing = all.find((s) => s?.id === item.id) || null;
        if (existing) {
          const owner = fuelScenarioOrgId(existing);
          if (owner !== orgId) return c.json({ error: "Not found" }, 404);
        }

        const mine = filterFuelScenariosForOrg(all, orgId);
        const stamped = stampOrgRequired({ ...item, organizationId: orgId }, c);
        const scheduleError = validateScenarioSchedule(
          stamped as unknown as FuelScenario,
          mine.map((row) => ({ ...(row as object), ...(row.id === item.id ? stamped : row) })) as FuelScenario[],
        );
        if (scheduleError) return c.json({ error: scheduleError }, 400);

        const frozen = await frozenMondays(orgId);
        const frozenError = scheduleHitsFrozen(existing, stamped, frozen);
        if (frozenError) return c.json({ error: frozenError }, 409);

        if (stamped.isDefault) {
          for (const other of mine) {
            if (other?.id && other.id !== stamped.id && other.isDefault && !other.archived) {
              await kv.set(`${PREFIX}${other.id}`, { ...other, isDefault: false });
            }
          }
        }

        await kv.set(`${PREFIX}${stamped.id}`, stamped);
        await writeChange({
          orgId,
          actorId: user?.userId || null,
          action: existing ? "save" : "create",
          before: existing,
          after: stamped,
        });
        return c.json({ success: true, data: stamped });
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );

  app.delete(
    "/make-server-37f42386/scenarios/:id",
    requireAuth(),
    requirePermission("fuel.configure"),
    async (c) => {
      const id = c.req.param("id");
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const user = c.get("rbacUser") as RbacUser | undefined;
        const mine = filterFuelScenariosForOrg(await loadAll(), orgId);
        const target = mine.find((s) => s?.id === id);
        if (!target) return c.json({ error: "Not found" }, 404);

        const active = mine.filter((s) => !s.archived);
        if (active.length <= 1 && !target.archived) {
          return c.json({ error: "Cannot archive the last remaining fuel policy." }, 409);
        }
        if (target.isDefault && !target.archived) {
          return c.json({
            error: "Cannot archive the default policy. Set another policy as default first.",
          }, 409);
        }

        const archived = { ...target, archived: true, isDefault: false };
        await kv.set(`${PREFIX}${id}`, archived);
        await writeChange({
          orgId,
          actorId: user?.userId || null,
          action: "archive",
          before: target,
          after: archived,
        });
        return c.json({ success: true, archived: true });
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );

  app.post(
    "/make-server-37f42386/scenarios/backfill-tenancy",
    requireAuth(),
    requirePermission("data.backfill"),
    async (c) => {
      try {
        const body = await c.req.json().catch(() => ({}));
        const result = await backfillFuelScenarioTenancy({
          kennyDriverId: String(body.kennyDriverId || "73e5b1dc"),
        });
        return c.json({ success: true, ...result });
      } catch (e: any) {
        return c.json({ error: e.message }, 500);
      }
    },
  );

  app.get("/make-server-37f42386/fuel/dual-approval", requireAuth(), async (c) => {
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
    return c.json(await loadFuelDualApproval(orgId));
  });

  app.post(
    "/make-server-37f42386/fuel/dual-approval",
    requireAuth(),
    requirePermission("fuel.configure"),
    async (c) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
      const user = c.get("rbacUser") as RbacUser | undefined;
      const body = await c.req.json().catch(() => ({}));
      const saved = await saveFuelDualApproval(
        orgId,
        {
          threshold: Number(body.threshold),
          autoCloseMode: body.autoCloseMode,
          uiMode: body.uiMode,
        },
        user?.userId || null,
      );
      return c.json({ success: true, ...saved });
    },
  );
}

/** Stamp unscoped policies to the company that employs the named driver, then give every other company its own Standard. */
export async function backfillFuelScenarioTenancy(opts: { kennyDriverId: string }) {
  const sb = getServiceClient();
  const { data: period, error } = await sb
    .from("driver_financial_periods")
    .select("organization_id, driver_id")
    .ilike("driver_id", `${opts.kennyDriverId}%`)
    .not("organization_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const kennyOrg = String(period?.organization_id || "").trim();
  if (!kennyOrg) throw new Error("KENNY_ORG_NOT_FOUND");

  const { data: orgs, error: orgErr } = await sb.from("organizations").select("id");
  if (orgErr) throw new Error(orgErr.message);
  const orgIds = (orgs || []).map((o) => String(o.id)).filter(Boolean);

  const all = await loadAll();
  let stamped = 0;
  for (const row of all) {
    if (fuelScenarioOrgId(row)) continue;
    const next = { ...row, organizationId: kennyOrg };
    await kv.set(`${PREFIX}${row.id}`, next);
    stamped++;
  }

  const after = await loadAll();
  let seeded = 0;
  for (const orgId of orgIds) {
    const mine = filterFuelScenariosForOrg(after, orgId).filter((s) => !s.archived);
    if (mine.length > 0) continue;
    const id = crypto.randomUUID();
    await kv.set(`${PREFIX}${id}`, standardFuelScenario(orgId, id));
    seeded++;
  }
  return { kennyOrg, stamped, seeded, organizations: orgIds.length };
}

/** New company gets its own Standard policy. Does nothing if one already exists. */
export async function ensureStandardFuelPolicy(orgId: string): Promise<void> {
  const id = String(orgId || "").trim();
  if (!id) return;
  const mine = filterFuelScenariosForOrg(await loadAll(), id).filter((s) => !s.archived);
  if (mine.length > 0) return;
  const scenarioId = crypto.randomUUID();
  await kv.set(`${PREFIX}${scenarioId}`, standardFuelScenario(id, scenarioId));
}
