import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { compareVersion } from "./research_other_jobs.ts";

const onFile = [
  { id: "v1", chassis_code: "M900A", engine_code: "1KR-FE", production_start_year: 2016, production_end_year: 2020, drivetrain: "2WD", transmission: "CVT" },
  { id: "v2", chassis_code: "M910A", engine_code: "1KR-FE", production_start_year: 2016, production_end_year: 2020, drivetrain: "4WD", transmission: null },
];

Deno.test("RE-08: a version already on file with nothing new is 'same'", () => {
  assertEquals(compareVersion({ chassisCode: "m900a", engineCode: "1KR-FE", productionStartYear: 2016, productionEndYear: 2020, drivetrain: "2WD" }, onFile),
    { action: "same", existingId: "v1" });
});

Deno.test("RE-08: a version on file that gains a missing fact is 'update'", () => {
  assertEquals(compareVersion({ chassisCode: "M910A", engineCode: "1KR-FE", productionStartYear: 2018, transmission: "CVT" }, onFile),
    { action: "update", existingId: "v2" });
});

Deno.test("RE-08: a new engine or frame code is 'new'", () => {
  assertEquals(compareVersion({ chassisCode: "M900A", engineCode: "1KR-VET", productionStartYear: 2020 }, onFile),
    { action: "new", existingId: null });
});
