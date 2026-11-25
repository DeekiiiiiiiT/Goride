// Rev 4.2 (docs/research-engine-audit.md §9): form recipes (RE-30) and the cross-reference proof (RE-31).
// Pages are made up but shaped like a part maker's product page: a cross-reference list plus an application table.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readSourcePage, type ReaderDeps } from "./research_page_reader.ts";
import { type BlockCheck, findCrossReferenceRow, findEvidenceOnPage, type LookupRecipe, runRecipe } from "./research_recipes.ts";

const SITE = "https://www.jnbk-brakes.com";
const SELF = `${SITE}/catalogue/cars/brake/700001/PN7001`;

function productPage(opts: { crossRef?: string; rows?: string } = {}): string {
  const crossRef = opts.crossRef ?? `<div class="str"><div class="owner">DAIHATSU</div><div class="field">04465-Z7001</div></div>`;
  const row = (frame: string, engine: string, front: string, rear: string) => `
    <tr>
      <td class="tdYear" data-title="YEAR">11.16~</td>
      <td class="tdEngineNo" data-title="${engine}">${engine}</td>
      <td class="tdBody" data-title="BODY">${frame}</td>
      <td class="tdParts" data-title="Front rotor"><a href="${SITE}/catalogue/cars/brake/700050/RN7050V">RN7050V</a></td>
      <td class="tdParts" data-title="Front Brake">${front}</td>
      <td class="tdParts" data-title="Rear Brake">${rear}</td>
    </tr>`;
  const link = (href: string, text: string) => `<a href="${href}" class="parts">${text}</a>`;
  const rows = opts.rows ??
    row("M900A", "1KR-FE", link(SELF, "PN7001"), link(`${SITE}/catalogue/cars/brake/700090/FN7090`, "FN7090")) +
      row("M910A", "1KR-FE", link(SELF, "PN7001"), "");
  return `<html><head><title>NiBK PN7001 04465-Z7001</title></head><body>
    <form method="post"><input name="txtPartNo" value="04465-Z7001"></form>
    <div class="cross">${crossRef}</div>
    <div class="model-title"><h3>TOYOTA » ROOMY</h3></div>
    <table class="search-result-table">${rows}</table>
  </body></html>`;
}

const CAR: BlockCheck = { number: "04465-Z7001", identity: ["M900A", "Roomy", "1KR-FE"], frame: "M900A" };

Deno.test("RE-31: number in the cross-reference list + car row + position cell linking here → found", () => {
  const hit = findCrossReferenceRow(productPage(), SELF, { ...CAR, position: ["front", "fr"] });
  assert(hit);
  assert(hit.block.startsWith("Cross-reference: "));
  assert(hit.block.includes("04465-Z7001"));
  assert(hit.block.includes("BODY: M900A"));
  assert(hit.block.includes("Front Brake: PN7001"));
});

Deno.test("RE-31: the job wants rear but the rear cell points elsewhere → not found", () => {
  assertEquals(findCrossReferenceRow(productPage(), SELF, { ...CAR, position: ["rear", "rr"] }), null);
});

Deno.test("RE-31: number not in the cross-reference list → not found (head, form value don't count)", () => {
  const page = productPage({ crossRef: `<div class="str"><div class="field">04465-Z7002</div></div>` });
  assertEquals(findCrossReferenceRow(page, SELF, { ...CAR, position: ["front"] }), null);
});

Deno.test("RE-31: only an M910A row while the car is M900A → not found, even with the same engine", () => {
  const page = productPage({
    rows: `<tr><td data-title="1KR-FE">1KR-FE</td><td data-title="BODY">M910A</td>
      <td data-title="Front Brake"><a href="${SELF}">PN7001</a></td></tr>`,
  });
  assertEquals(findCrossReferenceRow(page, SELF, { ...CAR, position: ["front"] }), null);
});

Deno.test("RE-31: the Front Brake cell links to another part's page → not found", () => {
  const page = productPage({
    rows: `<tr><td data-title="BODY">M900A</td>
      <td data-title="Front Brake"><a href="${SITE}/catalogue/cars/brake/700002/PN7002">PN7002</a></td></tr>`,
  });
  assertEquals(findCrossReferenceRow(page, SELF, { ...CAR, position: ["front"] }), null);
});

Deno.test("RE-31: no position on the job → any cell linking here counts; spec checks never use it", () => {
  assert(findCrossReferenceRow(productPage(), SELF, CAR));
  assertEquals(findCrossReferenceRow(productPage(), SELF, { ...CAR, number: null, valuePattern: /\S+/ }), null);
});

Deno.test("RE-31: a car without a frame code falls back to model / engine in the row", () => {
  const hit = findCrossReferenceRow(productPage(), SELF, { number: "04465-Z7001", identity: ["1KR-FE"], position: ["front"] });
  assert(hit);
});

