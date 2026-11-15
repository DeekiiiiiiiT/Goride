/**
 * deno test --no-check supabase/functions/_fleet-server/maintenance_completion.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { Context } from "npm:hono@4.3.11";
import { ledgerCanonicalTestHooks } from "./ledger_canonical.ts";
import { unifiedLedgerDualWriteTestHooks } from "./unified_ledger_dual_write.ts";
import {
  buildDefaultCompletionSteps,
  COMPLETION_STEP_NAMES,
  maintenanceRecordAcceptsClientHint,
  runCompletion,
  type CompletionSteps,
} from "./maintenance_completion.ts";
import { commitPartsUsage } from "./parts_match.ts";

const orgId = "test-org";
const workOrderId = "b1111111-1111-4111-8111-111111111101";
const actorId = "a1111111-1111-4111-8111-111111111111";

function stubSteps(): CompletionSteps & { calls: string[]; finishCalled: boolean } {
  const calls: string[] = [];
  let finishCalled = false;
  const step = (name: string) => async () => {
    calls.push(name);
    if (name === "commitPartsUsage") return { warrantyPrompts: [], stockWarnings: [] };
    if (name === "upsertServiceRecord") return { id: "r1111111-1111-4111-8111-111111111101" };
    if (name === "appendCanonicalMaintenance") return { posted: true, failed: false };
    if (name === "fleetLogService") return { eventType: "service.logged" };
    return undefined;
  };
  return {
    calls,
    finishCalled,
    commitPartsUsage: step("commitPartsUsage"),
    upsertServiceRecord: step("upsertServiceRecord"),
    refreshRepeatPartAlerts: step("refreshRepeatPartAlerts"),
    recordCompletedServiceLines: step("recordCompletedServiceLines"),
    maybeAdvancePackageSchedule: step("maybeAdvancePackageSchedule"),
    appendCanonicalMaintenance: step("appendCanonicalMaintenance"),
    projectFromMaintenanceLog: step("projectFromMaintenanceLog"),
    fleetLogService: step("fleetLogService"),
    finishCompletion: async () => {
      finishCalled = true;
      calls.push("finishCompletion");
      return { id: workOrderId, status: "completed" };
    },
  };
}

function mockSupabase(
  claimData: Record<string, unknown>,
  releaseLog: string[],
  opts?: { wo?: Record<string, unknown>; lines?: Record<string, unknown>[] },
) {
  const wo = opts?.wo ?? baseWo;
  const lines = opts?.lines ?? ([] as Record<string, unknown>[]);
  const claimed = claimData.claimed === true;
  return {
    rpc: (name: string) => {
      if (name === "fleet_claim_completion") {
        return Promise.resolve({ data: claimData, error: null });
      }
      if (name === "fleet_release_completion") {
        releaseLog.push("release");
        return Promise.resolve({ data: null, error: null });
      }
      if (name === "fleet_finish_completion") {
        return Promise.resolve({ data: { id: workOrderId, status: "completed" }, error: null });
      }
      if (name === "fleet_log_service") {
        return Promise.resolve({ data: { eventType: "service.logged" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      if (claimed && table === "maintenance_work_orders") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: wo, error: null }),
              }),
            }),
          }),
        };
      }
      if (claimed && table === "maintenance_work_order_lines") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => Promise.resolve({ data: lines, error: null }),
              }),
              order: () => Promise.resolve({ data: lines, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    },
  } as never;
}

const baseWo = {
  id: workOrderId,
  vehicle_id: "veh-1",
  status: "in_progress",
  odometer: 1000,
  performed_at_date: "2026-01-01",
  discount_amount: 0,
  currency: "JMD",
  log_mode: "quick_job",
};

const baseInput = {
  orgId,
  workOrderId,
  actorId,
  wo: baseWo,
  lineRows: [] as Record<string, unknown>[],
  body: {},
  c: {} as Context,
  enrichLines: async (_id: string, lines: Record<string, unknown>[]) => lines,
  mapCompletedItem: (wo: Record<string, unknown>, lines: Record<string, unknown>[]) => ({ ...wo, lines }),
};

Deno.test("claim completed replay — no completion steps", async () => {
  const releaseLog: string[] = [];
  const steps = stubSteps();
  const sb = mockSupabase({ claimed: false, reason: "completed" }, releaseLog);
  const r = await runCompletion(sb, baseInput, steps);
  assertEquals(r.status, 200);
  assertEquals(r.body.idempotentReplay, true);
  assertEquals(steps.calls.length, 0);
  assertEquals(releaseLog.length, 0);
});

Deno.test("in_progress_elsewhere → 409", async () => {
  const sb = mockSupabase({ claimed: false, reason: "in_progress_elsewhere" }, []);
  const r = await runCompletion(sb, baseInput, stubSteps());
  assertEquals(r.status, 409);
  assertEquals(r.body.code, "completion_in_progress");
});

Deno.test("not_claimable → 409", async () => {
  const sb = mockSupabase({ claimed: false, reason: "not_claimable" }, []);
  const r = await runCompletion(sb, baseInput, stubSteps());
  assertEquals(r.status, 409);
  assertEquals(r.body.code, "not_claimable");
});

Deno.test("step failure releases claim and skips finish", async () => {
  for (const stepName of COMPLETION_STEP_NAMES) {
    const releaseLog: string[] = [];
    const sb = mockSupabase({ claimed: true }, releaseLog);
    const failing = stubSteps();
    const key = stepName as keyof CompletionSteps;
    failing[key] = (async () => {
      throw new Error(`fail ${stepName}`);
    }) as never;
    const r = await runCompletion(sb, baseInput, failing);
    assertEquals(r.status, 500);
    assertEquals(r.body.code, "completion_failed");
    assertEquals(r.body.step, stepName);
    assertEquals(failing.finishCalled, false);
    assertEquals(releaseLog.length, 1);
  }
});

Deno.test("finance failed stops before projectFromMaintenanceLog", async () => {
  const releaseLog: string[] = [];
  const steps = stubSteps();
  steps.appendCanonicalMaintenance = async () => ({ posted: false, failed: true });
  const sb = mockSupabase({ claimed: true }, releaseLog);
  const r = await runCompletion(sb, baseInput, steps);
  assertEquals(r.status, 500);
  assertEquals(r.body.step, "appendCanonicalMaintenance");
  assertEquals(steps.calls.includes("projectFromMaintenanceLog"), false);
});

Deno.test("after claim, completion steps see re-read lines not stale input", async () => {
  let enrichCall = 0;
  let linesPassedToEnrich: string[] = [];
  const input = {
    ...baseInput,
    lineRows: [{ id: "stale-line" }],
    enrichLines: async (_id: string, lines: Record<string, unknown>[]) => {
      enrichCall++;
      if (enrichCall === 1) {
        assertEquals("component_id" in (lines[0] ?? {}), true);
        assertEquals("componentId" in (lines[0] ?? {}), false);
      }
      for (const l of lines) linesPassedToEnrich.push(String(l.id));
      return lines;
    },
  };
  const sb = mockSupabase({ claimed: true }, [], {
    lines: [{ id: "fresh-line", component_id: "c1111111-1111-4111-8111-111111111101" }],
  });
  const r = await runCompletion(sb, input, stubSteps(), { assessOdometer: async () => null });
  assertEquals(r.status, 200);
  assertEquals(linesPassedToEnrich.includes("fresh-line"), true);
  assertEquals(linesPassedToEnrich.includes("stale-line"), false);
  assertEquals(enrichCall, 1);
});

const integrationLineId = "e1111111-1111-4111-8111-111111111101";
const integrationCategoryId = "f1111111-1111-4111-8111-111111111101";
const integrationPartId = "e2222222-2222-4222-8222-222222222202";
const integrationVehicleId = "v1111111-1111-4111-8111-111111111101";

function enrichLinesLikeApi(_woId: string, lines: Record<string, unknown>[]) {
  return lines.map((line) => ({
    id: line.id,
    componentId: line.component_id,
    partId: line.part_id,
    lineTotal: line.line_total != null ? Number(line.line_total) : undefined,
    items: [] as unknown[],
  }));
}

function createDefaultStepsIntegrationSupabase(opts?: {
  orgId?: string;
  workOrderId?: string;
  onFinishCompletion?: () => void;
}) {
  const integrationOrgId = opts?.orgId ?? orgId;
  const integrationWoId = opts?.workOrderId ?? workOrderId;
  const rpcCalls: string[] = [];
  const ledgerInserts: Record<string, unknown>[] = [];
  const recordInserts: Record<string, unknown>[] = [];

  const lineRow = {
    id: integrationLineId,
    work_order_id: integrationWoId,
    component_id: integrationCategoryId,
    part_id: integrationPartId,
    line_total: 500,
    sort_order: 0,
    declined: false,
  };

  const wo = {
    id: integrationWoId,
    vehicle_id: integrationVehicleId,
    organization_id: integrationOrgId,
    status: "in_progress",
    odometer: 1000,
    performed_at_date: "2026-01-01",
    discount_amount: 50,
    currency: "JMD",
    log_mode: "quick_job",
  };

  const categoryRow = {
    id: integrationCategoryId,
    code: "brake",
    name: "Brake",
    position_aware: true,
  };

  const client = {
    rpc: (name: string) => {
      rpcCalls.push(name);
      if (name === "fleet_claim_completion") {
        return Promise.resolve({ data: { claimed: true }, error: null });
      }
      if (name === "apply_parts_usage_for_work_order") {
        return Promise.resolve({
          data: { ok: true, warrantyPrompts: [], stockWarnings: [] },
          error: null,
        });
      }
      if (name === "refresh_repeat_part_alerts") {
        return Promise.resolve({ data: null, error: null });
      }
      if (name === "fleet_log_service") {
        return Promise.resolve({ data: { eventType: "service.logged" }, error: null });
      }
      if (name === "fleet_finish_completion") {
        opts?.onFinishCompletion?.();
        return Promise.resolve({ data: { id: integrationWoId, status: "completed" }, error: null });
      }
      if (name === "fleet_release_completion") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      if (table === "maintenance_work_orders") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: wo, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "maintenance_work_order_lines") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => Promise.resolve({ data: [lineRow], error: null }),
              }),
              order: () => Promise.resolve({ data: [lineRow], error: null }),
            }),
          }),
        };
      }
      if (table === "maintenance_service_categories") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: categoryRow, error: null }),
            }),
          }),
        };
      }
      if (table === "maintenance_package_categories") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === "maintenance_service_ledger") {
        return {
          insert: (row: Record<string, unknown>) => {
            ledgerInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "maintenance_records") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => {
                recordInserts.push(row);
                return Promise.resolve({ data: row, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table in integration mock: ${table}`);
    },
  };

  return { client: client as never, rpcCalls, ledgerInserts, recordInserts, lineRow, wo };
}

Deno.test("default steps: database-shaped lines drive parts, ledger, record cost", async () => {
  const { client, rpcCalls, ledgerInserts, recordInserts, lineRow, wo } =
    createDefaultStepsIntegrationSupabase();

  const input = {
    ...baseInput,
    orgId,
    wo: baseWo,
    lineRows: [{ id: "stale", component_id: "stale-cat" }],
    enrichLines: enrichLinesLikeApi,
    mapCompletedItem: (w: Record<string, unknown>, lines: Record<string, unknown>[]) => ({ ...w, lines }),
  };

  const r = await runCompletion(
    client,
    input,
    {
      refreshRepeatPartAlerts: async () => {},
      maybeAdvancePackageSchedule: async () => {},
      appendCanonicalMaintenance: async () => ({ posted: false, failed: false }),
      projectFromMaintenanceLog: async () => {},
    },
    { assessOdometer: async () => null },
  );

  assertEquals(r.status, 200);
  assertEquals(rpcCalls.includes("apply_parts_usage_for_work_order"), true);
  assertEquals(ledgerInserts.length, 1);
  assertEquals(ledgerInserts[0].category_id, integrationCategoryId);
  assertEquals(ledgerInserts[0].work_order_line_id, integrationLineId);
  assertEquals(recordInserts.length, 1);
  assertEquals(recordInserts[0].cost, 450);
  const payload = recordInserts[0].payload_json as Record<string, unknown>;
  const payloadLines = payload.lines as Record<string, unknown>[];
  assertEquals(payloadLines[0].componentId, integrationCategoryId);
  assertEquals(String(payloadLines[0].id), integrationLineId);
  assertEquals(Number(wo.discount_amount), 50);
  assertEquals(Number(lineRow.line_total), 500);
});

Deno.test("maintenanceRecordAcceptsClientHint rejects other fleet or work order", () => {
  const scope = { orgId: "org-a", vehicleId: "veh-1", workOrderId: workOrderId };
  assertEquals(
    maintenanceRecordAcceptsClientHint(
      { organization_id: "org-b", vehicle_id: "veh-1", work_order_id: null },
      scope,
    ),
    false,
  );
  assertEquals(
    maintenanceRecordAcceptsClientHint(
      { organization_id: "org-a", vehicle_id: "veh-1", work_order_id: "other-wo" },
      scope,
    ),
    false,
  );
  assertEquals(
    maintenanceRecordAcceptsClientHint(
      { organization_id: "org-a", vehicle_id: "veh-1", work_order_id: null },
      scope,
    ),
    true,
  );
});

function recordMockSupabase(config: {
  byWo?: Record<string, unknown> | null;
  byId?: Record<string, unknown> | null;
  updates: Array<Record<string, unknown>>;
  inserts: Array<Record<string, unknown>>;
}) {
  return {
    from: (table: string) => {
      if (table !== "maintenance_records") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (col: string) => ({
            maybeSingle: () => {
              if (col === "work_order_id") {
                return Promise.resolve({ data: config.byWo ?? null, error: null });
              }
              return Promise.resolve({ data: config.byId ?? null, error: null });
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            select: () => ({
              single: () => {
                config.updates.push(patch);
                return Promise.resolve({
                  data: { id: config.byWo?.id ?? config.byId?.id, ...patch },
                  error: null,
                });
              },
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              config.inserts.push(row);
              return Promise.resolve({ data: row, error: null });
            },
          }),
        }),
      };
    },
    rpc: () => Promise.resolve({ error: null, data: null }),
  } as never;
}

const hintId = "c1111111-1111-4111-8111-111111111111";
const foreignRecordId = "d1111111-1111-4111-8111-111111111111";

Deno.test("upsertServiceRecord: foreign hint inserts new record", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const sb = recordMockSupabase({
    byWo: null,
    byId: {
      id: foreignRecordId,
      organization_id: "other-org",
      vehicle_id: "veh-1",
      work_order_id: null,
    },
    updates,
    inserts,
  });
  const steps = buildDefaultCompletionSteps(sb, {
    ...baseInput,
    body: { recordId: foreignRecordId },
  }, {
    vehicleId: "veh-1",
    performed_at_date: "2026-01-01",
    performed_at_miles: 1000,
    roundedTotal: 100,
    subtotal: 100,
    discount: 0,
    currency: "JMD",
    templateId: null,
    logMode: "quick_job",
    packageComplete: false,
    service_type: "Quick job",
    provider: null,
    notes: null,
    invoice_url: null,
    apiLines: [],
    recordIdHint: foreignRecordId,
  });
  await steps.upsertServiceRecord();
  assertEquals(updates.length, 0);
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].id !== foreignRecordId, true);
});

Deno.test("upsertServiceRecord: valid hint reuses record with payload id", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const sb = recordMockSupabase({
    byWo: null,
    byId: {
      id: hintId,
      organization_id: orgId,
      vehicle_id: "veh-1",
      work_order_id: null,
    },
    updates,
    inserts,
  });
  const steps = buildDefaultCompletionSteps(sb, {
    ...baseInput,
    orgId,
    body: { recordId: hintId },
  }, {
    vehicleId: "veh-1",
    performed_at_date: "2026-01-01",
    performed_at_miles: 1000,
    roundedTotal: 100,
    subtotal: 100,
    discount: 0,
    currency: "JMD",
    templateId: null,
    logMode: "quick_job",
    packageComplete: false,
    service_type: "Quick job",
    provider: null,
    notes: null,
    invoice_url: null,
    apiLines: [],
    recordIdHint: hintId,
  });
  const row = await steps.upsertServiceRecord();
  assertEquals(inserts.length, 0);
  assertEquals(updates.length, 1);
  const payload = updates[0].payload_json as Record<string, unknown>;
  assertEquals(payload.id, hintId);
  assertEquals(String(row.id), hintId);
});

const financeOrgId = "d3333333-3333-4333-8333-333333333333";
const financeWorkOrderId = "b3333333-3333-4333-8333-333333333331";

Deno.test("real finance append: ledger_post_entry failure releases claim, skips finish", async () => {
  if (!Deno.env.get("SUPABASE_URL")) {
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  }
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  }

  const releaseLog: string[] = [];
  let finishRpcCalls = 0;
  const { client, wo } = createDefaultStepsIntegrationSupabase({
    orgId: financeOrgId,
    workOrderId: financeWorkOrderId,
    onFinishCompletion: () => {
      finishRpcCalls++;
    },
  });

  const patchedClient = {
    ...client,
    rpc: (name: string, _args?: unknown) => {
      if (name === "fleet_release_completion") {
        releaseLog.push(name);
        return Promise.resolve({ data: null, error: null });
      }
      return (client as { rpc: (n: string) => Promise<unknown> }).rpc(name);
    },
  };

  ledgerCanonicalTestHooks.getCanonicalEventByIdemKeyOverride = async () => null;
  unifiedLedgerDualWriteTestHooks.postEntryOverride = async () => (
    { ok: false, error: "ledger blocked for test" }
  );

  const financeContext = {
    get: (key: string) => {
      if (key === "rbacUser") {
        return {
          organizationId: financeOrgId,
          userId: actorId,
          resolvedRole: "fleet_owner",
        };
      }
      return undefined;
    },
  } as Context;

  try {
    const input = {
      orgId: financeOrgId,
      workOrderId: financeWorkOrderId,
      actorId,
      wo,
      lineRows: [] as Record<string, unknown>[],
      body: {},
      c: financeContext,
      enrichLines: enrichLinesLikeApi,
      mapCompletedItem: (w: Record<string, unknown>, lines: Record<string, unknown>[]) => ({ ...w, lines }),
    };

    const r = await runCompletion(
      patchedClient as never,
      input,
      { projectFromMaintenanceLog: async () => {} },
      { assessOdometer: async () => null },
    );

    assertEquals(r.status, 500);
    assertEquals(r.body.code, "completion_failed");
    assertEquals(r.body.step, "appendCanonicalMaintenance");
    assertEquals(releaseLog.length, 1);
    assertEquals(finishRpcCalls, 0);
  } finally {
    ledgerCanonicalTestHooks.getCanonicalEventByIdemKeyOverride = undefined;
    unifiedLedgerDualWriteTestHooks.postEntryOverride = undefined;
  }
});

Deno.test("after failure a second run can finish", async () => {
  let ledgerAttempts = 0;
  const steps = stubSteps();
  steps.recordCompletedServiceLines = async () => {
    ledgerAttempts++;
    if (ledgerAttempts === 1) throw new Error("fail ledger once");
  };
  const sb = mockSupabase({ claimed: true }, []);
  const r1 = await runCompletion(sb, baseInput, steps);
  assertEquals(r1.status, 500);
  const r2 = await runCompletion(sb, baseInput, steps, {
    assessOdometer: async () => null,
  });
  assertEquals(r2.status, 200);
  assertEquals(ledgerAttempts, 2);
});

Deno.test("S5 F7 commitPartsUsage safe to invoke twice (DB ON CONFLICT)", async () => {
  let rpcCalls = 0;
  const sb = {
    rpc: (name: string) => {
      if (name === "apply_parts_usage_for_work_order") rpcCalls++;
      return Promise.resolve({ data: { ok: true, warrantyPrompts: [], stockWarnings: [] }, error: null });
    },
  };
  await commitPartsUsage(sb as never, workOrderId);
  await commitPartsUsage(sb as never, workOrderId);
  assertEquals(rpcCalls, 2);
});

Deno.test("S5 F7 real default steps: parts usage and ledger safe on second run", async () => {
  let ledgerWrites = 0;
  const { client, rpcCalls, lineRow, wo } = createDefaultStepsIntegrationSupabase();
  const input = {
    ...baseInput,
    orgId,
    wo,
    lineRows: [lineRow as Record<string, unknown>],
    body: {},
    enrichLines: enrichLinesLikeApi,
    mapCompletedItem: (w: Record<string, unknown>, lines: Record<string, unknown>[]) => ({ ...w, lines }),
  };
  const ctx = {
    vehicleId: integrationVehicleId,
    performed_at_date: "2026-01-01",
    performed_at_miles: 1000,
    roundedTotal: 450,
    subtotal: 500,
    discount: 50,
    currency: "JMD",
    templateId: null,
    logMode: "quick_job",
    packageComplete: false,
    service_type: "Quick job",
    provider: null,
    notes: null,
    invoice_url: null,
    apiLines: [],
    recordIdHint: null,
  };
  const steps = buildDefaultCompletionSteps(client, input, ctx);
  const patched = client as {
    from: (table: string) => unknown;
  };
  const origFrom = patched.from.bind(client);
  patched.from = (table: string) => {
    if (table === "maintenance_service_ledger") {
      return {
        insert: (row: Record<string, unknown>) => {
          ledgerWrites++;
          if (ledgerWrites > 1) {
            return Promise.resolve({ error: { code: "23505", message: "duplicate" } });
          }
          return Promise.resolve({ error: null, data: row });
        },
      };
    }
    return origFrom(table);
  };

  await steps.commitPartsUsage();
  await steps.commitPartsUsage();
  assertEquals(rpcCalls.filter((n) => n === "apply_parts_usage_for_work_order").length, 2);

  await steps.upsertServiceRecord();
  const ledgerBefore = ledgerWrites;
  await steps.recordCompletedServiceLines();
  await steps.recordCompletedServiceLines();
  assertEquals(ledgerWrites, ledgerBefore + 2);

  steps.maybeAdvancePackageSchedule = async () => {};
  await steps.maybeAdvancePackageSchedule();
  await steps.maybeAdvancePackageSchedule();
});
