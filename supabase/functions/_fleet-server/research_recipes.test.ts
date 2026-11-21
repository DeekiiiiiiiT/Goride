import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  containsToken,
  extractElements,
  fillTemplate,
  findEvidenceBlock,
  htmlToBlocks,
  type LookupRecipe,
  pickResultLink,
  runRecipe,
} from "./research_recipes.ts";
import type { ReaderDeps } from "./research_page_reader.ts";

const CATALOGUE_PAGE = `
<html><head><title>Pads</title><script>var x = "04465-B1190 M900A";</script></head><body>
<table class="fitment">
  <tr><th>Car</th><th>Frame</th><th>Position</th><th>Number</th></tr>
  <tr><td>Toyota Roomy</td><td>M900A</td><td>Front</td><td>PN-1190 &nbsp;(OE 04465-B1190)</td></tr>
  <tr><td>Daihatsu Move</td><td>LA150S</td><td>Front</td><td>PN-2201</td></tr>
</table>
<ul class="related"><li>Related parts: 04465-B9999 and others</li></ul>
</body></html>`;

Deno.test("RE-03: number + car + position in one row passes", () => {
  const blocks = htmlToBlocks(CATALOGUE_PAGE);
  const hit = findEvidenceBlock(blocks, { number: "04465B1190", identity: ["M900A"], position: ["front"] });
  assert(hit);
  assert(hit!.block.includes("Toyota Roomy"));
  assert(!hit!.block.includes("LA150S"), "must be the row, not the whole table");
});

Deno.test("RE-03: a number only in a related-parts list fails", () => {
  const blocks = htmlToBlocks(CATALOGUE_PAGE);
  assertEquals(findEvidenceBlock(blocks, { number: "04465-B9999", identity: ["M900A"] }), null);
});

Deno.test("RE-03: the car on a different row does not count", () => {
  const blocks = htmlToBlocks(CATALOGUE_PAGE);
  assertEquals(findEvidenceBlock(blocks, { number: "PN-2201", identity: ["M900A"] }), null);
});

Deno.test("RE-03: the wrong position fails", () => {
  const blocks = htmlToBlocks(CATALOGUE_PAGE);
  assertEquals(findEvidenceBlock(blocks, { number: "04465-B1190", identity: ["M900A"], position: ["rear"] }), null);
});

Deno.test("RE-03: a one-line synthetic page with no row fails", () => {
  const blocks = htmlToBlocks("<p>04465-B1190 M900A rear</p>");
  assertEquals(findEvidenceBlock(blocks, { number: "04465-B1190", identity: ["M900A"] }), null);
});

Deno.test("RE-03: script text is never evidence", () => {
  const blocks = htmlToBlocks(`<script>"<tr><td>04465-B1190 M900A</td></tr>"</script>`);
  assertEquals(blocks.length, 0);
});

Deno.test("spec lookup: value pattern from the car's own row", () => {
  const html = `<table><tr><td>Roomy M900A</td><td>Battery</td><td>M-42 (EFB)</td></tr>
    <tr><td>Tank M910A</td><td>Battery</td><td>N-55</td></tr></table>`;
  const hit = findEvidenceBlock(htmlToBlocks(html), { identity: ["M900A"], valuePattern: /\b[A-Z]-\d{2}[A-Z]?\b/ });
  assertEquals(hit?.value, "M-42");
});

Deno.test("a part check without a number never passes", () => {
  assertEquals(findEvidenceBlock(["Toyota Roomy M900A front"], { identity: ["M900A"] }), null);
});

Deno.test("nested elements: innermost row wins; card classes are read", () => {
  const html = `<div class="product-card"><h3>Pad set</h3><p>Fits Roomy M900A</p><span>NB-1234</span></div>
    <div class="banner">NB-1234 M900A</div>`;
  const blocks = htmlToBlocks(html, { tags: ["tr"], classContains: ["product-card"] });
  assertEquals(blocks.length, 1);
  assert(findEvidenceBlock(blocks, { number: "NB1234", identity: ["Roomy"] }));
  assertEquals(extractElements("<tr><td><table><tr><td>a</td></tr></table></td></tr>", "tr").length, 2);
});

