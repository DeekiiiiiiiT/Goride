/**
 * deno test --no-check --allow-env --allow-read supabase/functions/_fleet-server/parts_sourcing_drain.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { runPartsSourcingDrain } from "./parts_sourcing_drain.ts";
import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";

const orgId = "a1111111-1111-4111-8111-111111111111";
const vehicleId = "v1111111-1111-4111-8111-111111111111";
const vcat = "c1111111-1111-4111-8111-111111111111";
const lineItemId = "i1111111-1111-4111-8111-111111111111";
const lineId = "l1111111-1111-4111-8111-111111111111";
const woId = "w1111111-1111-4111-8111-111111111111";
const outboxId = "o1111111-1111-4111-8111-111111111111";
const componentId = "j1111111-1111-4111-8111-111111111111";

function drainClient(rows: Record<string, unknown>[], handlers: {
  onSend?: (args: Record<string, unknown>) => Record<string, unknown>;
  onRetry?: (args: Record<string, unknown>) => void;
  noCar?: boolean;
  item?: Record<string, unknown>;
  job?: Record<string, unknown>;
  missingLine?: boolean;
  onUpdate?: (table: string, patch: Record<string, unknown>) => void;
}) {
  const rpcLog: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    rpcLog,
    client: {
      rpc: (name: string, args?: Record<string, unknown>) => {
        rpcLog.push({ name, args: args ?? {} });
        if (name === "parts_sourcing_outbox_claim") {
          return Promise.resolve({ data: rows, error: null });
        }
        if (name === "parts_sourcing_outbox_retry") {
          handlers.onRetry?.(args ?? {});
          return Promise.resolve({ data: {}, error: null });
        }
        if (name === "parts_sourcing_outbox_send") {
          return Promise.resolve({ data: handlers.onSend?.(args ?? {}) ?? { result: "sent" }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from: (table: string) => {
        // One row per id, as the database would answer (the drain now loads a whole batch with .in()).
        const rowFor = (id: string): Record<string, unknown> | null => {
          if (table === "maintenance_work_order_line_item") {
            return handlers.item ?? {
              id,
              work_order_line_id: lineId,
              work_order_id: woId,
              item_kind: "other",
              item_name: "Front oxygen sensor",
              part_number: "89467-TEST1",
            };
          }
          if (table === "maintenance_work_order_lines") {
            return handlers.missingLine ? null : { id, component_id: componentId, positions: ["before_cat"] };
          }
          if (table === "maintenance_work_orders") {
            return { id, organization_id: orgId, vehicle_id: vehicleId, updated_by: null };
          }
          if (table === "maintenance_service_categories") {
            return { id, ...(handlers.job ?? { is_part: true, position_scheme: "before_after_catalyst" }) };
          }
          if (table === "vehicle_catalog") return { id: vcat, platform_id: "p1" };
          return null;
        };
        const chain = {
          select: () => chain,
          in: (_col: string, ids: string[]) =>
            Promise.resolve({ data: ids.map(rowFor).filter((r): r is Record<string, unknown> => r != null), error: null }),
          eq: (col: string, val: string) => {
            if (col === "id") {
              return { maybeSingle: () => Promise.resolve({ data: rowFor(val), error: null }) };
            }
            return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
          },
          update: (patch: Record<string, unknown>) => {
            handlers.onUpdate?.(table, patch);
            const upd = { eq: () => upd, in: () => upd, then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) };
            return upd;
          },
        };
        return chain;
      },
    },
  };
}

Deno.test("drain car not linked: send gets a blank catalogue car, so the database checks a deleted service first", async () => {
  let sendRow: Record<string, unknown> | null = null;
  const { client, rpcLog } = drainClient(
    [{ id: outboxId, line_item_id: lineItemId }],
    {
      onSend: (args) => {
        sendRow = args.p_row as Record<string, unknown>;
        return { result: "car_not_linked", state: "pending", reason: "car_not_linked" };
      },
    },
  );
  const summary = await runPartsSourcingDrain(client as never, {
    limit: 5,
    catalogIdForVehicle: async () => null,
  });
  assertEquals(summary.carNotLinked, 1);
  assertEquals(summary.sent, 0);
  assertEquals((sendRow as Record<string, unknown> | null)?.vehicle_catalog_id ?? null, null);
  // The drain itself never books car_not_linked; send does, after its cancel / not-finished checks.
  assertEquals(rpcLog.some((c) => c.name === "parts_sourcing_outbox_retry"), false);
});

Deno.test("drain car not linked on a deleted service → cancelled, not 'car not linked'", async () => {
  const { client } = drainClient(
    [{ id: outboxId, line_item_id: lineItemId }],
    { onSend: () => ({ result: "cancelled" }) },
  );
  const summary = await runPartsSourcingDrain(client as never, { catalogIdForVehicle: async () => null });
  assertEquals(summary.cancelled, 1);
  assertEquals(summary.carNotLinked, 0);
});

Deno.test("drain other item send row shape", async () => {
  let sendRow: Record<string, unknown> | null = null;
  const { client, rpcLog } = drainClient(
    [{ id: outboxId, line_item_id: lineItemId }],
    {
      onSend: (args) => {
        sendRow = (args.p_row ?? {}) as Record<string, unknown>;
        return { result: "sent" };
      },
    },
  );
  const summary = await runPartsSourcingDrain(client as never, {
    limit: 5,
    catalogIdForVehicle: async () => vcat,
  });
  assertEquals(summary.sent, 1);
  assertEquals(sendRow?.need_text, "Front oxygen sensor");
  assertEquals(sendRow?.old_part_number, "89467-TEST1");
  assertEquals(sendRow?.position_scheme, "before_after_catalyst");
  assertEquals((sendRow?.position_codes as string[])?.[0], "before_cat");
  assertEquals(sendRow?.item_name, "Front oxygen sensor");
  assertEquals(rpcLog.filter((c) => c.name === "parts_sourcing_outbox_send").length, 1);
});

Deno.test("drain typed part uses part_type_id as component", async () => {
  const partTypeId = "p2222222-2222-4222-8222-222222222222";
  let sendRow: Record<string, unknown> | null = null;
  const { client } = drainClient(
    [{ id: outboxId, line_item_id: lineItemId }],
    {
      item: {
        id: lineItemId,
        work_order_line_id: lineId,
        work_order_id: woId,
        item_kind: "part_type",
        item_name: "Filter",
        part_type_id: partTypeId,
        part_number: null,
      },
      onSend: (args) => {
        sendRow = (args.p_row ?? {}) as Record<string, unknown>;
        return { result: "sent" };
      },
    },
  );
  await runPartsSourcingDrain(client as never, {
    limit: 5,
    catalogIdForVehicle: async () => vcat,
  });
  assertEquals(sendRow?.maintenance_component_id, partTypeId);
});

Deno.test("two drains with disjoint claims each send once", async () => {
  const sendIds: string[] = [];
  const mk = (obId: string) => drainClient([{ id: obId, line_item_id: lineItemId }], {
    onSend: () => {
      sendIds.push(obId);
      return { result: "sent" };
    },
  });
  const catalog = async () => vcat;
  await runPartsSourcingDrain(mk("o1").client as never, { catalogIdForVehicle: catalog });
  await runPartsSourcingDrain(mk("o2").client as never, { catalogIdForVehicle: catalog });
  assertEquals(sendIds.sort(), ["o1", "o2"]);
});

Deno.test("parts sourcing drain secret rejects fleet cron secret", () => {
  const fleet = "fleet-cron-secret-value";
  const drain = "parts-drain-secret-value";
  assertEquals(timingSafeEqual(fleet, drain), false);
  assertEquals(timingSafeEqual(drain, drain), true);
});
Deno.test("code review #7: an item with no name is titled by its part number, never blank", async () => {
  let sendRow: Record<string, unknown> | null = null;
  const { client } = drainClient(
    [{ id: outboxId, line_item_id: lineItemId }],
    {
      item: { id: lineItemId, work_order_line_id: lineId, work_order_id: woId, item_kind: "other", item_name: "", part_number: "89467-TEST1" },
      onSend: (args) => {
        sendRow = (args.p_row ?? {}) as Record<string, unknown>;
        return { result: "sent" };
      },
    },
  );
  await runPartsSourcingDrain(client as never, { catalogIdForVehicle: async () => vcat });
  const row = sendRow as Record<string, unknown> | null;
  assertEquals(row?.item_name, "89467-TEST1");
  assertEquals(row?.need_text, "89467-TEST1");
});

Deno.test("code review #6: out of time → the rows not reached are handed back at once", async () => {
  const second = "o2222222-2222-4222-8222-222222222222";
  const third = "o3333333-3333-4333-8333-333333333333";
  const { client } = drainClient(
    [{ id: outboxId, line_item_id: lineItemId }, { id: second, line_item_id: lineItemId }, { id: third, line_item_id: lineItemId }],
    { onSend: () => ({ result: "sent" }) },
  );
  const released: string[][] = [];
  const baseFrom = client.from;
  (client as Record<string, unknown>).from = (table: string) => {
    if (table !== "parts_sourcing_outbox") return baseFrom(table);
    return {
      update: (_patch: Record<string, unknown>) => ({
        in: (_col: string, ids: string[]) => ({
          eq: () => {
            released.push(ids);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
  };
  // The clock passes the 45 s limit after the first row.
  let t = 0;
  const summary = await runPartsSourcingDrain(client as never, {
    catalogIdForVehicle: async () => vcat,
    now: () => new Date(t++ < 3 ? 0 : 60_000),
  });
  assertEquals(summary.sent, 1);
  assertEquals(summary.released, 2);
  assertEquals(released, [[second, third]]);
});

Deno.test("drain counts not_sent and unknown send results, so claimed always adds up (code review #6)", async () => {
  for (const [result, key] of [["not_sent", "notSent"], ["something_new", "other"]] as const) {
    const { client } = drainClient([{ id: outboxId, line_item_id: lineItemId }], { onSend: () => ({ result }) });
    const summary = await runPartsSourcingDrain(client as never, { catalogIdForVehicle: async () => "cat-1" });
    assertEquals(summary.claimed, 1);
    assertEquals(summary[key], 1);
    assertEquals(summary.sent + summary.errors, 0);
  }
});

Deno.test("code review #5: the job line is gone → the row is cancelled, never retried into not_sent/error", async () => {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const { client, rpcLog } = drainClient([{ id: outboxId, line_item_id: lineItemId }], {
    missingLine: true,
    onUpdate: (table, patch) => updates.push({ table, patch }),
  });
  const summary = await runPartsSourcingDrain(client as never, { limit: 5, catalogIdForVehicle: async () => vcat });
  assertEquals(summary.cancelled, 1);
  assertEquals(summary.errors, 0);
  assertEquals(rpcLog.some((c) => c.name === "parts_sourcing_outbox_retry"), false);
  assertEquals(rpcLog.some((c) => c.name === "parts_sourcing_outbox_send"), false);
  assertEquals(updates[0]?.table, "parts_sourcing_outbox");
  assertEquals(updates[0]?.patch.state, "cancelled");
});

Deno.test("code review #9: a batch of rows loads its items, lines, services and jobs in 4 reads", async () => {
  const reads: string[] = [];
  const { client } = drainClient(
    Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, line_item_id: `i${i}` })),
    {},
  );
  const counted = {
    ...client,
    from: (table: string) => {
      const c = client.from(table) as Record<string, unknown>;
      const origIn = c.in as (col: string, ids: string[]) => unknown;
      return { ...c, select: () => ({ ...c, in: (col: string, ids: string[]) => { reads.push(table); return origIn(col, ids); } }) };
    },
  };
  const summary = await runPartsSourcingDrain(counted as never, { limit: 25, catalogIdForVehicle: async () => vcat });
  assertEquals(summary.sent, 10);
  assertEquals(reads.length, 4);
});
