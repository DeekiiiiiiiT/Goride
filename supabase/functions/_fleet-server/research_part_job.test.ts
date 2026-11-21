import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  brandNorm,
  buildPartPromptContext,
  decideJobOutcome,
  identityTokens,
  positionKeyFor,
  positionTokens,
  safeCandidateNumber,
} from "./research_part_job.ts";
import type { RuleRouted } from "./catalog_research_route.ts";

const car = { make: "Toyota", model: "Roomy", chassis_code: "M900A", engine_code: "1KR-FE", production_start_year: 2016, production_end_year: 2020 };

Deno.test("RE-27: the prompt carries only the car, part type and fit — never customer text", () => {
  const p = buildPartPromptContext({ car, partTypeName: "Wheel bearing", fitDescriptor: "rear", candidateNumber: "call me at 876-555-0100 please" });
  assert(p.includes("M900A") && p.includes("Wheel bearing") && p.includes("rear"));
  assert(!p.toLowerCase().includes("call me"), "free text must never reach Google");
  assert(!p.includes("Fleet notes"));
  const withNumber = buildPartPromptContext({ car, partTypeName: "Wheel bearing", candidateNumber: "3G080" });
  assert(withNumber.includes("Candidate number to check: 3G080"));
});

Deno.test("RE-27: only part-number-shaped candidates pass", () => {
  assertEquals(safeCandidateNumber("04465-B1190"), "04465-B1190");
  assertEquals(safeCandidateNumber("the one from the shop"), null);
  assertEquals(safeCandidateNumber("x".repeat(31)), null);
  assertEquals(safeCandidateNumber(null), null);
});

Deno.test("identity and position tokens", () => {
  assertEquals(identityTokens(car), ["M900A", "Roomy", "1KR-FE"]);
  assertEquals(positionTokens("Rear left / right"), ["rear", "rr"]);
  assertEquals(positionTokens(null), undefined);
  assertEquals(positionKeyFor("front"), "front");
  assertEquals(positionKeyFor(""), "");
});

Deno.test("brand aliases map to the trusted list's maker names", () => {
  const aliases = new Map([["sb", "SB Nagamochi"], ["koyo", "JTEKT"]]);
  assertEquals(brandNorm("SB", aliases), "sb nagamochi");
  assertEquals(brandNorm("Koyo", aliases), "jtekt");
  assertEquals(brandNorm("NiBK", aliases), "nibk");
});

const r = (over: Partial<RuleRouted>): RuleRouted => ({
  id: "p", slotKey: "s", trust: "needs_checking", trustRoute: null, route: "review", shadowWouldAuto: false,
  conflict: false, evidenceReadIds: [], ...over,
});

Deno.test("RE-28: job outcome — auto, review, browser check within the cap, queued past it, not found", () => {
  const base = { hasBrowserCheckLink: false, browserCheckAllowed: true, openBrowserChecks: 0, maxOpenBrowserChecks: 25 };
  assertEquals(decideJobOutcome({ ...base, routed: [r({ route: "auto", trust: "confirmed" })] }), "auto_added");
  assertEquals(decideJobOutcome({ ...base, routed: [r({ trust: "confirmed", trustRoute: "a" })] }), "needs_review");
  assertEquals(decideJobOutcome({ ...base, hasBrowserCheckLink: true, routed: [r({})] }), "browser_check");
  assertEquals(decideJobOutcome({ ...base, hasBrowserCheckLink: true, openBrowserChecks: 25, routed: [r({})] }), "browser_check_queued");
  assertEquals(decideJobOutcome({ ...base, hasBrowserCheckLink: true, browserCheckAllowed: false, routed: [r({})] }), "needs_review");
  assertEquals(decideJobOutcome({ ...base, routed: [] }), "not_found");
});
