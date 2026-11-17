/**
 * R2 client request shapes + content checks.
 * deno test --allow-env supabase/functions/_shared/objectStorage/
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { assertSafeKey, R2Client, r2ConfigFromEnv } from "./r2Client.ts";
import { sha256Hex } from "./sigv4.ts";
import { contentMatches, isSafeSvg } from "./contentCheck.ts";
import { UPLOAD_PURPOSES } from "./purposes.ts";

const cfg = { accountId: "acct123", accessKeyId: "AK", secretAccessKey: "SK", publicBaseUrl: "https://media.roamfleet.co" };

function recordingFetch(status = 200, headers: Record<string, string> = {}) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = ((url: string, init: RequestInit) => {
    seen.push({ url, init });
    return Promise.resolve(new Response(status === 204 ? null : "", { status, headers }));
  }) as unknown as typeof fetch;
  return { f, seen };
}

Deno.test("config needs the three secrets; public base is optional and trimmed", () => {
  assertThrows(() => r2ConfigFromEnv(() => undefined));
  const c = r2ConfigFromEnv((n) => ({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_PUBLIC_BASE_URL: "https://m.x/" } as Record<string, string>)[n]);
  assertEquals(c.publicBaseUrl, "https://m.x");
});

Deno.test("presigned upload signs content-type and points at the private bucket", async () => {
  const r2 = new R2Client(cfg);
  const url = new URL(await r2.presignUpload("private", "pending/abc", "image/jpeg", 300));
  assertEquals(url.host, "acct123.r2.cloudflarestorage.com");
  assertEquals(url.pathname, "/roam-private/pending/abc");
  assertEquals(url.searchParams.get("X-Amz-Expires"), "300");
  assertEquals(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
  assert(url.searchParams.get("X-Amz-Credential")!.includes("/auto/s3/aws4_request"));
});

Deno.test("presigned download is 10 minutes by default and can set a file name", async () => {
  const r2 = new R2Client(cfg);
  const url = new URL(await r2.presignDownload("private", "evidence/o/x.pdf", undefined, 'receipt "1".pdf'));
  assertEquals(url.searchParams.get("X-Amz-Expires"), "600");
  assertEquals(url.searchParams.get("response-content-disposition"), 'inline; filename="receipt _1_.pdf"');
});

Deno.test("public URL uses the media address", () => {
  assertEquals(new R2Client(cfg).publicUrl("catalogue/images/a.webp"), "https://media.roamfleet.co/catalogue/images/a.webp");
  assertThrows(() => new R2Client({ ...cfg, publicBaseUrl: null }).publicUrl("a.webp"));
});

Deno.test("unsafe keys are refused", () => {
  for (const k of ["", "../x", "a/../b", "/a", "a//b", "a/", "a b", "a?b", "%2e%2e/x"]) {
    assertThrows(() => assertSafeKey(k), Error, undefined, k);
  }
  assertSafeKey("evidence/11111111-1111-4111-8111-111111111111/x.jpg");
});

Deno.test("HEAD returns size + type, 404 → null", async () => {
  const ok = recordingFetch(200, { "content-length": "1234", "content-type": "image/jpeg" });
  assertEquals(await new R2Client(cfg, ok.f).head("public", "a.jpg"), { size: 1234, contentType: "image/jpeg" });
  assert(String((ok.seen[0].init.headers as Record<string, string>).authorization).startsWith("AWS4-HMAC-SHA256 "));
  assertEquals(await new R2Client(cfg, recordingFetch(404).f).head("public", "a.jpg"), null);
});

Deno.test("copy sends copy-source, REPLACE metadata, type and cache header", async () => {
  const rec = recordingFetch(200);
  await new R2Client(cfg, rec.f).copy(
    { bucket: "private", key: "pending/abc" },
    { bucket: "public", key: "catalogue/images/x.webp" },
    { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
  );
  const h = rec.seen[0].init.headers as Record<string, string>;
  assertEquals(rec.seen[0].url, "https://acct123.r2.cloudflarestorage.com/roam-public/catalogue/images/x.webp");
  assertEquals(h["x-amz-copy-source"], "/roam-private/pending/abc");
  assertEquals(h["x-amz-metadata-directive"], "REPLACE");
  assertEquals(h["cache-control"], "public, max-age=31536000, immutable");
  assert(h.authorization.includes("x-amz-copy-source"));
});

Deno.test("content check: magic bytes, text, xlsx, svg", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert(contentMatches("image/jpeg", jpeg));
  assert(!contentMatches("image/png", jpeg));
  assert(contentMatches("text/csv", new TextEncoder().encode("make,model\nSuzuki,Swift\n")));
  assert(!contentMatches("text/csv", new Uint8Array([0x61, 0x00, 0x62])));
  assert(contentMatches("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Uint8Array([0x50, 0x4b, 3, 4, 0])));
  const svg = (s: string) => new TextEncoder().encode(s);
  assert(isSafeSvg(svg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')));
  assert(isSafeSvg(svg('<?xml version="1.0"?><svg><rect/></svg>')));
  assert(!isSafeSvg(svg("<svg><script>alert(1)</script></svg>")));
  assert(!isSafeSvg(svg('<svg onload="x()"></svg>')));
  assert(!isSafeSvg(svg('<svg><a href="javascript:x()"/></svg>')));
  assert(!isSafeSvg(svg("<html></html>")));
});

Deno.test("put signs payload hash, type, cache-control", async () => {
  const body = new TextEncoder().encode("png-bytes");
  const hash = await sha256Hex(body);
  const rec = recordingFetch(200);
  await new R2Client(cfg, rec.f).put(
    "public",
    "catalogue/images/x.png",
    body,
    "image/png",
    "public, max-age=31536000, immutable",
  );
  const h = rec.seen[0].init.headers as Record<string, string>;
  assertEquals(h["content-type"], "image/png");
  assertEquals(h["cache-control"], "public, max-age=31536000, immutable");
  assertEquals(h["x-amz-content-sha256"], hash);
  assert(h.authorization.includes("content-type"));
  assert(h.authorization.includes("cache-control"));
  assert(h.authorization.includes("x-amz-content-sha256"));
});

Deno.test("R2_BUCKET_PUBLIC overrides object URL path", () => {
  const prev = Deno.env.get("R2_BUCKET_PUBLIC");
  try {
    Deno.env.set("R2_BUCKET_PUBLIC", "roam-scratch");
    const url = new R2Client(cfg).objectUrl("public", "a.png");
    assertEquals(url, "https://acct123.r2.cloudflarestorage.com/roam-scratch/a.png");
  } finally {
    if (prev === undefined) Deno.env.delete("R2_BUCKET_PUBLIC");
    else Deno.env.set("R2_BUCKET_PUBLIC", prev);
  }
});

Deno.test("every purpose has a unique folder and sane limits", () => {
  const folders = Object.values(UPLOAD_PURPOSES).map((p) => p.folder);
  assertEquals(new Set(folders).size, folders.length);
  for (const [name, p] of Object.entries(UPLOAD_PURPOSES)) {
    assert(p.maxBytes > 0 && p.maxBytes <= 20 * 1024 * 1024, name);
    assert(!p.folder.startsWith("pending"), name);
  }
});
