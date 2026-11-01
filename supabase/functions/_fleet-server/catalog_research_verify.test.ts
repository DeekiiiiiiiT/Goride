/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_verify.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  domainFromUrl,
  fetchCatalogSourcePage,
  isGoogleGroundingRedirectUrl,
  isTrustedDomain,
  verifySourcePage,
} from "./catalog_research_verify.ts";

const chassisHtml = `
<html><body>
Toyota Roomy 2017 chassis M900A engine 1KR-FE part 04465-B1234 front axle
</body></html>`;

Deno.test("B5: number and chassis pass", () => {
  const r = verifySourcePage({
    html: chassisHtml,
    partNumber: "04465-B1234",
    chassisCode: "M900A",
    model: "Roomy",
    engineCode: "1KR-FE",
    needsAxle: true,
    axle: "front",
  });
  assertEquals(r.passed, true);
});

Deno.test("B5: number only fails car check", () => {
  const r = verifySourcePage({
    html: "<html>04465-B1234 generic listing</html>",
    partNumber: "04465-B1234",
    chassisCode: "M900A",
    model: "Roomy",
    engineCode: "1KR-FE",
  });
  assertEquals(r.numberFound, true);
  assertEquals(r.carFound, false);
  assertEquals(r.passed, false);
});

Deno.test("R21: grounding redirect URL is detected", () => {
  assertEquals(
    isGoogleGroundingRedirectUrl("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc"),
    true,
  );
  assertEquals(isGoogleGroundingRedirectUrl("https://partsouq.com/x"), false);
});

Deno.test("R21: redirect lands on partsouq and trusted check uses final domain", async () => {
  const grounding = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/test";
  const finalUrl = "https://partsouq.com/en/part/123";
  const res = await fetchCatalogSourcePage(grounding, ((() => {
    const r = new Response("<html>partsouq</html>", { status: 200 });
    Object.defineProperty(r, "url", { value: finalUrl });
    return Promise.resolve(r);
  }) as typeof fetch));
  assertEquals(res.redirectUrl, grounding);
  assertEquals(res.finalUrl, finalUrl);
  assertEquals(res.httpStatus, 200);
  assertEquals(res.byteCount, "<html>partsouq</html>".length);
  assertEquals(res.redirectFailed, false);
  assertEquals(isTrustedDomain(domainFromUrl(res.finalUrl), new Set(["partsouq.com"])), true);
});

Deno.test("R25: failed grounding redirect is redirect_failed not untrusted", async () => {
  const grounding = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x";
  const res = await fetchCatalogSourcePage(grounding, (() => Promise.reject(new Error("network"))) as typeof fetch);
  assertEquals(res.redirectFailed, true);
  assertEquals(res.httpStatus, 0);
  assertEquals(res.byteCount, 0);
});

Deno.test("R25: HTTP 403 still records status and zero bytes", async () => {
  const res = await fetchCatalogSourcePage("https://partsouq.com/x", ((() => {
    const r = new Response("blocked", { status: 403 });
    Object.defineProperty(r, "url", { value: "https://partsouq.com/x" });
    return Promise.resolve(r);
  }) as typeof fetch));
  assertEquals(res.httpStatus, 403);
  assertEquals(res.byteCount, 0);
  assertEquals(res.html, "");
});

Deno.test("R21: redirect to untrusted domain is identifiable", async () => {
  const grounding = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x";
  const finalUrl = "https://random-blog.example/part";
  const res = await fetchCatalogSourcePage(grounding, ((() => {
    const r = new Response("", { status: 200 });
    Object.defineProperty(r, "url", { value: finalUrl });
    return Promise.resolve(r);
  }) as typeof fetch));
  assertEquals(domainFromUrl(res.finalUrl), "random-blog.example");
  assertEquals(isTrustedDomain(domainFromUrl(res.finalUrl), new Set(["partsouq.com"])), false);
  assertEquals(res.redirectFailed, false);
});
