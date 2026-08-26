/**
 * Shared plaza loader + Toll Brain empty-fallback tests (Phase 4 loader work).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyTollInfoRateOverlay,
  invalidateTollPlazaCache,
  loadTollPlazas,
  parseKvTollPlaza,
} from "./tollPlazaLoader.ts";
import {
  isInconclusiveBrainEstimateResult,
  isInconclusiveBrainPointResult,
} from "../rides/fare/tollBrainClient.ts";
import { recordBelongsToOrg } from "./orgRecordScope.ts";

function mockKvDb(opts: {
  plazas?: Array<{ key: string; value: unknown }>;
  schedule?: unknown | null;
}) {
  const plazaRows = opts.plazas ?? [];
  const schedule = opts.schedule === undefined ? null : opts.schedule;
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        like: (_col: string, _pat: string) => ({
          limit: async (_n: number) => ({ data: plazaRows, error: null }),
        }),
        eq: (_col: string, key: string) => ({
          maybeSingle: async () => {
            if (key === "toll:rate_schedule") {
              return {
                data: schedule != null ? { key, value: schedule } : null,
                error: null,
              };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
  } as unknown as import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;
}

Deno.test("empty brain point result is inconclusive (falls through to local)", () => {
  assertEquals(
    isInconclusiveBrainPointResult({ tollsCrossed: [], totalTollsMinor: 0 }),
    true,
  );
  assertEquals(
    isInconclusiveBrainPointResult({ tollsCrossed: undefined, totalTollsMinor: 0 }),
    true,
  );
});

Deno.test("brain point result with crossings is conclusive", () => {
  assertEquals(
    isInconclusiveBrainPointResult({
      tollsCrossed: [{ tollPlazaId: "p1" }],
      totalTollsMinor: 36000,
    }),
    false,
  );
});

Deno.test("brain detectionDisabled empty is conclusive (do not fall through)", () => {
  assertEquals(
    isInconclusiveBrainPointResult({
      tollsCrossed: [],
      totalTollsMinor: 0,
      detectionDisabled: true,
    }),
    false,
  );
});

Deno.test("empty brain estimate is inconclusive", () => {
  assertEquals(
    isInconclusiveBrainEstimateResult({ plazaIds: [], totalTollsMinor: 0 }),
    true,
  );
  assertEquals(
    isInconclusiveBrainEstimateResult({
      plazaIds: ["p1"],
      totalTollsMinor: 0,
    }),
    false,
  );
});

Deno.test("loader applies Toll Info rate overlay when plazaId links", () => {
  const plaza = parseKvTollPlaza("toll_plaza:angels", {
    name: "Angels Toll Plaza",
    location: { lat: 18.0, lng: -76.8 },
    geofenceRadius: 200,
    rates: [],
    status: "verified",
    operationalStatus: "active",
  });
  assertEquals(plaza?.defaultRateMinor, 0);
  assertEquals(plaza?.verificationStatus, "verified");

  const overlaid = applyTollInfoRateOverlay([plaza!], {
    current: {
      plazas: [
        {
          plazaId: "angels",
          plazaName: "Angels",
          rates: { class1: { withTag: 360, withoutTag: 420 } },
        },
      ],
    },
  });
  assertEquals(overlaid[0].defaultRateMinor, 36000);
  assertEquals(overlaid[0].rates[0].vehicleClass, "Class 1");
  assertEquals(overlaid[0].rates[0].amount, 360);
});

Deno.test("loadTollPlazas derives rates from Toll Info card for linked plazas", async () => {
  invalidateTollPlazaCache();
  const db = mockKvDb({
    plazas: [
      {
        key: "toll_plaza:portmore",
        value: {
          name: "Portmore",
          location: { lat: 17.95, lng: -76.87 },
          geofenceRadius: 200,
          rates: [],
          status: "verified",
          operationalStatus: "active",
          organizationId: "org-a",
        },
      },
    ],
    schedule: {
      current: {
        plazas: [
          {
            plazaId: "portmore",
            plazaName: "Portmore Toll",
            rates: { class1: { withTag: 250, withoutTag: 300 } },
          },
        ],
      },
    },
  });

  const plazas = await loadTollPlazas(db, { organizationId: "org-a" });
  assertEquals(plazas.length, 1);
  assertEquals(plazas[0].defaultRateMinor, 25000);
});

Deno.test("loadTollPlazas org-scopes foreign plazas out", async () => {
  invalidateTollPlazaCache();
  const db = mockKvDb({
    plazas: [
      {
        key: "toll_plaza:ours",
        value: {
          name: "Ours",
          location: { lat: 18.0, lng: -76.8 },
          geofenceRadius: 200,
          rates: [{ vehicleClass: "Class 1", amount: 100, currency: "JMD" }],
          status: "verified",
          operationalStatus: "active",
          organizationId: "org-a",
        },
      },
      {
        key: "toll_plaza:theirs",
        value: {
          name: "Theirs",
          location: { lat: 18.1, lng: -76.9 },
          geofenceRadius: 200,
          rates: [{ vehicleClass: "Class 1", amount: 100, currency: "JMD" }],
          status: "verified",
          operationalStatus: "active",
          organizationId: "org-b",
        },
      },
    ],
    schedule: null,
  });

  const plazas = await loadTollPlazas(db, { organizationId: "org-a" });
  assertEquals(plazas.map((p) => p.id), ["ours"]);
});

Deno.test("recordBelongsToOrg includes unscoped and legacy placeholder", () => {
  assertEquals(recordBelongsToOrg({ organizationId: "org-a" }, "org-a"), true);
  assertEquals(recordBelongsToOrg({ organizationId: "org-b" }, "org-a"), false);
  assertEquals(recordBelongsToOrg({}, "org-a"), true);
  assertEquals(
    recordBelongsToOrg({ organizationId: "roam-default-org" }, "org-a"),
    true,
  );
  assertEquals(recordBelongsToOrg({ organizationId: "org-b" }, null), true);
});
