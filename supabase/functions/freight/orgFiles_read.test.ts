/**
 * M6: freight document reads never fall back to the deleted enterprise-freight-docs bucket.
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assertEquals } from "jsr:@std/assert@1";
import { orgFileIsOnR2, signedOrgFileUrl } from "./orgFiles.ts";

Deno.test("freight reads: a row in the deleted old bucket is 'File not available', no Supabase call", async () => {
  let signed = 0;
  const oldRow = {
    bucket_id: "enterprise-freight-docs",
    storage_path: "org-1/invoice/2f6b1c1e-0000-4000-8000-000000000001.pdf",
  };
  assertEquals(orgFileIsOnR2(oldRow as never), false);
  const result = await signedOrgFileUrl(oldRow as never, 3600, async () => {
    signed += 1;
    return "https://r2.example/x";
  });
  assertEquals(result, { error: "File not available" });
  assertEquals(signed, 0);

  // A row with no bucket id is old too: it must not be signed.
  assertEquals(
    await signedOrgFileUrl({ storage_path: "org-1/pod/x.jpg" } as never, 3600, async () => "https://r2.example/x"),
    { error: "File not available" },
  );
});

Deno.test("freight reads: a roam-private row still gets a short-lived R2 link", async () => {
  const file = { bucket_id: "r2:private", storage_path: "freight-docs/org-1/invoice/x.pdf" };
  assertEquals(orgFileIsOnR2(file as never), true);
  const result = await signedOrgFileUrl(
    file as never,
    3600,
    async (key, seconds) => `https://r2.example/${key}?s=${seconds}`,
  );
  assertEquals(result, { url: "https://r2.example/freight-docs/org-1/invoice/x.pdf?s=3600" });
});
