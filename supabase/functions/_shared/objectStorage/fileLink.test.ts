/**
 * Signed long-lived links to private R2 files (docs/cloudflare-r2-storage-migration-audit.md, M3 evidence).
 * deno test --allow-env supabase/functions/_shared/objectStorage/
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { FILE_LINK_SECONDS, keyFromFileLink, signFileLink, verifyFileLink } from "./fileLink.ts";

const SECRET = "test-file-link-secret";
const BASE = "https://example.supabase.co/";
const KEY = "evidence/org_1/fuel_receipt/2f6b1c1e-0000-4000-8000-000000000001.jpg";
const NOW = 1_800_000_000;

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

Deno.test("fileLink: signed link points at the file-link function and opens", async () => {
  const url = await signFileLink({ key: KEY, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW });
  assert(url.startsWith("https://example.supabase.co/functions/v1/file-link?"));
  assertEquals(params(url).get("e"), String(NOW + FILE_LINK_SECONDS));
  assertEquals(await verifyFileLink(params(url), SECRET, NOW + 10), { ok: true, key: KEY });
});

Deno.test("fileLink: expired link is refused", async () => {
  const url = await signFileLink({ key: KEY, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW, seconds: 60 });
  assertEquals(await verifyFileLink(params(url), SECRET, NOW + 61), { ok: false, reason: "expired" });
});

Deno.test("fileLink: changing the key, expiry or secret breaks the signature", async () => {
  const url = await signFileLink({ key: KEY, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW });
  const otherKey = params(url);
  otherKey.set("k", "evidence/org_2/fuel_receipt/2f6b1c1e-0000-4000-8000-000000000001.jpg");
  assertEquals(await verifyFileLink(otherKey, SECRET, NOW), { ok: false, reason: "bad_signature" });

  const longer = params(url);
  longer.set("e", String(NOW + FILE_LINK_SECONDS * 10));
  assertEquals(await verifyFileLink(longer, SECRET, NOW), { ok: false, reason: "bad_signature" });

  assertEquals(await verifyFileLink(params(url), "another-secret", NOW), { ok: false, reason: "bad_signature" });
});

Deno.test("fileLink: bad requests are refused before any signature work", async () => {
  const url = await signFileLink({ key: KEY, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW });
  const publicBucket = params(url);
  publicBucket.set("b", "public");
  assertEquals((await verifyFileLink(publicBucket, SECRET, NOW)).ok, false);

  const escape = params(url);
  escape.set("k", "evidence/../merchant-kyc/x.pdf");
  assertEquals(await verifyFileLink(escape, SECRET, NOW), { ok: false, reason: "bad_request" });

  assertEquals(await verifyFileLink(new URLSearchParams(), SECRET, NOW), { ok: false, reason: "bad_request" });
  assertEquals(await verifyFileLink(params(url), "", NOW), { ok: false, reason: "bad_request" });
});

Deno.test("fileLink: signing needs a secret, a base address and a safe key", async () => {
  await assertRejects(() => signFileLink({ key: KEY, secret: "", supabaseUrl: BASE }));
  await assertRejects(() => signFileLink({ key: KEY, secret: SECRET, supabaseUrl: "" }));
  await assertRejects(() => signFileLink({ key: "../x", secret: SECRET, supabaseUrl: BASE }));
});

Deno.test("fileLink: keyFromFileLink reads the key back, ignores other addresses", async () => {
  const url = await signFileLink({ key: KEY, secret: SECRET, supabaseUrl: BASE, nowSeconds: NOW });
  assertEquals(keyFromFileLink(url), KEY);
  assertEquals(
    keyFromFileLink("https://example.supabase.co/storage/v1/object/sign/ephemeral-evidence/a/b.jpg?token=x"),
    null,
  );
  assertEquals(keyFromFileLink(""), null);
});
