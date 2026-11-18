/**
 * Toll v2 driver disputes — list + mark sent (driver JWT + service RPC).
 */
import { Hono, type Context } from "npm:hono@4.3.11";
import type { RbacUser } from "./rbac_middleware.ts";
import { requireAuth } from "./rbac_middleware.ts";
import { mapTollCommandError, tollsV2OffResponse } from "./toll_v2_command_errors.ts";
import { getOrgId } from "./org_scope.ts";
import { assertSplitFillAllowed } from "./fuel_split_fill.ts";
import {
  checkTollSysTollsV2On,
  createServiceRpcFromModule,
  resolveDriverIdForUser,
} from "./toll_v2_import_lookups.ts";

export type DriverDisputesRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string; details?: string } | null }>;

export type DriverDisputesDeps = {
  checkEnabled: () => Promise<boolean | { error: unknown }>;
  getOrg: () => string | null;
  getUserId: () => string | null;
  resolveDriverId: (orgId: string, userId: string) => Promise<string | null>;
  serviceRpc: DriverDisputesRpc;
  assertDriverRole: () => { allowed: true } | { allowed: false; status: 401 | 403; body: Record<string, unknown> };
};

function parseWindowDays(details: string | undefined): number | null {
  if (!details?.trim()) return null;
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const wd = parsed.windowDays ?? parsed.window_days ?? parsed.dispute_window_days;
    if (typeof wd === "number" && Number.isFinite(wd)) return wd;
    if (typeof wd === "string" && wd.trim() !== "") return Number(wd);
  } catch {
    /* ignore */
  }
  return null;
}

function isWindowClosedErr(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string };
  if (o.code === "P0001" && o.message === "window_closed") return true;
  return o.message === "window_closed";
}

export function mapDriverDisputeError(err: unknown, windowDaysHint?: number | null): {
  status: number;
  body: Record<string, unknown>;
} {
  const mapped = mapTollCommandError(err);
  if (isWindowClosedErr(err) || mapped.body.code === "window_closed") {
    const fromDetails = parseWindowDays(
      err && typeof err === "object" && "details" in err
        ? String((err as { details?: string }).details ?? "")
        : undefined,
    );
    const days = windowDaysHint ?? fromDetails ?? 9;
    return {
      status: 409,
      body: {
        code: "window_closed",
        message: `The ${days} days to dispute this toll have passed`,
        current_state: mapped.body.current_state,
      },
    };
  }
  return { status: mapped.status, body: mapped.body as Record<string, unknown> };
}

export async function handleListDriverDisputes(
  deps: DriverDisputesDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const enabled = await deps.checkEnabled();
  if (enabled && typeof enabled === "object" && "error" in enabled) {
    const mapped = mapTollCommandError(enabled.error);
    return { status: mapped.status, body: mapped.body as Record<string, unknown> };
  }
  if (!enabled) {
    const off = tollsV2OffResponse();
    return { status: off.status, body: off.body as Record<string, unknown> };
  }

  const gate = deps.assertDriverRole();
  if (!gate.allowed) return { status: gate.status, body: gate.body };

  const orgId = deps.getOrg();
  const userId = deps.getUserId();
  if (!orgId) {
    return { status: 401, body: { code: "NO_COMPANY", current_state: {} } };
  }
  if (!userId) {
    return { status: 401, body: { code: "UNAUTHORIZED", current_state: {} } };
  }

  const driverId = await deps.resolveDriverId(orgId, userId);
  if (!driverId) {
    return { status: 400, body: { code: "DRIVER_NOT_FOUND", current_state: {} } };
  }

  const { data, error } = await deps.serviceRpc("toll_sys_driver_disputes", {
    p_company: orgId,
    p_driver: driverId,
  });
  if (error) {
    const mapped = mapDriverDisputeError(error);
    return { status: mapped.status, body: mapped.body };
  }
  return { status: 200, body: (data as Record<string, unknown>) ?? {} };
}

