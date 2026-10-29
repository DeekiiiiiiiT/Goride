import { assertEquals } from "jsr:@std/assert";
import { petrojamRowsToLong, type PetrojamPriceRow } from "./scrape.ts";
import { httpStatusForRuns, syncActiveRefineries, type ActiveRefinery } from "./refinerySync.ts";

const blank = (priceDate: string, gasolene87: number | null): PetrojamPriceRow => ({
  priceDate,
  gasolene87,
  gasolene90: null,
  autoDiesel: null,
  kerosene: null,
  propane: null,
  butane: null,
  hfo: null,
  asphalt: null,
  ulsd: null,
});

Deno.test("petrojam rows become one long price per filled product", () => {
  const rows = petrojamRowsToLong([
    blank("2026-10-22", 201.8128),
    { ...blank("2026-10-15", null), ulsd: 268.6573 },
  ]);
  assertEquals(rows, [
    { product_code: "gasolene_87", effective_date: "2026-10-22", price_jmd: 201.8128 },
    { product_code: "ulsd", effective_date: "2026-10-15", price_jmd: 268.6573 },
  ]);
});

Deno.test("a sync with any error run is HTTP 500", () => {
  assertEquals(httpStatusForRuns([{ error: null }, { error: "boom" }]), 500);
  assertEquals(httpStatusForRuns([{ error: null }]), 200);
});

Deno.test("a thrown adapter records an error run and the cron status is 500", async () => {
  const petrojam: ActiveRefinery = {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "petrojam",
    source_kind: "petrojam_html",
    status: "active",
  };
  const errors: string[] = [];
  const db = {
    rpc: (name: string, args: { p_error?: string }) => {
      if (name === "refinery_record_error") errors.push(args.p_error ?? "");
      return Promise.resolve({ data: null, error: null });
    },
  };
  const result = await syncActiveRefineries(db as never, {
    mode: "latest",
    trigger: "schedule",
    refineries: [petrojam],
    scrape: () => Promise.reject(new Error("adapter down")),
  });
  assertEquals(errors, ["adapter down"]);
  assertEquals(result.status, 500);
  assertEquals(result.runs[0].error, "adapter down");
  assertEquals(result.runs[0].weeks_revised, 0);
});

Deno.test("an unchanged price then a new price reports one revision", async () => {
  const petrojam: ActiveRefinery = {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "petrojam",
    source_kind: "petrojam_html",
    status: "active",
  };
  const seen: number[] = [];
  const db = {
    rpc: (_name: string, args: { p_rows?: Array<{ price_jmd: number }> }) => {
      const price = args.p_rows?.[0]?.price_jmd;
      if (price != null) seen.push(price);
      const revised = seen.filter((value, index) => index > 0 && value !== seen[index - 1]).length;
      return Promise.resolve({
        data: {
          weeks_found: 1,
          weeks_new: seen.length === 1 ? 1 : 0,
          weeks_unchanged: price === 200 && seen.length > 1 ? 1 : 0,
          weeks_revised: revised > 0 && price === 201 ? 1 : 0,
          error: null,
        },
        error: null,
      });
    },
  };
  const scrape = (opts?: { mode?: string }) => {
    const price = opts?.mode === "year" ? 201 : 200;
    return Promise.resolve({
      rows: [blank("2020-01-02", price)],
      pagesFetched: 1,
      mode: (opts?.mode === "year" ? "year" : "latest") as "latest",
    });
  };
  const first = await syncActiveRefineries(db as never, {
    mode: "latest",
    trigger: "owner",
    refineries: [petrojam],
    scrape,
  });
  const second = await syncActiveRefineries(db as never, {
    mode: "year",
    trigger: "owner",
    refineries: [petrojam],
    scrape,
  });
  assertEquals(first.runs[0].weeks_new, 1);
  assertEquals(first.status, 200);
  assertEquals(second.runs[0].weeks_revised, 1);
});
