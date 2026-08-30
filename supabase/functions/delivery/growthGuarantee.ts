/**
 * Phase 2 — Growth Guarantee monthly credit for Dominant merchants.
 * Credits the commission delta vs Economy when prior-month delivered orders < min.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parsePricingRules,
  growthGuaranteeCreditFromCommission,
  jamaicaCalendarMonthsElapsed,
  jamaicaPeriodYyyyMmFromIso,
  growthGuaranteeCreditIdempotencyKey,
  growthGuaranteeClawIdempotencyKey,
  shouldClawGrowthGuarantee,
  GG_QUALIFYING_ORDER_STATUSES,
} from "../_shared/dashPricing.ts";

export {
  growthGuaranteeCreditFromCommission,
  jamaicaCalendarMonthsElapsed,
  jamaicaPeriodYyyyMmFromIso,
};

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

export type GrowthGuaranteeRunResult = {
  period: string;
  evaluated: number;
  credited: number;
  skipped: number;
  credits: Array<{
    merchant_id: string;
    order_count: number;
    credit_jmd: number;
    adjustment_id?: string;
    skipped?: string;
  }>;
};

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

/** Jamaica has no DST — fixed UTC-5. */
export function jamaicaMonthBounds(periodYyyyMm: string): { startIso: string; endIso: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodYyyyMm).trim());
  if (!m) throw new Error(`Invalid period ${periodYyyyMm}; expected YYYY-MM`);
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  if (month < 1 || month > 12) throw new Error(`Invalid month in period ${periodYyyyMm}`);
  const startUtc = Date.UTC(year, month - 1, 1, 5, 0, 0); // midnight Jamaica = 05:00 UTC
  const endUtc = Date.UTC(year, month, 1, 5, 0, 0);
  return {
    startIso: new Date(startUtc).toISOString(),
    endIso: new Date(endUtc).toISOString(),
  };
}

