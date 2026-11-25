/**
 * §6 check: "The evidence purge job deletes the R2 object as well as the row."
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assertEquals } from "jsr:@std/assert@1";
import { R2_PRIVATE_BUCKET_ID, runEvidenceCleanup } from "./evidence_storage.ts";

function fakeSupabase(rows: Record<string, unknown>[]) {
  const updates: Record<string, unknown>[] = [];
  const select = {
    select: () => select,
    eq: () => select,
    lte: () => select,
    is: () => select,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    updates,
    from: (table: string) => {
      if (table !== "evidence_files") throw new Error(`unexpected table ${table}`);
      return {
        ...select,
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return { in: () => ({ is: () => Promise.resolve({ error: null }) }) };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const kv = {
  getByPrefix: () => Promise.resolve([]),
  get: () => Promise.resolve(null),
  set: () => Promise.resolve(),
};

Deno.test("evidence purge: the R2 object is deleted and the row is marked deleted", async () => {
  Deno.env.set("EVIDENCE_TTL_ENABLED", "true");
  try {
    const key = "evidence/org-a/fuel_receipt/2f6b1c1e-0000-4000-8000-000000000001.jpg";
    const supabase = fakeSupabase([{
      id: "e1",
      bucket_id: R2_PRIVATE_BUCKET_ID,
      storage_path: key,
      public_url: null,
      org_id: "org-a",
    }]);
    const r2Calls: Array<{ keys: string[]; bucket?: string }> = [];

    const result = await runEvidenceCleanup(supabase, kv, {
      r2Remove: (keys, bucket) => {
        r2Calls.push({ keys, bucket });
        return Promise.resolve();
      },
    });

    assertEquals(result.purged, 1);
    assertEquals(r2Calls, [{ keys: [key], bucket: "private" }]);
    assertEquals(supabase.updates[0]?.status, "deleted");
    assertEquals(supabase.updates[0]?.deleted_at != null, true);
  } finally {
    Deno.env.delete("EVIDENCE_TTL_ENABLED");
  }
});

Deno.test("evidence purge: a failed R2 delete is reported, the row is still marked deleted", async () => {
  Deno.env.set("EVIDENCE_TTL_ENABLED", "true");
  try {
    const supabase = fakeSupabase([{
      id: "e2",
      bucket_id: R2_PRIVATE_BUCKET_ID,
      storage_path: "evidence/org-a/fuel_receipt/x.jpg",
      public_url: null,
      org_id: "org-a",
    }]);
    const result = await runEvidenceCleanup(supabase, kv, {
      r2Remove: () => Promise.reject(new Error("R2 DELETE 500")),
    });
    assertEquals(result.purged, 0);
    assertEquals(result.errors, ["R2 DELETE 500"]);
    assertEquals(supabase.updates[0]?.status, "deleted");
  } finally {
    Deno.env.delete("EVIDENCE_TTL_ENABLED");
  }
});
