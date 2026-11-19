import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  POSITION_SCHEMES,
  allowedPositionCodes,
  fleetPositionOptions,
  positionCodesProblem,
  positionLabel,
  wheelCodesToFitPairs,
} from "./partPositions.ts";

/** Keep in sync with supabase/tests/log_service_positions_checks.sql */
export const EXPECTED: Array<{
  code: string;
  position_aware: boolean;
  position_scheme: string | null;
  codes: string[];
}> = [
  { code: "job", position_aware: false, position_scheme: "none", codes: [] },
  { code: "job", position_aware: true, position_scheme: "none", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "axle", codes: ["LF", "RF", "LR", "RR", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "axle", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "four_corners", codes: ["LF", "RF", "LR", "RR", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "four_corners", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "driver_passenger_rear", codes: ["driver", "passenger", "rear", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "driver_passenger_rear", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "low_high_beam", codes: ["low", "high", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "low_high_beam", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "before_after_catalyst", codes: ["before_cat", "after_cat", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "before_after_catalyst", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "front_rear_side", codes: ["front", "rear", "side", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "front_rear_side", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "axle_left_right", codes: ["LF", "RF", "LR", "RR", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "axle_left_right", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "axle_inner_outer", codes: ["LF", "RF", "LR", "RR", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "axle_inner_outer", codes: ["LF", "RF", "LR", "RR"] },
  { code: "job", position_aware: false, position_scheme: "axle_numbered", codes: ["front", "rear", "unknown"] },
  { code: "job", position_aware: true, position_scheme: "axle_numbered", codes: ["LF", "RF", "LR", "RR"] },
  { code: "front_stabilizer_link", position_aware: false, position_scheme: "none", codes: ["LF", "RF"] },
  { code: "rear_stabilizer_link", position_aware: false, position_scheme: "four_corners", codes: ["LR", "RR"] },
];

const SCHEME_LIST = [
  "none",
  "axle",
  "four_corners",
  "driver_passenger_rear",
  "low_high_beam",
  "before_after_catalyst",
  "front_rear_side",
  "axle_left_right",
  "axle_inner_outer",
  "axle_numbered",
] as const;

Deno.test("POSITION_SCHEMES is the 10-value DB list", () => {
  assertEquals([...POSITION_SCHEMES], [...SCHEME_LIST]);
});

Deno.test("allowedPositionCodes matches EXPECTED", () => {
  for (const row of EXPECTED) {
    const got = allowedPositionCodes({
      code: row.code,
      position_aware: row.position_aware,
      position_scheme: row.position_scheme,
    });
    assertEquals(got, row.codes, JSON.stringify(row));
  }
});

Deno.test("Not sure on non-aware jobs with a scheme, never on aware or none", () => {
  for (const scheme of SCHEME_LIST) {
    for (const aware of [false, true]) {
      const codes = allowedPositionCodes({
        code: "job",
        position_aware: aware,
        position_scheme: scheme,
      });
      const hasUnknown = codes.includes("unknown");
      if (aware || scheme === "none") {
        assertEquals(hasUnknown, false, `${scheme} aware=${aware}`);
      } else {
        assertEquals(hasUnknown, true, `${scheme} aware=${aware}`);
      }
    }
  }
});

Deno.test("positionCodesProblem cases", () => {
  const catJob = { code: "oxygen", position_aware: false, position_scheme: "before_after_catalyst" };
  assertEquals(positionCodesProblem(catJob, []), null);
  assertEquals(positionCodesProblem(catJob, ["before_cat", "after_cat"]), null);
  assertEquals(positionCodesProblem(catJob, ["unknown", "before_cat"]), "not_sure_with_others");
  assertEquals(
    positionCodesProblem({ code: "job", position_aware: false, position_scheme: "before_after_catalyst" }, ["LF"]),
    "code_not_allowed",
  );
  assertEquals(
    positionCodesProblem({ code: "job", position_aware: false, position_scheme: "none" }, ["LF"]),
    "code_not_allowed",
  );
});

Deno.test("positionLabel cases", () => {
  assertEquals(
    positionLabel({ code: "job", position_aware: false, position_scheme: "front_rear_side" }, "front"),
    "Front",
  );
  assertEquals(
    positionLabel({ code: "job", position_aware: false, position_scheme: "before_after_catalyst" }, "before_cat"),
    "Front",
  );
  assertEquals(
    positionLabel({ code: "oxygen_sensor", position_aware: false, position_scheme: "before_after_catalyst" }, "before_cat"),
    "Front (Air fuel ratio sensor)",
  );
  assertEquals(
    positionLabel({ code: "oxygen_sensor", position_aware: false, position_scheme: "before_after_catalyst" }, "after_cat"),
    "Rear (Oxygen sensor No.2)",
  );
  assertEquals(
    positionLabel({ code: "tires", position_aware: true, position_scheme: "four_corners" }, "LF"),
    "LF",
  );
  assertEquals(
    positionLabel({ code: "job", position_aware: false, position_scheme: "none" }, "LF"),
    "LF",
  );
});

Deno.test("wheelCodesToFitPairs", () => {
  assertEquals(wheelCodesToFitPairs(["LF"]), [{ axle: "front", side: "left" }]);
  assertEquals(wheelCodesToFitPairs(["LF", "RF"]), [{ axle: "front", side: "both" }]);
  assertEquals(wheelCodesToFitPairs(["RR", "LF"]), [
    { axle: "front", side: "left" },
    { axle: "rear", side: "right" },
  ]);
  assertEquals(wheelCodesToFitPairs(["front"]), []);
});