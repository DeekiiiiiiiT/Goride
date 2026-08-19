import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Sb = SupabaseClient;

/** Active peak window bonus for courier location + time (Kingston soft-launch: all_kingston flag). */
export async function resolvePeakPayBonus(
  serviceSb: Sb,
  _lat?: number | null,
  _lng?: number | null,
  at = new Date(),
): Promise<{ bonus: number; windowId?: string; label?: string }> {
  const nowIso = at.toISOString();
  const { data: windows } = await serviceSb
    .from("courier_peak_windows")
    .select("id, label, bonus_amount, all_kingston")
    .eq("active", true)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .order("bonus_amount", { ascending: false })
    .limit(1);

  const win = windows?.[0];
  if (!win) return { bonus: 0 };
  const bonus = Math.max(0, Number(win.bonus_amount || 0));
  if (bonus <= 0) return { bonus: 0 };
  return { bonus, windowId: String(win.id), label: String(win.label || "Peak Pay") };
}
