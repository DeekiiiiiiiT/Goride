import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadStaffAlertPhones,
  normalizeAlertPhone,
  setStaffAlertPhone,
} from "./team_staff_service.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STAFF = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ADMIN = "dddddddd-dddd-dddd-dddd-dddddddddddd";

type PhoneRow = { organization_id: string; user_id: string; phone: string; set_by: string; set_at: string };

function fakeSupabase(state: {
  ownerId?: string;
  seats?: Set<string>;
  phones: PhoneRow[];
  authUpdates: number;
}): SupabaseClient {
  // deno-lint-ignore no-explicit-any
  const client: any = {
    from(table: string) {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { owner_id: state.ownerId }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected from ${table}`);
    },
    schema(name: string) {
      if (name === "platform") {
        return {
          from(table: string) {
            if (table === "staff_alert_phones") return client.schema("platform-alerts").from(table);
            if (table !== "user_roles") throw new Error(table);
            return {
              select: () => {
                let userId = "";
                const chain: Record<string, unknown> = {};
                const link = () => chain;
                chain.eq = (col: string, val: string) => {
                  if (col === "user_id") userId = val;
                  return link();
                };
                chain.then = (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
                  Promise.resolve({
                    data: state.seats?.has(userId)
                      ? [{ id: "seat-1", status: "active", roles: { name: "fleet_manager" } }]
                      : [],
                    error: null,
                  }).then(onFulfilled);
                return chain;
              },
            };
          },
        };
      }
      if (name === "platform-alerts") {
        return {
          from(table: string) {
            if (table !== "staff_alert_phones") throw new Error(table);
            const api = {
              select: (_cols: string) => ({
                eq: (_col: string, orgId: string) => ({
                  in: (_c: string, ids: string[]) =>
                    Promise.resolve({
                      data: state.phones.filter((p) => p.organization_id === orgId && ids.includes(p.user_id)),
                      error: null,
                    }),
                }),
              }),
              delete: () => ({
                eq: (_c: string, orgId: string) => ({
                  eq: (_c2: string, userId: string) => {
                    state.phones = state.phones.filter((p) => !(p.organization_id === orgId && p.user_id === userId));
                    return Promise.resolve({ error: null });
                  },
                }),
              }),
              upsert: (row: PhoneRow) => {
                state.phones = state.phones.filter((p) =>
                  !(p.organization_id === row.organization_id && p.user_id === row.user_id)
                );
                state.phones.push(row);
                return Promise.resolve({ error: null });
              },
            };
            return api;
          },
        };
      }
      throw new Error(`unexpected schema ${name}`);
    },
    auth: {
      admin: {
        updateUserById: () => {
          state.authUpdates += 1;
          return Promise.resolve({ error: null });
        },
      },
    },
  };
  return client as unknown as SupabaseClient;
}

Deno.test("WRA-31 alert phone: Jamaican numbers get +1 876, others need +country, empty clears", () => {
  assertEquals(normalizeAlertPhone("876 555 1234"), "+18765551234");
  assertEquals(normalizeAlertPhone("(876) 555-1234"), "+18765551234");
  assertEquals(normalizeAlertPhone("555-1234"), "+18765551234");
  assertEquals(normalizeAlertPhone("1-658-555-1234"), "+16585551234");
  assertEquals(normalizeAlertPhone("+44 7700 900123"), "+447700900123");
  assertEquals(normalizeAlertPhone(""), "");
  assertEquals(normalizeAlertPhone("12345"), null);
  assertEquals(normalizeAlertPhone("212 555 1234"), null);
});

Deno.test("S1: setStaffAlertPhone never calls updateUserById", async () => {
  const state = { ownerId: OWNER, seats: new Set([STAFF]), phones: [] as PhoneRow[], authUpdates: 0 };
  const sb = fakeSupabase(state);
  await setStaffAlertPhone(sb, {
    organizationId: ORG,
    actorId: ADMIN,
    targetId: STAFF,
    phone: "876 555 1234",
    audit: {},
  });
  assertEquals(state.authUpdates, 0);
  assertEquals(state.phones.length, 1);
  assertEquals(state.phones[0].phone, "+18765551234");
});

Deno.test("S1: admin cannot set owner alert phone", async () => {
  const state = { ownerId: OWNER, seats: new Set([STAFF]), phones: [] as PhoneRow[], authUpdates: 0 };
  const sb = fakeSupabase(state);
  try {
    await setStaffAlertPhone(sb, {
      organizationId: ORG,
      actorId: ADMIN,
      targetId: OWNER,
      phone: "876 555 1234",
      audit: {},
    });
    throw new Error("expected throw");
  } catch (e) {
    assertEquals((e as Error & { status?: number }).status, 403);
    assert((e as Error).message.includes("Only the owner"));
  }
});

Deno.test("S1: owner can set own alert phone", async () => {
  const state = { ownerId: OWNER, seats: new Set<string>(), phones: [] as PhoneRow[], authUpdates: 0 };
  const sb = fakeSupabase(state);
  const res = await setStaffAlertPhone(sb, {
    organizationId: ORG,
    actorId: OWNER,
    targetId: OWNER,
    phone: "876 555 9999",
    audit: {},
  });
  assertEquals(res.alertPhone, "+18765559999");
});

Deno.test("S1: loadStaffAlertPhones reads per-fleet table only", async () => {
  const state = {
    ownerId: OWNER,
    seats: new Set<string>(),
    phones: [{ organization_id: ORG, user_id: STAFF, phone: "+18765551234", set_by: ADMIN, set_at: new Date().toISOString() }],
    authUpdates: 0,
  };
  const sb = fakeSupabase(state);
  const map = await loadStaffAlertPhones(sb, ORG, [STAFF, OWNER]);
  assertEquals(map.get(STAFF), "+18765551234");
  assertEquals(map.get(OWNER), undefined);
});
