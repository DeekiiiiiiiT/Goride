/**
 * Toll v2 import API — fleet file import, driver cash toll, matcher sweep hook (P2-R5).
 */
import { Hono, type Context } from "npm:hono@4.3.11";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import {
  mapTollCommandError,
  tollsV2OffResponse,
} from "./toll_v2_command_errors.ts";
import { getOrgId } from "./org_scope.ts";
import {
  assertSplitFillAllowed,
} from "./fuel_split_fill.ts";
import { getFleetDriverContext } from "../_shared/fleetDriverContext.ts";
import {
  buildIndriveCtx,
  buildPlazaIdByName,
  buildTagStatementCtx,
  buildTopupCtx,
  buildUberCtx,
  checkTollSysTollsV2On,
  checkTollV2Enabled,
  createServiceRpcFromModule,
  resolveDriverIdForUser,
  resolvePlazaId,
} from "./toll_v2_import_lookups.ts";
import {
  driverCashReceipt,
  indrive,
  tagStatement,
  topupProvider,
  uber,
} from "../../../packages/toll-core/src/v2/adapters/index.ts";
import type { AdapterProblem } from "../../../packages/toll-core/src/v2/adapters/types.ts";
import {
  runTollMatcher,
  runTollMatcherSweep,
  type MatcherSweepItem,
  type TollRpc,
} from "./toll_v2_matcher_run.ts";

export type MatcherSummary =
  | { ok: true; rounds?: number; stored?: Record<string, number>; queueLeft?: boolean }
  | { ok: false };

type TollImportEnv = {
  Variables: {
    rbacUser?: RbacUser;
  };
};

const app = new Hono<TollImportEnv>();

const FLEET_IMPORT_KINDS = new Set(["tag_statement", "topups", "uber", "indrive"]);