Deno.test("findEvidenceOnPage: the same-row proof still wins when it passes", () => {
  const page = `<table><tr><td>04465-Z7001 Roomy M900A front pads</td></tr></table>`;
  const hit = findEvidenceOnPage(page, SELF, { ...CAR, position: ["front"] });
  assertEquals(hit?.block, "04465-Z7001 Roomy M900A front pads");
});

// ---------------------------------------------------------------- reader + recipe

type Call = { url: string; method: string; body: string | null; contentType: string | null; ua: string | null };

function fakeReader(responses: Array<() => Response>): ReaderDeps & { calls: Call[]; saved: Record<string, unknown>[] } {
  const queue = [...responses];
  const deps = {
    calls: [] as Call[],
    saved: [] as Record<string, unknown>[],
    fetchImpl: ((url: string | URL | Request, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      deps.calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body == null ? null : String(init.body),
        contentType: h.get("content-type"),
        ua: h.get("user-agent"),
      });
      const next = queue.shift();
      if (!next) throw new Error("no more fake responses");
      return Promise.resolve(next());
    }) as typeof fetch,
    resolveIps: () => Promise.resolve(["203.0.113.10"]),
    now: () => new Date("2026-11-21T00:00:00Z"),
    getSite: (domain: string) =>
      Promise.resolve(domain === "jnbk-brakes.com" ? { domain, automated_read: "allowed" as const, backoff_until: null } : null),
    lastStatusFor: () => Promise.resolve(null),
    saveRead: (row: Record<string, unknown>) => {
      deps.saved.push(row);
      return Promise.resolve(`read-${deps.saved.length}`);
    },
    markBlocked: () => Promise.resolve(),
    setBackoff: () => Promise.resolve(),
  };
  return deps;
}

Deno.test("RE-30 reader: posts the form once, follows the 303 with a plain GET", async () => {
  const deps = fakeReader([
    () => new Response(null, { status: 303, headers: { location: "/catalogue/cars/brake/700001/PN7001" } }),
    () => new Response("<p>product</p>", { status: 200 }),
  ]);
  const out = await readSourcePage({ url: `${SITE}/catalogue/cars`, purpose: "job", form: "txtPartNo=04465-Z7001&txtClass=1" }, deps);
  assertEquals(out.kind, "ok");
  if (out.kind === "ok") assertEquals(out.finalUrl, SELF);
  assertEquals(deps.calls[0].method, "POST");
  assertEquals(deps.calls[0].body, "txtPartNo=04465-Z7001&txtClass=1");
  assertEquals(deps.calls[0].contentType, "application/x-www-form-urlencoded");
  assert(deps.calls[0].ua?.startsWith("RoamResearchBot/"));
  assertEquals(deps.calls[1].method, "GET");
  assertEquals(deps.calls[1].body, null);
  assertEquals(deps.saved[0].url, `${SITE}/catalogue/cars`);
  assertEquals(deps.saved[0].final_url, SELF);
});

Deno.test("RE-30 reader: a 307/308 that would re-post the form is refused", async () => {
  for (const status of [307, 308]) {
    const deps = fakeReader([() => new Response(null, { status, headers: { location: "/elsewhere" } })]);
    const out = await readSourcePage({ url: `${SITE}/catalogue/cars`, purpose: "job", form: "txtPartNo=X1" }, deps);
    assertEquals(out.kind, "refused");
    assertEquals(deps.calls.length, 1);
  }
});

Deno.test("RE-30 reader: a form post to an untrusted site is never sent", async () => {
  const deps = fakeReader([]);
  const out = await readSourcePage({ url: "https://example.com/search", purpose: "job", form: "q=1" }, deps);
  assertEquals(out.kind, "refused");
  assertEquals(deps.calls.length, 0);
});

const FORM_RECIPE: LookupRecipe = {
  id: "form-1",
  domain: "jnbk-brakes.com",
  kind: "form_then_page",
  search_url_template: `${SITE}/catalogue/cars`,
  form_body_template: "txtPartNo={number}&txtClass=1&btnProductSearch=Search",
  result_link_rule: null,
  block_rule: null,
};

Deno.test("RE-30 runRecipe: fills the form, lands on the product page, proves it by cross-reference", async () => {
  const deps = fakeReader([
    () => new Response(null, { status: 303, headers: { location: SELF } }),
    () => new Response(productPage(), { status: 200 }),
  ]);
  const out = await runRecipe(FORM_RECIPE, { number: "04465-Z7001" }, { ...CAR, position: ["front"] }, { purpose: "recipe_test", readerDeps: deps });
  assertEquals(out.kind, "found");
  if (out.kind === "found") {
    assertEquals(out.pageRead.finalUrl, SELF);
    assert(out.block.includes("Front Brake: PN7001"));
  }
  assertEquals(deps.calls[0].body, "txtPartNo=04465-Z7001&txtClass=1&btnProductSearch=Search");
});

