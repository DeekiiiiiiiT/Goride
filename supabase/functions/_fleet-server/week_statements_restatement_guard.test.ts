import { assertEquals } from "jsr:@std/assert";
import { shouldBlockRestatementDraft } from "./week_statements_guard.ts";

Deno.test("shouldBlockRestatementDraft blocks draft over closed without allow", () => {
  assertEquals(shouldBlockRestatementDraft(true, "draft", false), true);
  assertEquals(shouldBlockRestatementDraft(true, "draft", undefined), true);
});

Deno.test("shouldBlockRestatementDraft allows explicit restatement drafts", () => {
  assertEquals(shouldBlockRestatementDraft(true, "draft", true), false);
});

Deno.test("shouldBlockRestatementDraft allows closed replacement over closed", () => {
  assertEquals(shouldBlockRestatementDraft(true, "closed", false), false);
});

Deno.test("shouldBlockRestatementDraft allows first draft with no prior closed", () => {
  assertEquals(shouldBlockRestatementDraft(false, "draft", false), false);
});