/** Default: prior calendar month in America/Jamaica. */
export function priorJamaicaPeriodYyyyMm(now = new Date()): string {
  const jm = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const y = jm.getUTCFullYear();
  const mo = jm.getUTCMonth();
  const prevMonth = mo === 0 ? 11 : mo - 1;
  const yearNum = mo === 0 ? y - 1 : y;
  return `${yearNum}-${String(prevMonth + 1).padStart(2, "0")}`;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Run Growth Guarantee for a calendar month (America/Jamaica).
 * @param periodYyyyMm e.g. "2026-07" — the month whose completed orders are counted
 */
export async function runGrowthGuaranteeForPeriod(
  sb: ServiceSb,
  periodYyyyMm: string,
): Promise<GrowthGuaranteeRunResult> {
  const period = String(periodYyyyMm).trim();
  const { startIso, endIso } = jamaicaMonthBounds(period);

  const layered = await sb
    .from("global_pricing_profiles")
    .select("rules")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rules = parsePricingRules((layered.data?.rules ?? null) as Record<string, unknown> | null);
  const gg = rules.growthGuarantee ?? {
    enabled: true,
    tierSlugs: ["dominant"],
    monthsFromAssignment: 6,
    minOrdersPerMonth: 20,
  };

  const result: GrowthGuaranteeRunResult = {
    period,
    evaluated: 0,
    credited: 0,
    skipped: 0,
    credits: [],
  };

  if (!gg.enabled) {
    return result;
  }

  const { data: tiers } = await sb
    .from("merchant_tiers")
    .select("id, slug, commission_rate")
    .in("slug", ["economy", "dominant", ...(gg.tierSlugs ?? [])]);

  const bySlug = new Map<string, { id: string; slug: string; commission_rate: number }>();
  for (const t of tiers ?? []) {
    const row = t as { id: string; slug: string; commission_rate: number };
    bySlug.set(String(row.slug), {
      id: String(row.id),
      slug: String(row.slug),
      commission_rate: Number(row.commission_rate),
    });
  }

  const dominant = bySlug.get("dominant");
  const economy = bySlug.get("economy");
  if (!dominant || !economy) {
    throw new Error("economy and dominant tiers required for Growth Guarantee");
  }

  const dominantRate = dominant.commission_rate;
  const economyRate = economy.commission_rate;
  if (!(dominantRate > economyRate) || dominantRate <= 0) {
    throw new Error("Invalid tier commission ladder for Growth Guarantee");
  }

  const eligibleSlugs = new Set(
    (gg.tierSlugs?.length ? gg.tierSlugs : ["dominant"]).map((s) => String(s).toLowerCase()),
  );
  const eligibleTier = [...bySlug.values()].filter((t) => eligibleSlugs.has(t.slug.toLowerCase()));
  if (!eligibleTier.length) {
    return result;
  }

  const monthsWindow = Math.max(1, Number(gg.monthsFromAssignment ?? 6));
  const minOrders = Math.max(0, Math.floor(Number(gg.minOrdersPerMonth ?? 20)));
  const maxCredit = Math.max(
    0,
    Number(gg.maxCreditJmdPerPeriod ?? 50_000),
  );

  const { data: merchants, error: merchErr } = await sb
    .from("merchants")
    .select("id, pricing_tier_id, dominant_assigned_at")
    .in("pricing_tier_id", eligibleTier.map((t) => t.id))
    .not("dominant_assigned_at", "is", null);

  if (merchErr) throw new Error(merchErr.message);

  const pdb = getPaymentsDb();
  const periodEndMs = new Date(endIso).getTime();

  for (const m of merchants ?? []) {
    const merchantId = String((m as { id: string }).id);
    const assignedAt = String((m as { dominant_assigned_at?: string }).dominant_assigned_at ?? "");
    result.evaluated += 1;

    if (!assignedAt) {
      result.skipped += 1;
      result.credits.push({ merchant_id: merchantId, order_count: 0, credit_jmd: 0, skipped: "no_assignment_date" });
      continue;
    }

    // Still within N calendar months of Dominant assignment as of period end
    if (jamaicaCalendarMonthsElapsed(assignedAt, endIso) >= monthsWindow) {
      result.skipped += 1;
      result.credits.push({ merchant_id: merchantId, order_count: 0, credit_jmd: 0, skipped: "outside_window" });
      continue;
    }
    // Assignment must have started before period ended
    if (new Date(assignedAt).getTime() >= periodEndMs) {
      result.skipped += 1;
      result.credits.push({ merchant_id: merchantId, order_count: 0, credit_jmd: 0, skipped: "assigned_after_period" });
      continue;
    }

    const { data: orders, error: ordErr } = await sb
      .from("orders")
      .select("id, subtotal, merchant_commission_amount, status")
      .eq("merchant_id", merchantId)
      .gte("placed_at", startIso)
      .lt("placed_at", endIso);

    if (ordErr) throw new Error(ordErr.message);

    const completed = (orders ?? []).filter((o: { status?: string }) => {
      const s = String(o.status ?? "").toLowerCase();
      return GG_QUALIFYING_ORDER_STATUSES.has(s);
    });
    const orderCount = completed.length;

    if (orderCount >= minOrders) {
      result.skipped += 1;
      result.credits.push({
        merchant_id: merchantId,
        order_count: orderCount,
        credit_jmd: 0,
        skipped: "met_minimum",
      });
      continue;
    }

    let credit = 0;
    for (const o of completed) {
      credit += growthGuaranteeCreditFromCommission(
        Number((o as { merchant_commission_amount?: number }).merchant_commission_amount ?? 0),
        dominantRate,
        economyRate,
      );
    }
    credit = roundMoney(credit);
    if (maxCredit > 0 && credit > maxCredit) {
      credit = roundMoney(maxCredit);
    }
    if (credit <= 0) {
      result.skipped += 1;
      result.credits.push({
        merchant_id: merchantId,
        order_count: orderCount,
        credit_jmd: 0,
        skipped: "zero_credit",
      });
      continue;
    }

    const idempotencyKey = `gg:${merchantId}:${period}`;
    const reason =
      `Growth Guarantee ${period}: ${orderCount}/${minOrders} orders — ` +
      `commission delta ${(dominantRate - economyRate) * 100}% vs Economy`;

    const { data: existing } = await pdb
      .from("merchant_adjustments")
      .select("id, amount")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      result.skipped += 1;
      result.credits.push({
        merchant_id: merchantId,
        order_count: orderCount,
        credit_jmd: Number(existing.amount ?? credit),
        adjustment_id: String(existing.id),
        skipped: "already_credited",
      });
      continue;
    }

    const { data: adj, error: adjErr } = await pdb
      .from("merchant_adjustments")
      .insert({
        merchant_id: merchantId,
        amount: credit,
        reason,
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();

    if (adjErr) {
      // Race on unique index
      if (String(adjErr.message || "").toLowerCase().includes("unique") ||
        String(adjErr.code) === "23505") {
        result.skipped += 1;
        result.credits.push({
          merchant_id: merchantId,
          order_count: orderCount,
          credit_jmd: credit,
          skipped: "already_credited",
        });
        continue;
      }
      throw new Error(adjErr.message);
    }

    result.credited += 1;
    result.credits.push({
      merchant_id: merchantId,
      order_count: orderCount,
      credit_jmd: credit,
      adjustment_id: adj ? String(adj.id) : undefined,
    });
  }

  return result;
}

export type ClawbackResult =
  | { clawed: false; reason: string }
  | { clawed: true; amount: number; period: string; adjustment_id?: string };

/**
 * When a previously delivered/completed order cancels or is fully refunded after a GG
 * period credit was issued, post one idempotent debit for that order's commission delta.
 */
export async function maybeClawbackGrowthGuarantee(
  sb: ServiceSb,
  opts: {
    orderId: string;
    /** Status before cancel/refund — must have been delivered/completed */
    priorStatus: string;
  },
): Promise<ClawbackResult> {
  const prior = String(opts.priorStatus || "").toLowerCase();
  if (!GG_QUALIFYING_ORDER_STATUSES.has(prior)) {
    return { clawed: false, reason: "prior_not_qualifying" };
  }

  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("id, merchant_id, placed_at, merchant_commission_amount")
    .eq("id", opts.orderId)
    .maybeSingle();

  if (ordErr || !order) {
    return { clawed: false, reason: "order_not_found" };
  }

  const merchantId = String((order as { merchant_id?: string }).merchant_id ?? "");
  const placedAt = String((order as { placed_at?: string }).placed_at ?? "");
  if (!merchantId || !placedAt) {
    return { clawed: false, reason: "missing_merchant_or_placed_at" };
  }

  const period = jamaicaPeriodYyyyMmFromIso(placedAt);
  if (!period) return { clawed: false, reason: "bad_period" };

  const { data: merchant } = await sb
    .from("merchants")
    .select("id, dominant_assigned_at, pricing_tier_id")
    .eq("id", merchantId)
    .maybeSingle();

  const assignedAt = String(
    (merchant as { dominant_assigned_at?: string } | null)?.dominant_assigned_at ?? "",
  );
  if (!assignedAt) {
    return { clawed: false, reason: "no_assignment" };
  }

  const layered = await sb
    .from("global_pricing_profiles")
    .select("rules")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rules = parsePricingRules((layered.data?.rules ?? null) as Record<string, unknown> | null);
  const gg = rules.growthGuarantee ?? {
    enabled: true,
    tierSlugs: ["dominant"],
    monthsFromAssignment: 6,
    minOrdersPerMonth: 20,
  };
  if (!gg.enabled) return { clawed: false, reason: "gg_disabled" };

  const monthsWindow = Math.max(1, Number(gg.monthsFromAssignment ?? 6));
  let endIso: string;
  try {
    endIso = jamaicaMonthBounds(period).endIso;
  } catch {
    return { clawed: false, reason: "bad_period_bounds" };
  }
  const inWindow = jamaicaCalendarMonthsElapsed(assignedAt, endIso) < monthsWindow;

  const { data: tiers } = await sb
    .from("merchant_tiers")
    .select("slug, commission_rate")
    .in("slug", ["economy", "dominant"]);
  const bySlug = new Map<string, number>();
  for (const t of tiers ?? []) {
    bySlug.set(String((t as { slug: string }).slug), Number((t as { commission_rate: number }).commission_rate));
  }
  const dominantRate = bySlug.get("dominant") ?? 0;
  const economyRate = bySlug.get("economy") ?? 0;

  const clawAmount = growthGuaranteeCreditFromCommission(
    Number((order as { merchant_commission_amount?: number }).merchant_commission_amount ?? 0),
    dominantRate,
    economyRate,
  );

  const creditKey = growthGuaranteeCreditIdempotencyKey(merchantId, period);
  const clawKey = growthGuaranteeClawIdempotencyKey(merchantId, period, opts.orderId);
  const pdb = getPaymentsDb();

  const { data: creditRow } = await pdb
    .from("merchant_adjustments")
    .select("id")
    .eq("idempotency_key", creditKey)
    .maybeSingle();

  const { data: existingClaw } = await pdb
    .from("merchant_adjustments")
    .select("id")
    .eq("idempotency_key", clawKey)
    .maybeSingle();

  if (
    !shouldClawGrowthGuarantee({
      priorQualifyingStatus: true,
      hasPeriodCredit: Boolean(creditRow),
      alreadyClawed: Boolean(existingClaw),
      inAssignmentWindow: inWindow,
      clawAmount,
    })
  ) {
    if (!creditRow) return { clawed: false, reason: "no_period_credit" };
    if (existingClaw) return { clawed: false, reason: "already_clawed" };
    if (!inWindow) return { clawed: false, reason: "outside_window" };
    if (!(clawAmount > 0)) return { clawed: false, reason: "zero_claw" };
    return { clawed: false, reason: "skipped" };
  }

  const debit = -roundMoney(clawAmount);
  const reason =
    `Growth Guarantee claw-back ${period} for order ${opts.orderId} ` +
    `(cancel/refund after delivered credit)`;

  const { data: adj, error: adjErr } = await pdb
    .from("merchant_adjustments")
    .insert({
      merchant_id: merchantId,
      amount: debit,
      reason,
      idempotency_key: clawKey,
    })
    .select("id")
    .single();

  if (adjErr) {
    if (
      String(adjErr.message || "").toLowerCase().includes("unique") ||
      String(adjErr.code) === "23505"
    ) {
      return { clawed: false, reason: "already_clawed" };
    }
    console.error("[gg-clawback]", adjErr.message);
    return { clawed: false, reason: "insert_failed" };
  }

  return {
    clawed: true,
    amount: debit,
    period,
    adjustment_id: adj ? String(adj.id) : undefined,
  };
}

