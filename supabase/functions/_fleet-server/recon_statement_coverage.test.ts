/**
 * Mid-week toll file: declared Mon–Sun covers the empty days, and the
 * transaction span stays the shorter range stored in data_start/data_end.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  coverageGapMessage,
  defaultDeclaredCoverage,
} from "../../../packages/finance-core/src/statementCoverage.ts";

Deno.test("mid-week toll file declares the week and keeps the shorter transaction span", () => {
  const dataStart = "2026-10-21";
  const dataEnd = "2026-10-23";
  const declared = defaultDeclaredCoverage({
    weekKey: "2026-10-19",
    dataStart,
    dataEnd,
  });
  assertEquals(declared.coverageStart, "2026-10-19");
  assertEquals(declared.coverageEnd, "2026-10-25");
  assertEquals(dataStart < declared.coverageStart!, false);
  assertEquals(dataEnd > declared.coverageEnd!, false);
  assertEquals(
    coverageGapMessage({
      coverageStart: declared.coverageStart,
      coverageEnd: declared.coverageEnd,
      dataStart,
      dataEnd,
    }),
    null,
  );
});