Deno.test("templates and result links", () => {
  assertEquals(fillTemplate("https://x.jp/s?q={number}&car={chassis}", { number: "04465 B1190", chassis: "M900A" }),
    "https://x.jp/s?q=04465%20B1190&car=M900A");
  assertEquals(fillTemplate("https://x.jp/s?q={number}", {}), null);
  const results = `<a href="/cars/toyota/roomy-m900a">Roomy</a><a href="http://x.jp/m900a-insecure">x</a>`;
  assertEquals(pickResultLink(results, "https://x.jp/search", "m900a", {}), "https://x.jp/cars/toyota/roomy-m900a");
});

function readerFor(pages: Record<string, string>): ReaderDeps {
  return {
    fetchImpl: ((url: string | URL | Request) => {
      const body = pages[String(url)];
      return Promise.resolve(body == null ? new Response("nf", { status: 404 }) : new Response(body, { status: 200 }));
    }) as typeof fetch,
    resolveIps: () => Promise.resolve(["203.0.113.10"]),
    now: () => new Date("2026-11-21T00:00:00Z"),
    getSite: (domain) => Promise.resolve(domain === "jnbk-brakes.com" ? { domain, automated_read: "allowed", backoff_until: null } : null),
    lastStatusFor: () => Promise.resolve(null),
    saveRead: () => Promise.resolve("read-x"),
    markBlocked: () => Promise.resolve(),
    setBackoff: () => Promise.resolve(),
  };
}

Deno.test("runRecipe: search, follow the matching result, find the row", async () => {
  const recipe: LookupRecipe = {
    id: "r1",
    domain: "jnbk-brakes.com",
    kind: "search_then_page",
    search_url_template: "https://www.jnbk-brakes.com/search?car={model}",
    result_link_rule: "{chassis}",
    block_rule: null,
  };
  const pages = {
    "https://www.jnbk-brakes.com/search?car=Roomy": `<a href="/catalogue/m900a">Roomy M900A</a>`,
    "https://www.jnbk-brakes.com/catalogue/m900a": CATALOGUE_PAGE,
  };
  const out = await runRecipe(recipe, { model: "Roomy", chassis: "m900a" },
    { number: "04465-B1190", identity: ["M900A"], position: ["front"] },
    { purpose: "job", readerDeps: readerFor(pages) });
  assertEquals(out.kind, "found");
  if (out.kind === "found") assertEquals(out.pageRead.finalUrl, "https://www.jnbk-brakes.com/catalogue/m900a");
});

Deno.test("runRecipe: a browser-check recipe only builds the link and fetches nothing", async () => {
  let fetched = 0;
  const deps = readerFor({});
  deps.fetchImpl = (() => {
    fetched++;
    return Promise.resolve(new Response(""));
  }) as typeof fetch;
  const out = await runRecipe({
    id: "r2",
    domain: "amayama.com",
    kind: "browser_check_link",
    search_url_template: "https://www.amayama.com/en/search?q={number}",
    result_link_rule: null,
    block_rule: null,
  }, { number: "04465-B1190" }, { number: "04465-B1190", identity: ["M900A"] }, { purpose: "job", readerDeps: deps });
  assertEquals(out, { kind: "browser_check", url: "https://www.amayama.com/en/search?q=04465-B1190" });
  assertEquals(fetched, 0);
});

Deno.test("runRecipe: a blocked site is reported unreadable, not found", async () => {
  const out = await runRecipe({
    id: "r3",
    domain: "amayama.com",
    kind: "by_part_number",
    search_url_template: "https://amayama.com/x?q={number}",
    result_link_rule: null,
    block_rule: null,
  }, { number: "1" }, { number: "1", identity: ["M900A"] }, { purpose: "job", readerDeps: readerFor({}) });
  assertEquals(out.kind, "unreadable");
});

Deno.test("review #3: a car token must stand on its own — NCP10 is not NCP100, Fit is not FITS", () => {
  assertEquals(containsToken("04465-52180 NCP100 Vitz 2005-", "NCP10"), false);
  assertEquals(containsToken("Fits all models", "Fit"), false);
  assertEquals(containsToken("Roomy DBA-M900A-BGBGE rear", "M900A"), true);
  assertEquals(containsToken("Roomy M900 A rear", "M900A"), false);
  assertEquals(containsToken("Honda Fit GK3", "Fit"), true);
  assertEquals(
    findEvidenceBlock(["04465-52180 NCP100 Vitz 2005- front"], { number: "04465-52180", identity: ["NCP10"], position: ["front"] }),
    null,
  );
});
