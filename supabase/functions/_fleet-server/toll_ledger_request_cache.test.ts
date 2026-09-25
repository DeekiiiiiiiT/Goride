import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AsyncLocalStorage } from "node:async_hooks";

// Inline mirror of cachedTollLedgerLoad behaviour for a pure unit without Hono.
Deno.test("TR-M1: request ledger cache collapses duplicate (from,to) loads", async () => {
  type Bundle = { tollTx: any[]; trips: any[] };
  type State = { loads: number; cache: Map<string, Promise<Bundle>> };
  const store = new AsyncLocalStorage<State>();

  async function cached(
    from: string | undefined,
    to: string | undefined,
    loader: () => Promise<Bundle>,
  ): Promise<Bundle> {
    const state = store.getStore();
    if (!state) return loader();
    const key = `${from ?? ""}|${to ?? ""}`;
    const hit = state.cache.get(key);
    if (hit) return hit;
    state.loads += 1;
    const pending = loader();
    state.cache.set(key, pending);
    return pending;
  }

  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { tollTx: [{ id: "1" }], trips: [] };
  };

  await store.run({ loads: 0, cache: new Map() }, async () => {
    await Promise.all([
      cached("2026-09-07", "2026-09-13", loader),
      cached("2026-09-07", "2026-09-13", loader),
      cached("2026-09-07", "2026-09-13", loader),
    ]);
    const state = store.getStore()!;
    assertEquals(calls, 1);
    assertEquals(state.loads, 1);
  });
});
