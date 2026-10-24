/**
 * Posts recurring bills whose due date has arrived.
 * Called once from the nightly recon pass. A second run skips rows already posted.
 */
import type { Context } from "npm:hono@4.3.11";
import type { FixedExpenseConfig } from "../../../packages/types/src/expenses.ts";
import * as kv from "./kv_store.tsx";
import { appendCanonicalFixedExpenseIfEligible } from "./canonical_from_ops.ts";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Context that stamps the rule's own organisation. Nightly has no signed-in user. */
function orgContext(organizationId: string): Context {
  return {
    get(key: string) {
      if (key !== "rbacUser") return undefined;
      return {
        userId: "fixed-expense-nightly",
        resolvedRole: "fleet_owner",
        organizationId,
      };
    },
  } as unknown as Context;
}

export async function postDueFixedExpensesThroughToday(
  today: string = todayYmd(),
): Promise<{ rules: number; inserted: number; skipped: number; failed: number }> {
  const totals = { rules: 0, inserted: 0, skipped: 0, failed: 0 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return totals;
  const configs = ((await kv.getByPrefix("fixed_expense:")) || []) as FixedExpenseConfig[];
  for (const config of configs) {
    if (config.isActive === false) continue;
    if (!config.id || !config.startDate || !config.organizationId) continue;
    totals.rules += 1;
    try {
      const result = await appendCanonicalFixedExpenseIfEligible(
        config,
        config.startDate,
        today,
        orgContext(config.organizationId),
      );
      totals.inserted += result.inserted;
      totals.skipped += result.skipped;
      totals.failed += result.failed;
    } catch (err) {
      totals.failed += 1;
      console.error("[fixed-expense-nightly] rule failed", config.id, err);
    }
  }
  return totals;
}
