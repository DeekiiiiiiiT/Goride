import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parkException } from "./exceptions.ts";

type Result = { data: unknown; error: { message: string } | null };

/** Minimal PostgREST double: every chain resolves to the configured result per table + op. */
function fakeSb(results: {
  existing?: Result;
  insert?: Result;
  update?: Result;
}) {
  const writes: string[] = [];
  const chain = (result: Result) => {
    const q: Record<string, unknown> = {
      eq: () => q,
      maybeSingle: () => Promise.resolve(result),
      then: (res: (r: Result) => unknown) => Promise.resolve(result).then(res),
    };
    return q;
  };
  const from = (table: string) => ({
    select: () =>
      table === "courier_profiles"
        ? chain({ data: null, error: null })
        : chain(results.existing ?? { data: null, error: null }),
    insert: () => {
      writes.push("insert");
      return chain(results.insert ?? { data: null, error: null });
    },
    update: () => {
      writes.push("update");
      return chain(results.update ?? { data: null, error: null });
    },
  });
  const sb = { schema: () => ({ from }), from };
  return { sb, writes };
}

const missingColumn = {
  data: null,
  error: { message: "column courier_fleet_id does not exist" },
};

Deno.test("parkException: insert succeeds", async () => {
  const { sb, writes } = fakeSb({});
  await parkException(sb, "o1", "c1", "rpc_error", new Error("boom"));
  assertEquals(writes, ["insert"]);
});

Deno.test("parkException: failed insert throws instead of dropping the row", async () => {
  const { sb } = fakeSb({ insert: missingColumn });
  await assertRejects(
    () => parkException(sb, "o1", "c1", "rpc_error", new Error("boom")),
    Error,
    "park_exception_insert_failed",
  );
});

Deno.test("parkException: failed update throws", async () => {
  const { sb, writes } = fakeSb({
    existing: { data: { id: "e1", attempts: 1 }, error: null },
    update: missingColumn,
  });
  await assertRejects(
    () => parkException(sb, "o1", "c1", "rpc_error", new Error("boom")),
    Error,
    "park_exception_update_failed",
  );
  assertEquals(writes, ["update"]);
});

Deno.test("parkException: failed lookup throws", async () => {
  const { sb } = fakeSb({ existing: missingColumn });
  await assertRejects(
    () => parkException(sb, "o1", null, "rpc_error", new Error("boom")),
    Error,
    "park_exception_read_failed",
  );
});