export type ImportDeps = {
  checkEnabled: () => Promise<boolean | { error: unknown }>;
  getOrg: () => string | null;
  runImport: (body: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  runMatcher: (orgId: string) => Promise<MatcherSummary>;
  buildLookups: (kind: string) => Promise<unknown>;
  readFleetFile: () => Promise<{ kind: string; commandId: string; fileName: string; texts: Record<string, string> }>;
  sysImport: (
    company: string,
    kind: string,
    rows: unknown[],
    commandId: string,
    actorJob: string,
  ) => Promise<{ data: unknown; error: unknown }>;
};

async function readBlobText(field: FormDataEntryValue | null): Promise<string> {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (field instanceof Blob) return await field.text();
  return "";
}

function fileNameFromField(field: FormDataEntryValue | null, fallback: string): string {
  if (field && typeof field === "object" && "name" in field) {
    const n = String((field as File).name || "").trim();
    if (n) return n;
  }
  return fallback;
}

async function runMatcherSafe(
  orgId: string,
  rpc: TollRpc,
): Promise<{ ok: true; rounds?: number; stored?: Record<string, number>; queueLeft?: boolean } | { ok: false }> {
  try {
    const report = await runTollMatcher(rpc, orgId);
    return {
      ok: true,
      rounds: report.rounds,
      stored: report.stored,
      queueLeft: report.queueLeft,
    };
  } catch (e) {
    console.error("[toll-v2-import] matcher failed", {
      organizationId: orgId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}

export async function handleFleetImport(
  deps: ImportDeps,
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

  const orgId = deps.getOrg();
  if (!orgId) {
    return { status: 400, body: { code: "BAD_REQUEST", current_state: {} } };
  }

  let parsed: Awaited<ReturnType<ImportDeps["readFleetFile"]>>;
  try {
    parsed = await deps.readFleetFile();
  } catch {
    return { status: 400, body: { code: "BAD_REQUEST", current_state: { need: ["kind", "command_id", "file"] } } };
  }

  const { kind, commandId, fileName, texts } = parsed;
  if (!commandId?.trim()) {
    return { status: 400, body: { code: "BAD_REQUEST", current_state: { need: ["command_id"] } } };
  }
  if (!FLEET_IMPORT_KINDS.has(kind)) {
    return { status: 400, body: { code: "BAD_REQUEST", current_state: { kind } } };
  }

  const problems: AdapterProblem[] = [];
  const imports: unknown[] = [];
  const lookups = await deps.buildLookups(kind);

  if (kind === "tag_statement") {
    const ctx = lookups as Awaited<ReturnType<typeof buildTagStatementCtx>>;
    const text = texts.file ?? "";
    const result = tagStatement(text, ctx);
    problems.push(...result.problems);
    if (result.rows.length > 0) {
      const imp = await deps.runImport({
        command_id: commandId,
        kind: "tag_statement",
        file_name: fileName,
        rows: result.rows,
      });
      if (imp.error) {
        const mapped = mapTollCommandError(imp.error);
        return { status: mapped.status, body: mapped.body as Record<string, unknown> };
      }
      imports.push(imp.data);
    }
    if (result.topups.length > 0) {
      const imp = await deps.runImport({
        command_id: `${commandId}:topups`,
        kind: "topups",
        file_name: fileName,
        rows: result.topups,
      });
      if (imp.error) {
        const mapped = mapTollCommandError(imp.error);
        return { status: mapped.status, body: mapped.body as Record<string, unknown> };
      }
      imports.push(imp.data);
    }
  } else if (kind === "topups") {
    const ctx = lookups as Awaited<ReturnType<typeof buildTopupCtx>>;
    const result = topupProvider(texts.file ?? "", ctx);
    problems.push(...result.problems);
    if (result.rows.length > 0) {
      const imp = await deps.runImport({
        command_id: commandId,
        kind,
        file_name: fileName,
        rows: result.rows,
      });
      if (imp.error) {
        const mapped = mapTollCommandError(imp.error);
        return { status: mapped.status, body: mapped.body as Record<string, unknown> };
      }
      imports.push(imp.data);
    }
  } else if (kind === "uber") {
    const ctx = lookups as Awaited<ReturnType<typeof buildUberCtx>>;
    const result = uber(
      { payments: texts.payments_transaction ?? "", tripActivity: texts.trip_activity ?? "" },
      ctx,
    );
    problems.push(...result.problems);
    if (result.rows.length > 0) {
      const imp = await deps.runImport({
        command_id: commandId,
        kind,
        file_name: fileName,
        rows: result.rows,
      });
      if (imp.error) {
        const mapped = mapTollCommandError(imp.error);
        return { status: mapped.status, body: mapped.body as Record<string, unknown> };
      }
      imports.push(imp.data);
    }
  } else if (kind === "indrive") {
    const ctx = lookups as Awaited<ReturnType<typeof buildIndriveCtx>>;
    const result = indrive(texts.file ?? "", ctx);
    problems.push(...result.problems);
    if (result.rows.length > 0) {
      const imp = await deps.runImport({
        command_id: commandId,
        kind,
        file_name: fileName,
        rows: result.rows,
      });
      if (imp.error) {
        const mapped = mapTollCommandError(imp.error);
        return { status: mapped.status, body: mapped.body as Record<string, unknown> };
      }
      imports.push(imp.data);
    }
  }

  const matcher = await deps.runMatcher(orgId);
  return {
    status: 200,
    body: { kind, file_name: fileName, imports, problems, matcher },
  };
}

export type DriverCashBody = {
  submission_id?: string;
  receipt_url?: string;
  receipt_number?: string;
  occurred_at?: string;
  amount_minor?: number;
  plaza_name?: string;
  lane?: string;
  collector?: string;
  vehicle_class?: string;
  driver_id?: string;
  organization_id?: string;
  company?: string;
};

const OCCURRED_AT_TZ = /[zZ]|[+-]\d{2}:\d{2}$/;

export function validateDriverCashInput(
  body: DriverCashBody,
): { ok: true } | { ok: false; field: "occurred_at" | "amount_minor" } {
  const occurredAt = String(body.occurred_at ?? "").trim();
  if (!occurredAt || !OCCURRED_AT_TZ.test(occurredAt) || Number.isNaN(Date.parse(occurredAt))) {
    return { ok: false, field: "occurred_at" };
  }
  const amt = body.amount_minor;
  if (amt === undefined || amt === null || typeof amt !== "number" || !Number.isInteger(amt) || amt <= 0) {
    return { ok: false, field: "amount_minor" };
  }
  return { ok: true };
}

export async function handleDriverCash(
  deps: ImportDeps & {
    getUserId: () => string | null;
    getVehicleId: () => Promise<string | null>;
    resolvePlaza: (name: string) => Promise<string>;
    resolveDriverId?: (orgId: string, userId: string) => Promise<string | null>;
    body: DriverCashBody;
  },
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

  const orgId = deps.getOrg();
  const userId = deps.getUserId();
  if (!orgId) {
    return { status: 401, body: { code: "NO_COMPANY", current_state: {} } };
  }
  if (!userId) {
    return { status: 401, body: { code: "UNAUTHORIZED", current_state: {} } };
  }

  const body = deps.body;
  const submissionId = String(body.submission_id ?? "").trim();
  if (!submissionId) {
    return { status: 400, body: { code: "BAD_REQUEST", current_state: { need: ["submission_id"] } } };
  }
  const receiptUrl = String(body.receipt_url ?? "").trim();
  if (!receiptUrl) {
    return { status: 400, body: { code: "RECEIPT_REQUIRED", current_state: {} } };
  }

  const cashFields = validateDriverCashInput(body);
  if (!cashFields.ok) {
    return {
      status: 400,
      body: { code: "BAD_REQUEST", current_state: { field: cashFields.field } },
    };
  }

  const vehicleId = await deps.getVehicleId();
  if (!vehicleId) {
    return { status: 400, body: { code: "NO_VEHICLE", current_state: {} } };
  }

  const resolveDriver = deps.resolveDriverId ?? resolveDriverIdForUser;
  const driverId = await resolveDriver(orgId, userId);
  if (!driverId) {
    return { status: 400, body: { code: "DRIVER_NOT_FOUND", current_state: {} } };
  }

  const plazaId = await deps.resolvePlaza(String(body.plaza_name ?? ""));

  const adapterOut = driverCashReceipt({
    submissionId,
    receiptNumber: body.receipt_number,
    receiptUrl,
    occurredAt: String(body.occurred_at ?? ""),
    amountMinor: Number(body.amount_minor ?? 0),
    plazaId,
    vehicleId,
    driverId,
    plaza: body.plaza_name,
    lane: body.lane,
    collector: body.collector,
    vehicleClass: body.vehicle_class,
  });
  if (adapterOut.problems.length > 0) {
    return {
      status: 400,
      body: { code: "BAD_REQUEST", current_state: {}, problems: adapterOut.problems },
    };
  }

  const imp = await deps.sysImport(orgId, "driver_cash", adapterOut.rows, submissionId, "driver_app");
  if (imp.error) {
    const mapped = mapTollCommandError(imp.error);
    return { status: mapped.status, body: mapped.body as Record<string, unknown> };
  }

  await deps.runMatcher(orgId);

  const data = imp.data as Record<string, unknown> | null;
  const replay = Boolean(data?.replay);
  const report = Array.isArray(data?.report) ? data.report as Record<string, unknown>[] : [];
  const first = report[0] ?? {};
  return {
    status: 200,
    body: {
      charge_id: first.id ?? null,
      status: first.status ?? null,
      replay,
    },
  };
}

export function isUserJwt(authHeader: string): boolean {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("eyJ")) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
    return payload.role === "authenticated";
  } catch {
    return false;
  }
}

export async function handleMatcherSweep(rpc: TollRpc): Promise<MatcherSweepItem[]> {
  return await runTollMatcherSweep(rpc);
}

function userScopedClient(c: Context): SupabaseClient {
  const authHeader = c.req.header("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

app.use("*", requireAuth({ strict: true }));

app.post("/toll/v2/import", requirePermission("toll.manage"), async (c) => {
  const supabase = userScopedClient(c);
  const orgId = getOrgId(c);
  const rpc = await createServiceRpcFromModule();

  const form = await c.req.formData();
  const kind = String(form.get("kind") ?? "").trim();
  const commandId = String(form.get("command_id") ?? "").trim();
  const fileField = form.get("file");
  const paymentsField = form.get("payments_transaction");
  const tripField = form.get("trip_activity");

  const result = await handleFleetImport({
    checkEnabled: async () => {
      const r = await checkTollV2Enabled(supabase);
      if (!r.ok) return { error: r.error };
      return r.enabled;
    },
    getOrg: () => orgId,
    runImport: async (body) => {
      const { data, error } = await supabase.rpc("toll_v2_command", {
        p_intent: "import_batch",
        p_body: body,
      });
      return { data, error };
    },
    runMatcher: async (company) => runMatcherSafe(company, rpc),
    buildLookups: async (k) => {
      if (!orgId) throw new Error("no org");
      if (k === "tag_statement") return await buildTagStatementCtx(orgId);
      if (k === "topups") return await buildTopupCtx(orgId);
      if (k === "uber") return await buildUberCtx(orgId);
      if (k === "indrive") return await buildIndriveCtx(orgId);
      return {};
    },
    readFleetFile: async () => ({
      kind,
      commandId,
      fileName: fileNameFromField(fileField, "upload.csv"),
      texts: {
        file: await readBlobText(fileField),
        payments_transaction: await readBlobText(paymentsField),
        trip_activity: await readBlobText(tripField),
      },
    }),
    sysImport: async () => ({ data: null, error: null }),
  });

  return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 409 | 500);
});

app.post("/toll/v2/driver-cash", async (c) => {
  const gate = assertSplitFillAllowed(c);
  if (!gate.allowed) return c.json(gate.body, gate.status);

  const rbacUser = c.get("rbacUser") as RbacUser;
  const orgId = getOrgId(c);
  if (!orgId) {
    return c.json({ code: "NO_COMPANY", current_state: {} }, 401);
  }
  const body = await c.req.json().catch(() => ({})) as DriverCashBody;
  const rpc = await createServiceRpcFromModule();
  const { getServiceClient } = await import("./service_client.ts");

  const result = await handleDriverCash({
    checkEnabled: async () => {
      const r = await checkTollSysTollsV2On(orgId);
      if (!r.ok) return { error: r.error };
      return r.enabled;
    },
    getOrg: () => orgId,
    getUserId: () => rbacUser.userId,
    getVehicleId: async () => {
      const ctx = await getFleetDriverContext(rbacUser.userId);
      return ctx.assignedVehicleId;
    },
    resolvePlaza: async (name) => {
      if (!orgId) return "unknown";
      const map = await buildPlazaIdByName(orgId);
      return resolvePlazaId(name, map);
    },
    body,
    runImport: async () => ({ data: null, error: null }),
    runMatcher: async (company) => runMatcherSafe(company, rpc),
    buildLookups: async () => ({}),
    readFleetFile: async () => ({
      kind: "",
      commandId: "",
      fileName: "",
      texts: {},
    }),
    sysImport: async (company, kind, rows, commandId, actorJob) => {
      const svc = getServiceClient();
      const { data, error } = await svc.rpc("toll_sys_import", {
        p_company: company,
        p_kind: kind,
        p_rows: rows,
        p_command_id: commandId,
        p_actor_job: actorJob,
      });
      return { data, error };
    },
  });

  return c.json(result.body, result.status as 200 | 400 | 401 | 403 | 409 | 500);
});

export default app;
