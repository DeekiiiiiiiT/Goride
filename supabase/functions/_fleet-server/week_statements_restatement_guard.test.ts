import { assertEquals } from "jsr:@std/assert";
import {
  shouldBlockRestatementDraft,
  shouldRetireAsOlderDraft,
  shouldSkipUnchangedStatement,
} from "./week_statements_guard.ts";

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

Deno.test("matching unsigned retry does not insert another row", () => {
  assertEquals(
    shouldSkipUnchangedStatement({
      latestStatus: "draft",
      nextStatus: "draft",
      amountsMatch: true,
    }),
    true,
  );
  assertEquals(
    shouldSkipUnchangedStatement({
      latestStatus: "closed",
      nextStatus: "closed",
      amountsMatch: true,
    }),
    true,
  );
});

Deno.test("signing an unsigned week is not treated as a duplicate", () => {
  assertEquals(
    shouldSkipUnchangedStatement({
      latestStatus: "draft",
      nextStatus: "closed",
      amountsMatch: true,
    }),
    false,
  );
  assertEquals(
    shouldSkipUnchangedStatement({
      latestStatus: null,
      nextStatus: "draft",
      amountsMatch: false,
    }),
    false,
  );
});

Deno.test("a second unsigned publish restates the first and keeps a signed row", () => {
  const first = { id: "v1", status: "draft" };
  const second = { id: "v2", status: "draft" };
  const signed = { id: "signed", status: "closed" };
  assertEquals(shouldRetireAsOlderDraft(first, second.id), true);
  assertEquals(shouldRetireAsOlderDraft(second, second.id), false);
  assertEquals(shouldRetireAsOlderDraft(signed, second.id), false);
});
