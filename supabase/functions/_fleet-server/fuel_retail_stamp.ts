/**
 * Stamp resolved retail markup version onto fuel entries so history cannot be
 * rewritten when markup rows change (FUEL_SYSTEM_AUDIT §K12).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

type MarkupRow = {
  id: string;
  effective_from: string;
  gasolene_87_markup: number;
  gasolene_90_markup: number;
  auto_diesel_markup: number;
  ulsd_markup: number;
  is_published: boolean;
};

type WholesaleRow = {
  price_date: string;
  gasolene_87: number | null;
  gasolene_90: number | null;
  auto_diesel: number | null;
  ulsd: number | null;
};

function serviceDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function entryGrade(entry: Record<string, unknown>): "gasolene87" | "gasolene90" | "autoDiesel" | "ulsd" {
  const raw = String(
    entry.fuelType ||
      (entry.metadata as any)?.fuelType ||
      entry.fuelGrade ||
      "",
  ).toLowerCase();
  if (raw.includes("87") || raw.includes("e10")) return "gasolene87";
  if (raw.includes("diesel") || raw.includes("ulsd") || raw.includes("ado")) {
    return raw.includes("ulsd") ? "ulsd" : "autoDiesel";
  }
  return "gasolene90";
}

function wholesaleForGrade(row: WholesaleRow, grade: string): number | null {
  const v =
    grade === "gasolene87"
      ? row.gasolene_87
      : grade === "gasolene90"
        ? row.gasolene_90
        : grade === "autoDiesel"
          ? row.auto_diesel
          : row.ulsd;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function markupForGrade(m: MarkupRow, grade: string): number {
  if (grade === "gasolene87") return Number(m.gasolene_87_markup) || 0;
  if (grade === "gasolene90") return Number(m.gasolene_90_markup) || 0;
  if (grade === "autoDiesel") return Number(m.auto_diesel_markup) || 0;
  return Number(m.ulsd_markup) || 0;
}

/**
 * Mutates entry.metadata with priceVersionId + retailEstimateJmd when resolvable.
 * Never overwrites an existing stamped priceVersionId (history lock).
 */
export async function stampFuelEntryRetailPrice(
  entry: Record<string, unknown>,
): Promise<void> {
  const meta = {
    ...((entry.metadata && typeof entry.metadata === "object"
      ? entry.metadata
      : {}) as Record<string, unknown>),
  };
  if (typeof meta.priceVersionId === "string" && meta.priceVersionId.trim()) {
    entry.metadata = meta;
    return;
  }

  const dateYmd = String(entry.date || "").split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    entry.metadata = meta;
    return;
  }

  try {
    const db = serviceDb();
    const [{ data: markups }, { data: wholesale }] = await Promise.all([
      db
        .from("fuel_retail_price_markup")
        .select(
          "id,effective_from,gasolene_87_markup,gasolene_90_markup,auto_diesel_markup,ulsd_markup,is_published",
        )
        .eq("is_published", true)
        .lte("effective_from", dateYmd)
        .order("effective_from", { ascending: false })
        .limit(1),
      db
        .from("fuel_petrojam_prices")
        .select("price_date,gasolene_87,gasolene_90,auto_diesel,ulsd")
        .lte("price_date", dateYmd)
        .order("price_date", { ascending: false })
        .limit(1),
    ]);

    const markup = (markups || [])[0] as MarkupRow | undefined;
    const w = (wholesale || [])[0] as WholesaleRow | undefined;
    if (!markup || !w) {
      entry.metadata = meta;
      return;
    }

    const grade = entryGrade(entry);
    const wholesaleJmd = wholesaleForGrade(w, grade);
    if (wholesaleJmd == null) {
      entry.metadata = meta;
      return;
    }
    const markupJmd = markupForGrade(markup, grade);
    meta.priceVersionId = markup.id;
    meta.retailEstimateJmd = Math.round((wholesaleJmd + markupJmd) * 100) / 100;
    meta.retailGrade = grade;
    meta.retailWholesaleDate = w.price_date;
    entry.metadata = meta;
  } catch (e: any) {
    console.warn("[stampFuelEntryRetailPrice]", e?.message || e);
    entry.metadata = meta;
  }
}
