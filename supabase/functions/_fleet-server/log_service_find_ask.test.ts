/**
 * deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_fleet-server/log_service_find_ask.test.ts
 *
 * The "has Roam been asked?" read must build the very key a real ask (POST /parts/request, add_part_info) stores,
 * for wheel jobs too, or the panel never turns to "Roam is looking" and the button keeps showing.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findPartsAskGroupKeyRow } from "./log_service_find_ask.ts";
import { researchGroupKeyFromRow } from "./catalog_research_intake.ts";
import { buildPartsSourcingInsert } from "./parts_sourcing_request_build.ts";

function client() {
  const rpcArgs: Record<string, unknown>[] = [];
  return {
    rpcArgs,
    supabase: {
      rpc: (_name: string, args: Record<string, unknown>) => {
        rpcArgs.push(args);
        return Promise.resolve({ data: "v2|key", error: null });
      },
      from(table: string) {
        if (table !== "vehicle_catalog") throw new Error(table);
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: () => Promise.resolve({ data: { id: "vcat-1", platform_id: "plat-1" }, error: null }),
        };
      },
    },
  };
}

async function realAskRow(supabase: unknown, scheme: string, codes: string[]) {
  // What POST /parts/request builds for an add_part_info ask from the panel: no fit in the body, no part number.
  return await buildPartsSourcingInsert(supabase as never, {
    orgId: "org-1",
    vehicleId: "veh-1",
    needText: "Oxygen sensor",
    componentId: "11111111-1111-4111-8111-111111111111",
    engineFamilyId: null,
    vehicleCatalogId: "vcat-1",
    matchType: null,
    fit: {},
    kind: "add_part_info",
    urgency: null,
    qty: null,
    userId: null,
    photoUrl: null,
    sentAt: null,
    replyDueAt: null,
    oldPartNumber: null,
    positionScheme: scheme,
    positionCodes: codes,
  });
}

for (const [label, scheme, codes] of [
  ["oxygen sensor rear", "before_after_catalyst", ["after_cat"]],
  ["brake pads front left + right", "four_corners", ["LF", "RF"]],
] as const) {
  Deno.test(`ask read key = real ask key (${label})`, async () => {
    const { supabase, rpcArgs } = client();
    const posted = await realAskRow(supabase, scheme, [...codes]);
    await researchGroupKeyFromRow(supabase as never, posted as Record<string, unknown>);
    await researchGroupKeyFromRow(
      supabase as never,
      findPartsAskGroupKeyRow({
        vehicleCatalogId: "vcat-1",
        maintenanceComponentId: "11111111-1111-4111-8111-111111111111",
        positionScheme: scheme,
        positionCodes: [...codes],
      }),
    );
    assertEquals(rpcArgs.length, 2);
    assertEquals(rpcArgs[1], rpcArgs[0]);
  });
}
