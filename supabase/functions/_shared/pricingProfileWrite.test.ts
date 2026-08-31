/**
 * Finding T — insert-then-deactivate must never leave zero active profiles.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { insertThenActivateProfile } from "../delivery/admin/pricingConfigHelpers.ts";

type Row = Record<string, unknown>;

function makeMockDb(opts: {
  current: Row | null;
  insertFails?: boolean;
}) {
  const state = {
    rows: opts.current ? [opts.current] : [] as Row[],
    insertCalls: 0,
    deactivateCalls: 0,
  };

  const db = {
    from(_table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self();
      chain.neq = () => self();
      chain.order = () => self();
      chain.limit = () => self();
      chain.maybeSingle = async () => {
        const active = state.rows
          .filter((r) => r.is_active === true)
          .sort((a, b) => Number(b.version) - Number(a.version));
        return { data: active[0] ?? null, error: null };
      };
      chain.update = (patch: Row) => {
        state.deactivateCalls += 1;
        const updChain: Record<string, unknown> = {};
        const us = () => updChain;
        updChain.eq = (col: string, val: unknown) => {
          // track filters loosely
          void col;
          void val;
          return us();
        };
        updChain.neq = (col: string, val: unknown) => {
          // After insert: deactivate other actives
          if (col === "id") {
            for (const r of state.rows) {
              if (r.id !== val && r.is_active === true) {
                Object.assign(r, patch);
              }
            }
          }
          return us();
        };
        // Thenable so `await deactivate` works without .then on leaf
        updChain.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: null, error: null });
        return updChain;
      };
      chain.insert = (row: Row) => {
        state.insertCalls += 1;
        const insertChain: Record<string, unknown> = {};
        insertChain.select = () => insertChain;
        insertChain.single = async () => {
          if (opts.insertFails) {
            return { data: null, error: { message: "23505 duplicate version" } };
          }
          const created = { ...row, id: "new-id" };
          state.rows.push(created);
          return { data: created, error: null };
        };
        return insertChain;
      };
      return chain;
    },
  };

  return { db, state };
}

Deno.test("insertThenActivateProfile — insert failure leaves prior active (Finding T)", async () => {
  const { db, state } = makeMockDb({
    current: { id: "old", version: 8, is_active: true, rules: {} },
    insertFails: true,
  });
  const result = await insertThenActivateProfile({
    // deno-lint-ignore no-explicit-any
    db: db as any,
    table: "global_pricing_profiles",
    rules: { rush_pass: { max_free_delivery_km: 8 } },
    adminUser: { id: "admin", email: "a@b.c" } as never,
  });
  assertEquals(result.ok, false);
  assertEquals(state.rows.filter((r) => r.is_active === true).length, 1);
  assertEquals(state.rows[0].id, "old");
  assertEquals(state.deactivateCalls, 0);
});

Deno.test("insertThenActivateProfile — happy path deactivates prior after insert", async () => {
  const { db, state } = makeMockDb({
    current: { id: "old", version: 8, is_active: true, rules: {} },
  });
  const result = await insertThenActivateProfile({
    // deno-lint-ignore no-explicit-any
    db: db as any,
    table: "global_pricing_profiles",
    rules: { rush_pass: { max_free_delivery_km: 8 } },
    adminUser: { id: "admin", email: "a@b.c" } as never,
  });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, 9);
  assertEquals(state.insertCalls, 1);
  assertEquals(state.deactivateCalls, 1);
  const active = state.rows.filter((r) => r.is_active === true);
  assertEquals(active.length, 1);
  assertEquals(active[0].id, "new-id");
});
