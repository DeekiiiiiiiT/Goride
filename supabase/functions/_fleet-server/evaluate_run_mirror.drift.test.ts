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