Deno.test("RE-30 runRecipe: no match (the site shows its empty search page) → not found", async () => {
  const deps = fakeReader([() => new Response("<html><body><form></form></body></html>", { status: 200 })]);
  const out = await runRecipe(FORM_RECIPE, { number: "04465-Z7001" }, { ...CAR, position: ["front"] }, { purpose: "job", readerDeps: deps });
  assertEquals(out.kind, "not_found");
});

Deno.test("RE-30 runRecipe: a form recipe with no number to fill sends nothing", async () => {
  const deps = fakeReader([]);
  const out = await runRecipe(FORM_RECIPE, { number: null }, CAR, { purpose: "job", readerDeps: deps });
  assertEquals(out.kind, "not_found");
  assertEquals(deps.calls.length, 0);
  const noFields = await runRecipe({ ...FORM_RECIPE, form_body_template: null }, { number: "X1" }, CAR, { purpose: "job", readerDeps: deps });
  assertEquals(noFields.kind, "not_found");
  assertEquals(deps.calls.length, 0);
});

// ---------------------------------------------------------------- code review (21 Nov) fixes

Deno.test("review: a bare # link or a javascript: link in the position cell never counts as linking here", () => {
  for (const href of ["#", "#details", "javascript:void(0)"]) {
    const page = productPage({
      rows: `<tr><td data-title="BODY">M900A</td><td data-title="Front Brake"><a href="${href}">Details</a></td></tr>`,
    });
    assertEquals(findCrossReferenceRow(page, SELF, { ...CAR, position: ["front"] }), null, href);
  }
});

Deno.test("review: a link to the same path with another query string is another page", () => {
  const self = `${SITE}/product.php?id=5`;
  const page = productPage({
    rows: `<tr><td data-title="BODY">M900A</td><td data-title="Front Brake"><a href="/product.php?id=7">PN7007</a></td></tr>`,
  });
  assertEquals(findCrossReferenceRow(page, self, { ...CAR, position: ["front"] }), null);
});

Deno.test("review: the number in a sentence (search echo, 'Similar' line) is not a cross-reference", () => {
  for (const crossRef of [
    `<h2>Results for 04465-Z7001</h2>`,
    `<p>Results for 04465-Z7001</p>`,
    `<div class="similar">Similar: PN7002 (04465-Z7001)</div>`,
    `<a href="/x">04465-Z7001</a>`,
    `<select><option>04465-Z7001</option></select>`,
  ]) {
    assertEquals(findCrossReferenceRow(productPage({ crossRef }), SELF, { ...CAR, position: ["front"] }), null, crossRef);
  }
});

Deno.test("review: punctuation is ignored — 04465Z7001 matches 04465-Z7001 on the page", () => {
  assert(findCrossReferenceRow(productPage(), SELF, { ...CAR, number: "04465Z7001", position: ["front"] }));
  const page = productPage({ crossRef: `<div class="str"><div class="field">04465 Z7001</div></div>` });
  assert(findCrossReferenceRow(page, SELF, { ...CAR, number: "04465-Z7001", position: ["front"] }));
});

Deno.test("review: the site's own number in the position cell proves itself", () => {
  const hit = findCrossReferenceRow(productPage({ crossRef: "" }), SELF, { ...CAR, number: "PN7001", position: ["front"] });
  assert(hit);
  assert(hit.block.includes("Front Brake: PN7001"));
});

Deno.test("review: a form answered in place (no redirect) is never evidence", async () => {
  const deps = fakeReader([() => new Response(productPage(), { status: 200 })]);
  const out = await runRecipe(FORM_RECIPE, { number: "04465-Z7001" }, { ...CAR, position: ["front"] }, { purpose: "job", readerDeps: deps });
  assertEquals(out.kind, "not_found");
  if (out.kind === "not_found") assertEquals(out.reason, "form_answered_in_place");
});

Deno.test("RE-55: two rows for the frame (turbo first) → the evidence is the car's own engine row", () => {
  const link = (href: string, text: string) => `<a href="${href}" class="parts">${text}</a>`;
  const row = (engine: string) => `
    <tr>
      <td class="tdYear" data-title="YEAR">11.16~</td>
      <td class="tdEngineNo" data-title="ENGINE">${engine}</td>
      <td class="tdBody" data-title="BODY">M900A</td>
      <td class="tdParts" data-title="Front Brake">${link(SELF, "PN7001")}</td>
    </tr>`;
  const hit = findCrossReferenceRow(productPage({ rows: row("1KR-VET") + row("1KR-FE") }), SELF, { ...CAR, position: ["front"] });
  assert(hit);
  assert(hit.block.includes("ENGINE: 1KR-FE"), hit.block);
  assert(!hit.block.includes("1KR-VET"), hit.block);
});
