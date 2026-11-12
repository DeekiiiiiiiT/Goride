/**
 * Fail when edge evaluate_run_mirror drifts from finance-core evaluateRun.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  RECON_STEP_ORDER as EDGE_ORDER,
  RECON_STEP_LABELS as EDGE_LABELS,
} from "./evaluate_run_mirror.ts";

function extractStepOrder(source: string): string[] {
  const match = source.match(
    /export const RECON_STEP_ORDER[\s\S]*?\] as const;/,
  );
  if (!match) throw new Error("RECON_STEP_ORDER block not found");
  return [...match[0].matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]);
}

function extractStepLabels(source: string): Record<string, string> {
  const match = source.match(
    /export const RECON_STEP_LABELS[\s\S]*?\};/,
  );
  if (!match) throw new Error("RECON_STEP_LABELS block not found");
  const out: Record<string, string> = {};
  for (const m of match[0].matchAll(/([a-z_]+):\s*['"]([^'"]+)['"]/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

Deno.test("RECON_STEP_ORDER/LABELS match packages/finance-core/src/evaluateRun.ts", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const corePath = join(here, "../../../packages/finance-core/src/evaluateRun.ts");
  const mirrorPath = join(here, "evaluate_run_mirror.ts");
  const coreText = await Deno.readTextFile(corePath);
  const mirrorText = await Deno.readTextFile(mirrorPath);
  const coreOrder = extractStepOrder(coreText);
  const mirrorOrder = extractStepOrder(mirrorText);
  assertEquals(mirrorOrder, coreOrder);
  assertEquals([...EDGE_ORDER], coreOrder);

  const coreLabels = extractStepLabels(coreText);
  const mirrorLabels = extractStepLabels(mirrorText);
  assertEquals(mirrorLabels, coreLabels);
  assertEquals({ ...EDGE_LABELS }, coreLabels);
});

// Behaviour, not just labels: the edge mirror never had the Fuel special case
// that finance-core had (found in Round 2a). Both must give the same answers.
import {
  evaluateRun as edgeEvaluateRun,
  hiddenLaneSteps as edgeHiddenLaneSteps,
} from "./evaluate_run_mirror.ts";
import {
  evaluateRun as coreEvaluateRun,
  hiddenLaneSteps as coreHiddenLaneSteps,
} from "../../../packages/finance-core/src/evaluateRun.ts";

const zero = { actionable: 0, informational: 0 };
const SAMPLES = [
  {
    name: "fuel with nothing left, not completed",
    input: {
      sources: [],
      stepCounts: { sources: zero, attribution: zero, tolls: zero, tag_account: zero, fuel: zero },
      completedSteps: [
        { stepId: "sources", inputsHashAtComplete: "" },
        { stepId: "attribution", inputsHashAtComplete: "" },
        { stepId: "tolls", inputsHashAtComplete: "" },
        { stepId: "tag_account", inputsHashAtComplete: "" },
      ],
    },
  },
  {
    name: "missing toll usage locks tolls",
    input: {
      sources: [{ id: "toll_usage", status: "missing" }, { id: "uber_bundle", status: "received" }],
      stepCounts: { sources: zero, tolls: { actionable: 2, informational: 0 } },
      completedSteps: [],
    },
  },
  {
    name: "delivery with hidden lane steps",
    input: {
      sources: [{ id: "rush_deliveries", status: "received" }],
      stepCounts: { sources: zero, attribution: zero, fuel: { actionable: 1, informational: 0 } },
      completedSteps: [{ stepId: "sources", inputsHashAtComplete: "" }],
      hiddenSteps: ["tolls", "tag_account", "fuel"],
    },
  },
];

Deno.test("evaluateRun mirror gives the same result as finance-core", () => {
  for (const sample of SAMPLES) {
    // deno-lint-ignore no-explicit-any
    const input = sample.input as any;
    assertEquals(edgeEvaluateRun(input), coreEvaluateRun(input), sample.name);
  }
  for (const applicable of [["rush_deliveries"], ["uber_bundle", "toll_usage", "cash_fuel"], []]) {
    assertEquals(
      edgeHiddenLaneSteps({ applicableSourceIds: applicable, blockerStepIds: [] }),
      coreHiddenLaneSteps({ applicableSourceIds: applicable, blockerStepIds: [] }),
    );
  }
});
