/**
 * Fleet parts lookup validation, including §3.6: a picture comes back only while it is ready (never a hidden,
 * queued or failed one), and only for the answer's own interchange group.
 * deno test --no-config --no-lock --no-check --allow-env supabase/functions/_fleet-server/fleet_parts_lookup.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attachFleetPartPictures, readFleetPartLookup, readFleetPartPicture } from "./fleet_parts_lookup.ts";

Deno.env.set("R2_PUBLIC_BASE_URL", "https://media.test");

const GROUP = "e200000e-0000-4000-8000-000000000009";

/** `picture` is the `part_picture` row the ready-only read finds (null = none). */
function mockSb(
  data: unknown,
  error: { message: string } | null = null,
  versions: unknown[] = [],
  picture: Record<string, unknown> | null = null,
) {
  return {
    rpc: () => Promise.resolve({ data, error }),
    from: (table: string) => ({
      select: () => ({
        in: () => Promise.resolve({ data: versions, error: null }),
        eq: () => ({
          eq: (column: string, value: unknown) => ({
            maybeSingle: () =>
              Promise.resolve({
                data: table === "part_picture" && column === "status" && value === "ready" ? picture : null,
                error: null,
              }),
          }),
        }),
      }),
    }),
  };
}

function lookupBody(patch: Record<string, unknown> = {}) {
  return {
    partId: "e200000f-0000-4000-8000-000000000002",
    brand: "FxBrand",
    number: "FX-1",
    name: "Pad",
    partType: "Brake pads",
    position: "front",
    status: "verified",
    groupId: GROUP,
    groupMembers: [{ partId: "e200000f-0000-4000-8000-000000000003", brand: "FxB", number: "FX-2", name: "Pad" }],
    fits: [],
    ...patch,
  };
}

Deno.test("lookup returns 400 for invalid part id", async () => {
  const out = await readFleetPartLookup(mockSb(null) as never, { partId: "not-a-uuid" });
  assertEquals(out.status, 400);
});

Deno.test("lookup maps fits with engine field", async () => {
  const partId = "e200000f-0000-4000-8000-000000000002";
  const out = await readFleetPartLookup(mockSb({
    partId,
    brand: "FxBrand",
    number: "FX-1",
    name: "Pad",
    partType: "Brake pads",
    position: "front",
    status: "verified",
    groupMembers: [{ partId: "e200000f-0000-4000-8000-000000000003", brand: "FxB", number: "FX-2", name: "Pad" }],
    fits: [{
      variantId: "e2000005-0000-4000-8000-000000000010",
      make: "FxToyota",
      model: "FxRoomy",
      chassis: "FX-M900A",
      engine: "FX-1KR",
      years: "2018–2022",
      linkType: "DIRECT",
      trust: "confirmed",
    }],
  }, null, [{ id: "e2000005-0000-4000-8000-000000000010", trim_series: "Pre-Facelift" }]) as never, { partId, vehicleCatalogId: "e2000005-0000-4000-8000-000000000010" });
  assertEquals(out.status, 200);
  if ("body" in out) {
    assertEquals(out.body!.alsoFits[0].engine, "FX-1KR");
    assertEquals(out.body!.alsoFits[0].isYourCar, true);
    assertEquals(out.body!.alsoFits[0].version, "Pre-Facelift");
  }
});

Deno.test("§3.6 a ready picture comes back for the answer's group, in card and detail sizes", async () => {
  const out = await readFleetPartLookup(
    mockSb(lookupBody(), null, [], { r2_key: "catalogue/parts/p1/v2.png", status: "ready" }) as never,
    { partId: "e200000f-0000-4000-8000-000000000002" },
  );
  assertEquals(out.status, 200);
  if (!("body" in out)) return;
  const picture = out.body!.picture as { url: { src: string }; urlDetail: { src: string } } | null;
  assertEquals(picture !== null, true);
  assertEquals(picture!.url.src.includes("width=480"), true, picture!.url.src);
  assertEquals(picture!.urlDetail.src.includes("width=1200"), true, picture!.urlDetail.src);
});

