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
        const chain = {
          select: () => chain,
          eq: (col: string, val: string) => {
            if (table === "maintenance_work_order_line_item" && col === "id") {
              return {
                maybeSingle: () => Promise.resolve({
                  data: handlers.item ?? {
                    id: val,
                    work_order_line_id: lineId,
                    work_order_id: woId,
                    item_kind: "other",
                    item_name: "Front oxygen sensor",
                    part_number: "89467-TEST1",
                  },
                  error: null,
                }),
              };
            }
            if (table === "maintenance_work_order_lines" && col === "id") {
              return {
                maybeSingle: () => Promise.resolve({
                  data: {
                    id: val,
                    component_id: componentId,
                    positions: ["before_cat"],
                  },
                  error: null,
                }),
              };
            }
            if (table === "maintenance_work_orders" && col === "id") {
              return {
                maybeSingle: () => Promise.resolve({
                  data: {
                    id: val,
                    organization_id: orgId,
                    vehicle_id: vehicleId,
                    updated_by: null,
                  },
                  error: null,
                }),
              };
            }
            if (table === "maintenance_service_categories" && col === "id") {
              return {
                maybeSingle: () => Promise.resolve({
                  data: handlers.job ?? { is_part: true, position_scheme: "before_after_catalyst" },
                  error: null,
                }),
              };
            }
            if (table === "vehicle_catalog" && col === "id") {
              return {
                maybeSingle: () => Promise.resolve({
                  data: { id: vcat, platform_id: "p1" },
                  error: null,
                }),
              };
            }
            return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
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
