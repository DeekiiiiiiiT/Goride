import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { postRushJournal, type JournalRpc } from "./postJournal.ts";

Deno.test("a failed journal is recorded and a delivery client is not used", async () => {
  const calls: string[] = [];
  const parked: string[] = [];
  const delivery: JournalRpc = {
    rpc: (fn) => {
      calls.push(`delivery:${fn}`);
      return Promise.resolve({ error: null });
    },
    schema: () => ({ from: () => ({ upsert: () => Promise.resolve({ error: null }) }) }),
  };
  const books: JournalRpc = {
    rpc: (fn) => {
      calls.push(`public:${fn}`);
      return Promise.resolve({ error: { message: "function not found" } });
    },
    schema: () => ({
      from: () => ({
        upsert: (row) => {
          parked.push(String(row.reference));
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  void delivery;
  const result = await postRushJournal(books, { p_idempotency_key: "cancel-courier:o1" });
  assertEquals(result.ok, false);
  assertEquals(calls, ["public:rush_post_journal"]);
  assertEquals(parked, ["cancel-courier:o1"]);
});
