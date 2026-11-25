/**
 * Evidence uploads on Cloudflare R2 (docs/cloudflare-r2-storage-migration-audit.md, M3 evidence slice).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { signFileLink } from "../_shared/objectStorage/fileLink.ts";
import {
  buildR2UploadKey,
  collectStoragePathsFromRecord,
  isR2EvidenceEnabled,
  parseStoragePathFromUrl,
  R2_PRIVATE_BUCKET_ID,
  removeStoredFiles,
} from "./evidence_storage.ts";

const KEY = "evidence/org-1/fuel_receipt/2f6b1c1e-0000-4000-8000-000000000001.jpg";

Deno.test("R2 evidence: switch needs all R2 keys + FILE_LINK_SECRET + SUPABASE_URL", () => {
  const full: Record<string, string> = {
    R2_ACCOUNT_ID: "a",
    R2_ACCESS_KEY_ID: "b",
    R2_SECRET_ACCESS_KEY: "c",
    FILE_LINK_SECRET: "d",
    SUPABASE_URL: "https://x.supabase.co",
  };
  assert(isR2EvidenceEnabled((n) => full[n]));
  for (const missing of Object.keys(full)) {
    assertEquals(isR2EvidenceEnabled((n) => (n === missing ? "" : full[n])), false, missing);
  }
});

Deno.test("R2 evidence: upload keys are scoped by org and type", () => {
  const ev = buildR2UploadKey("org-1", "fuel_receipt", "jpg");
  assert(/^evidence\/org-1\/fuel_receipt\/[0-9a-f-]{36}\.jpg$/.test(ev), ev);
  const doc = buildR2UploadKey("org-1", null, ".pdf");
  assert(/^fleet-docs\/org-1\/driver-docs\/[0-9a-f-]{36}\.pdf$/.test(doc), doc);
  assert(buildR2UploadKey("", null, "png").startsWith("fleet-docs/no-org/driver-docs/"));
  assert(buildR2UploadKey("../evil/", "toll_receipt", "png").startsWith("evidence/evil_/toll_receipt/"));
});

Deno.test("R2 evidence: file-link addresses parse to the R2 bucket; old Supabase ones still parse", async () => {
  const url = await signFileLink({ key: KEY, secret: "s", supabaseUrl: "https://x.supabase.co" });
  assertEquals(parseStoragePathFromUrl(url), { bucket: R2_PRIVATE_BUCKET_ID, path: KEY });
  assertEquals(
    parseStoragePathFromUrl("https://x.supabase.co/storage/v1/object/sign/ephemeral-evidence/o/fuel_receipt/a.jpg?token=t"),
    { bucket: "ephemeral-evidence", path: "o/fuel_receipt/a.jpg" },
  );
  assertEquals(collectStoragePathsFromRecord({ receiptUrl: url }), [{ bucket: R2_PRIVATE_BUCKET_ID, path: KEY }]);
});

Deno.test("R2 evidence: removeStoredFiles sends R2 keys to R2 and the rest to Supabase", async () => {
  const r2Calls: string[][] = [];
  const sbCalls: { bucket: string; paths: string[] }[] = [];
  const fakeSupabase = {
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          sbCalls.push({ bucket, paths });
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
  const r2 = (keys: string[]) => {
    r2Calls.push(keys);
    return Promise.resolve();
  };

  const many = Array.from({ length: 120 }, (_, i) => `evidence/o/fuel_receipt/${i}.jpg`);
  const a = await removeStoredFiles(fakeSupabase, R2_PRIVATE_BUCKET_ID, many, r2);
  assertEquals(a, { removed: 120, errors: [] });
  assertEquals(r2Calls.map((c) => c.length), [50, 50, 20]);
  assertEquals(sbCalls.length, 0);

  const b = await removeStoredFiles(fakeSupabase, "ephemeral-evidence", ["o/x.jpg"], r2);
  assertEquals(b, { removed: 1, errors: [] });
  assertEquals(sbCalls, [{ bucket: "ephemeral-evidence", paths: ["o/x.jpg"] }]);
});

Deno.test("R2 evidence: a failed R2 delete is reported, not thrown", async () => {
  const res = await removeStoredFiles({}, R2_PRIVATE_BUCKET_ID, [KEY], () => Promise.reject(new Error("R2 DELETE 500")));
  assertEquals(res, { removed: 0, errors: ["R2 DELETE 500"] });
});
