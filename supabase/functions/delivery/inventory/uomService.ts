import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function convertQty(
  sb: SupabaseClient,
  itemId: string,
  qty: number,
  fromUomId: string,
  toUomId: string,
): Promise<number> {
  if (fromUomId === toUomId) return qty;

  const { data: direct } = await sb
    .from("uom_conversions")
    .select("factor")
    .eq("item_id", itemId)
    .eq("from_uom_id", fromUomId)
    .eq("to_uom_id", toUomId)
    .maybeSingle();

  if (direct) return qty * Number((direct as Record<string, unknown>).factor);

  const { data: inverse } = await sb
    .from("uom_conversions")
    .select("factor")
    .eq("item_id", itemId)
    .eq("from_uom_id", toUomId)
    .eq("to_uom_id", fromUomId)
    .maybeSingle();

  if (inverse) return qty / Number((inverse as Record<string, unknown>).factor);

  throw new Error(`No UOM conversion for item ${itemId}`);
}

export async function toBaseQty(
  sb: SupabaseClient,
  itemId: string,
  qty: number,
  uomId: string,
): Promise<number> {
  const { data: item, error } = await sb
    .from("item_master")
    .select("base_uom_id")
    .eq("id", itemId)
    .single();

  if (error || !item) throw new Error("Item not found");
  const baseUomId = String((item as Record<string, unknown>).base_uom_id);
  return convertQty(sb, itemId, qty, uomId, baseUomId);
}

export async function resolveUomIdByCode(
  sb: SupabaseClient,
  companyId: string,
  code: string,
): Promise<string> {
  const { data, error } = await sb
    .from("uom_definitions")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", code)
    .maybeSingle();

  if (error || !data) throw new Error(`UOM not found: ${code}`);
  return String((data as Record<string, unknown>).id);
}
