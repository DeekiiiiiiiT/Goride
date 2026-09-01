/**
 * Workforce link contract tests.
 * Run: deno test --no-check workforce_link.test.ts (from this directory)
 */
/// <reference lib="deno.ns" />
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { linkDriverToFleet, type WorkforceLinkDeps } from "./workforce_link.ts";

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
