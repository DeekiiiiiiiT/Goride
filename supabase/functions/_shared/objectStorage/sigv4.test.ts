/**
 * SigV4 against the published AWS S3 examples (sigv4-query-string-auth / sigv4-header-based-auth).
 * deno test --allow-env supabase/functions/_shared/objectStorage/sigv4.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { presignUrl, signRequest, uriEncode } from "./sigv4.ts";

const creds = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE", // gitleaks:allow (AWS docs example key)
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
};
const now = new Date("2013-05-24T00:00:00Z");

Deno.test("presigned GET matches the AWS documented signature", async () => {
  const url = await presignUrl({
    creds,
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    expiresSeconds: 86400,
    now,
  });
  const sig = new URL(url).searchParams.get("X-Amz-Signature");
  assertEquals(sig, "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
});

Deno.test("header-signed ranged GET matches the AWS documented signature", async () => {
  const headers = await signRequest({
    creds,
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    headers: { range: "bytes=0-9" },
    now,
  });
  assertEquals(
    headers.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41", // gitleaks:allow (AWS docs example signature)
  );
});

Deno.test("uriEncode keeps unreserved chars and slashes when asked", () => {
  assertEquals(uriEncode("a b/c~d", false), "a%20b/c~d");
  assertEquals(uriEncode("a b/c", true), "a%20b%2Fc");
});