export async function handleMarkDriverDisputeSent(
  deps: DriverDisputesDeps,
  disputeId: string,
  body: { command_id?: string; expected_dispute_version?: number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const enabled = await deps.checkEnabled();
  if (enabled && typeof enabled === "object" && "error" in enabled) {
    const mapped = mapTollCommandError(enabled.error);
    return { status: mapped.status, body: mapped.body as Record<string, unknown> };
  }
  if (!enabled) {
    const off = tollsV2OffResponse();
    return { status: off.status, body: off.body as Record<string, unknown> };
  }

  const gate = deps.assertDriverRole();
  if (!gate.allowed) return { status: gate.status, body: gate.body };

  const orgId = deps.getOrg();
  const userId = deps.getUserId();
  if (!orgId) {
    return { status: 401, body: { code: "NO_COMPANY", current_state: {} } };
  }
  if (!userId) {
    return { status: 401, body: { code: "UNAUTHORIZED", current_state: {} } };
  }

  const driverId = await deps.resolveDriverId(orgId, userId);
  if (!driverId) {
    return { status: 400, body: { code: "DRIVER_NOT_FOUND", current_state: {} } };
  }

  const commandId = String(body.command_id ?? "").trim();
  if (!commandId) {
    return { status: 400, body: { code: "BAD_REQUEST", current_state: { need: ["command_id"] } } };
  }
  if (body.expected_dispute_version === undefined || body.expected_dispute_version === null) {
    return { status: 400, body: { code: "BAD_REQUEST", current_state: { need: ["expected_dispute_version"] } } };
  }

  const rpcBody = {
    dispute_id: disputeId,
    expected_dispute_version: body.expected_dispute_version,
    command_id: commandId,
  };

  const { data, error } = await deps.serviceRpc("toll_sys_driver_mark_dispute_sent", {
    p_company: orgId,
    p_driver: driverId,
    p_user: userId,
    p_body: rpcBody,
  });
  if (error) {
    const mapped = mapDriverDisputeError(error);
    return { status: mapped.status, body: mapped.body };
  }
  return { status: 200, body: (data as Record<string, unknown>) ?? {} };
}

const app = new Hono();

app.use("*", requireAuth({ strict: true }));

app.get("/toll/v2/driver/disputes", async (c) => {
  const rbacUser = c.get("rbacUser") as RbacUser;
  const orgId = getOrgId(c);
  const rpc = await createServiceRpcFromModule();

  const result = await handleListDriverDisputes({
    checkEnabled: async () => {
      if (!orgId) return false;
      const r = await checkTollSysTollsV2On(orgId);
      if (!r.ok) return { error: r.error };
      return r.enabled;
    },
    getOrg: () => orgId,
    getUserId: () => rbacUser.userId,
    resolveDriverId: resolveDriverIdForUser,
    serviceRpc: rpc,
    assertDriverRole: () => assertSplitFillAllowed(c),
  });

  return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 409 | 500);
});

app.post("/toll/v2/driver/disputes/:id/sent", async (c) => {
  const rbacUser = c.get("rbacUser") as RbacUser;
  const orgId = getOrgId(c);
  const disputeId = String(c.req.param("id") ?? "").trim();
  const body = await c.req.json().catch(() => ({})) as {
    command_id?: string;
    expected_dispute_version?: number;
    driver_id?: string;
  };
  const rpc = await createServiceRpcFromModule();

  const result = await handleMarkDriverDisputeSent(
    {
      checkEnabled: async () => {
        if (!orgId) return false;
        const r = await checkTollSysTollsV2On(orgId);
        if (!r.ok) return { error: r.error };
        return r.enabled;
      },
      getOrg: () => orgId,
      getUserId: () => rbacUser.userId,
      resolveDriverId: resolveDriverIdForUser,
      serviceRpc: rpc,
      assertDriverRole: () => assertSplitFillAllowed(c),
    },
    disputeId,
    body,
  );

  return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 409 | 500);
});

export default app;