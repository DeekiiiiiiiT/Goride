/**
 * Workforce link contract tests.
 * Run: deno test --no-check workforce_link.test.ts (from this directory)
 */
/// <reference lib="deno.ns" />
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  healOrgCourierRoster,
  linkCourierToFleet,
  linkDriverToFleet,
  mergeRushIntoServiceLines,
  type WorkforceCourierLinkDeps,
  type WorkforceLinkDeps,
} from "./workforce_link.ts";

const USER_ID = "user-1";
const FLEET_A = "fleet-a-uuid";
const FLEET_B = "fleet-b-uuid";

function makeDeps(overrides: Partial<{
  orgExists: boolean;
  currentFleetId: string | null;
  kvRecord: Record<string, unknown> | null;
}>): WorkforceLinkDeps & { kvWrites: unknown[]; profileWrites: unknown[] } {
  const kvWrites: unknown[] = [];
  const profileWrites: unknown[] = [];
  const userId = USER_ID;

  const currentFleetId = overrides.currentFleetId ?? null;
  const kvRecord = overrides.kvRecord ?? null;

  const supabase = {
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: (_k: string, id: string) => ({
              maybeSingle: async () => ({
                data: overrides.orgExists === false ? null : { id },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "driver_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: currentFleetId ? { fleet_id: currentFleetId, onboarding_complete: false } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
    auth: {
      admin: {
        getUserById: async (uid: string) => ({
          data: {
            user: {
              id: uid,
              email: "driver@test.com",
              user_metadata: currentFleetId ? { organizationId: currentFleetId, name: "Test" } : { name: "Test" },
            },
          },
          error: null,
        }),
        updateUserById: async () => ({ data: {}, error: null }),
      },
    },
  };

  const kv = {
    get: async (key: string) => {
      if (key === `driver:${userId}`) return kvRecord;
      return null;
    },
    set: async (_key: string, value: unknown) => {
      kvWrites.push(value);
    },
  };

  return {
    supabase: supabase as WorkforceLinkDeps["supabase"],
    kv: kv as WorkforceLinkDeps["kv"],
    upsertDriverProfile: async (opts) => {
      profileWrites.push(opts);
    },
    invalidateDriverCache: () => {},
    kvWrites,
    profileWrites,
  };
}

Deno.test("linkDriverToFleet creates KV roster when absent", async () => {
  const deps = makeDeps({ orgExists: true, currentFleetId: null, kvRecord: null });
  const result = await linkDriverToFleet(deps, USER_ID, FLEET_A);
  assertEquals(result.success, true);
  assertEquals(deps.kvWrites.length, 1);
  const kvRow = deps.kvWrites[0] as Record<string, unknown>;
  assertEquals(kvRow.organizationId, FLEET_A);
  assertEquals(deps.profileWrites.length, 1);
});

Deno.test("linkDriverToFleet refuses different fleet", async () => {
  const deps = makeDeps({ orgExists: true, currentFleetId: FLEET_B });
  await assertRejects(
    () => linkDriverToFleet(deps, USER_ID, FLEET_A),
    Error,
    "already linked",
  );
});

Deno.test("linkDriverToFleet returns alreadyMember when same fleet", async () => {
  const deps = makeDeps({ orgExists: true, currentFleetId: FLEET_A });
  const result = await linkDriverToFleet(deps, USER_ID, FLEET_A);
  assertEquals(result.alreadyMember, true);
  assertEquals(deps.kvWrites.length, 0);
});

Deno.test("mergeRushIntoServiceLines adds rush and preserves rideshare", () => {
  assertEquals(mergeRushIntoServiceLines(undefined), ["rush_delivery"]);
  assertEquals(mergeRushIntoServiceLines(["rideshare"]), ["rideshare", "rush_delivery"]);
  assertEquals(
    mergeRushIntoServiceLines(undefined, { treatMissingAsRideshare: true }),
    ["rideshare", "rush_delivery"],
  );
});

function makeCourierDeps(overrides: Partial<{
  orgExists: boolean;
  courier: Record<string, unknown> | null;
  kvRecord: Record<string, unknown> | null;
  metaOrg: string | null;
  /** When set, user is also a rideshare fleet driver for this fleet. */
  driverFleetId: string | null;
}>): WorkforceCourierLinkDeps & { kvWrites: unknown[]; courierUpdates: unknown[] } {
  const kvWrites: unknown[] = [];
  const courierUpdates: unknown[] = [];
  const courier = overrides.courier === undefined
    ? {
      user_id: USER_ID,
      mode: "independent",
      fleet_id: null,
      display_name: "Pat",
      email: "c@test.com",
      phone: "1",
      status: "active",
      total_deliveries: 3,
    }
    : overrides.courier;
  const kvRecord = overrides.kvRecord ?? null;
  const metaOrg = overrides.metaOrg ?? null;
  const driverFleetId = overrides.driverFleetId ?? null;

  const courierTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: courier, error: null }),
      }),
    }),
    update: (row: unknown) => {
      courierUpdates.push(row);
      return {
        eq: () => ({ error: null }),
      };
    },
  };

  const supabase = {
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: (_k: string, id: string) => ({
              maybeSingle: async () => ({
                data: overrides.orgExists === false ? null : { id },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "driver_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: driverFleetId
                  ? { mode: "fleet", fleet_id: driverFleetId }
                  : null,
                error: null,
              }),
            }),
            in: async () => ({
              data: driverFleetId
                ? [{ user_id: USER_ID, mode: "fleet", fleet_id: driverFleetId }]
                : [],
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
    schema: (name: string) => {
      if (name !== "delivery") throw new Error("unexpected schema");
      return {
        from: (table: string) => {
          if (table === "courier_profiles") return courierTable;
          throw new Error(table);
        },
      };
    },
    auth: {
      admin: {
        getUserById: async (uid: string) => ({
          data: {
            user: {
              id: uid,
              email: "c@test.com",
              phone: "",
              user_metadata: metaOrg ? { organizationId: metaOrg, name: "Pat" } : { name: "Pat" },
            },
          },
          error: null,
        }),
        updateUserById: async () => ({ data: {}, error: null }),
      },
    },
  };

  const kv = {
    get: async (key: string) => (key === `driver:${USER_ID}` ? kvRecord : null),
    set: async (_key: string, value: unknown) => {
      kvWrites.push(value);
    },
  };

  return {
    supabase: supabase as WorkforceCourierLinkDeps["supabase"],
    kv: kv as WorkforceCourierLinkDeps["kv"],
    invalidateDriverCache: () => {},
    kvWrites,
    courierUpdates,
  };
}

Deno.test("linkCourierToFleet creates rush_delivery roster row", async () => {
  const deps = makeCourierDeps({ orgExists: true });
  const result = await linkCourierToFleet(deps, USER_ID, FLEET_A);
  assertEquals(result.success, true);
  assertEquals(deps.courierUpdates.length, 1);
  assertEquals(deps.kvWrites.length, 1);
  const row = deps.kvWrites[0] as Record<string, unknown>;
  assertEquals(row.organizationId, FLEET_A);
  assertEquals(row.serviceLines, ["rush_delivery"]);
});

Deno.test("linkCourierToFleet merges rush onto existing rideshare roster", async () => {
  const deps = makeCourierDeps({
    orgExists: true,
    kvRecord: {
      id: USER_ID,
      organizationId: FLEET_A,
      serviceLines: ["rideshare"],
      driverName: "Pat",
    },
    courier: {
      user_id: USER_ID,
      mode: "independent",
      fleet_id: null,
      display_name: "Pat",
      email: "c@test.com",
      status: "active",
      total_deliveries: 0,
    },
    metaOrg: FLEET_A,
    driverFleetId: FLEET_A,
  });
  const result = await linkCourierToFleet(deps, USER_ID, FLEET_A);
  assertEquals(result.success, true);
  const row = deps.kvWrites[0] as Record<string, unknown>;
  assertEquals(row.serviceLines, ["rideshare", "rush_delivery"]);
});

Deno.test("linkCourierToFleet does not invent rideshare for courier-only blank lines", async () => {
  const deps = makeCourierDeps({
    orgExists: true,
    kvRecord: {
      id: USER_ID,
      organizationId: FLEET_A,
      driverName: "Pat",
      // missing serviceLines — must NOT become rideshare+rush
    },
    courier: {
      user_id: USER_ID,
      mode: "independent",
      fleet_id: null,
      display_name: "Pat",
      email: "c@test.com",
      status: "active",
      total_deliveries: 0,
    },
    metaOrg: FLEET_A,
  });
  const result = await linkCourierToFleet(deps, USER_ID, FLEET_A);
  assertEquals(result.success, true);
  const row = deps.kvWrites[0] as Record<string, unknown>;
  assertEquals(row.serviceLines, ["rush_delivery"]);
});

Deno.test("linkCourierToFleet refuses other fleet", async () => {
  const deps = makeCourierDeps({
    orgExists: true,
    courier: {
      user_id: USER_ID,
      mode: "fleet",
      fleet_id: FLEET_B,
      display_name: "Pat",
      email: "c@test.com",
      status: "active",
      total_deliveries: 0,
    },
  });
  const result = await linkCourierToFleet(deps, USER_ID, FLEET_A);
  assertEquals(result.success, false);
  if (!result.success) assertEquals(result.status, 409);
});

Deno.test("healOrgCourierRoster strips rideshare from courier-only dual lines", async () => {
  const badRow = {
    id: USER_ID,
    organizationId: FLEET_A,
    serviceLines: ["rideshare", "rush_delivery"],
    driverName: "Pat",
  };
  const deps = makeCourierDeps({
    orgExists: true,
    kvRecord: badRow,
    courier: {
      user_id: USER_ID,
      mode: "fleet",
      fleet_id: FLEET_A,
      display_name: "Pat",
      email: "c@test.com",
      status: "active",
      total_deliveries: 0,
    },
    metaOrg: FLEET_A,
  });
  // heal lists courier_profiles via schema().from().select().eq().eq() — extend mock
  const courierList = [{ user_id: USER_ID }];
  const schemaCourier = {
    select: () => {
      const filters: Array<() => unknown> = [];
      const chain = {
        eq: () => {
          filters.push(() => null);
          return {
            eq: async () => ({ data: courierList, error: null }),
            maybeSingle: async () => ({
              data: {
                user_id: USER_ID,
                mode: "fleet",
                fleet_id: FLEET_A,
                display_name: "Pat",
                email: "c@test.com",
                status: "active",
                total_deliveries: 0,
              },
              error: null,
            }),
          };
        },
      };
      return chain;
    },
    update: (row: unknown) => {
      deps.courierUpdates.push(row);
      return { eq: () => ({ error: null }) };
    },
  };
  (deps.supabase as { schema: (n: string) => unknown }).schema = (name: string) => {
    if (name !== "delivery") throw new Error("unexpected schema");
    return {
      from: (table: string) => {
        if (table === "courier_profiles") return schemaCourier;
        throw new Error(table);
      },
    };
  };

  const out = await healOrgCourierRoster(deps, FLEET_A, [badRow]);
  assertEquals(out.length, 1);
  assertEquals(out[0].serviceLines, ["rush_delivery"]);
  assertEquals((deps.kvWrites[0] as Record<string, unknown>).serviceLines, ["rush_delivery"]);
});