Deno.test("§3.6 no picture when it is hidden, queued, failed — or when the group has none", async () => {
  const rows: Array<Record<string, unknown> | null> = [
    { r2_key: "catalogue/parts/p1/v2.png", status: "hidden" },
    { r2_key: null, status: "queued" },
    { r2_key: "catalogue/parts/p1/v2.png", status: "failed" },
    null,
  ];
  for (const row of rows) {
    const out = await readFleetPartLookup(
      mockSb(lookupBody(), null, [], row) as never,
      { partId: "e200000f-0000-4000-8000-000000000002" },
    );
    assertEquals(out.status, 200);
    if (!("body" in out)) continue;
    assertEquals(out.body!.picture, null, JSON.stringify(row));
  }
});

Deno.test("§3.6 the read only ever asks for a ready picture of the group", async () => {
  const asked: Array<[string, string, unknown]> = [];
  const sb = {
    rpc: () => Promise.resolve({ data: lookupBody(), error: null }),
    from: (table: string) => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
        eq: (column: string, value: unknown) => ({
          eq: (column2: string, value2: unknown) => {
            asked.push([table, column, value], [table, column2, value2]);
            return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
          },
        }),
      }),
    }),
  };
  await readFleetPartLookup(sb as never, { partId: "e200000f-0000-4000-8000-000000000002" });
  assertEquals(asked, [
    ["part_picture", "interchange_group_id", GROUP],
    ["part_picture", "status", "ready"],
  ]);
  // The other compatible numbers in the answer get no picture of their own: only the group is asked for.
  assertEquals(asked.filter(([, column]) => column === "interchange_group_id").length, 1);
});

Deno.test("§3.6 a picture read that fails leaves the part answer alone", async () => {
  const sb = {
    rpc: () => Promise.resolve({ data: lookupBody(), error: null }),
    from: () => {
      throw new Error("part_picture read failed");
    },
  };
  const out = await readFleetPartLookup(sb as never, { partId: "e200000f-0000-4000-8000-000000000002" });
  assertEquals(out.status, 200);
  if ("body" in out) {
    assertEquals(out.body!.picture, null);
    assertEquals(out.body!.reference.number, "FX-1");
  }
  assertEquals(await readFleetPartPicture(sb as never, GROUP), null);
});

Deno.test("§3.6 a group id that is not a uuid is never asked for", async () => {
  assertEquals(await readFleetPartPicture({ from: () => { throw new Error("should not run"); } } as never, "group-1"), null);
  assertEquals(await readFleetPartPicture({ from: () => { throw new Error("should not run"); } } as never, null), null);
});

Deno.test("§3.6 multi-card answers: each card gets its own ready picture in one read; none for others", async () => {
  const G1 = "40000000-0000-4000-8000-000000000001";
  const G2 = "40000000-0000-4000-8000-000000000002";
  const calls: Array<[string, string, unknown]> = [];
  const fake = {
    from(table: string) {
      const q = {
        select: () => q,
        in: (column: string, value: unknown) => {
          calls.push([table, column, value]);
          return q;
        },
        eq: (column: string, value: unknown) => {
          calls.push([table, column, value]);
          return Promise.resolve({
            data: [
              { interchange_group_id: G1, r2_key: "catalogue/parts/00000000-0000-4000-8000-0000000000a1/v1.jpg", status: "ready" },
            ],
            error: null,
          });
        },
      };
      return q;
    },
  };
  const body = { sections: [{ items: [{ groupId: G1 }, { groupId: G2 }, { groupId: "not-a-uuid" }] }] };
  const out = await attachFleetPartPictures(fake as never, body);
  const items = out.sections[0].items as Array<{ picture?: { url: { src: string } } | null }>;
  assertEquals(items[0].picture !== null && items[0].picture !== undefined, true);
  assertEquals(items[1].picture, null);
  assertEquals(items[2].picture, null);
  assertEquals(calls.filter(([, c]) => c === "interchange_group_id").length, 1);
  assertEquals(calls.some(([, c, v]) => c === "status" && v === "ready"), true);
});
