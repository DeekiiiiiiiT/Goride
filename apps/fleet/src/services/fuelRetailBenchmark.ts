/**
 * Fleet read of Petrojam wholesale + retail markup (for anomaly / Potential Loss).
 */
import { supabase } from '../utils/supabase/client';
import type { FuelGrade, PetrojamWholesaleRow, RetailMarkupVersion } from '@roam/fuel-core';

export async function listFleetPetrojamPrices(limit = 120): Promise<PetrojamWholesaleRow[]> {
  const { data, error } = await supabase
    .from('fuel_petrojam_prices')
    .select('price_date,gasolene_87,gasolene_90,auto_diesel,ulsd')
    .order('price_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    priceDate: r.price_date,
    gasolene87: r.gasolene_87,
    gasolene90: r.gasolene_90,
    autoDiesel: r.auto_diesel,
    ulsd: r.ulsd,
  }));
}

export async function listFleetRetailMarkupVersions(): Promise<RetailMarkupVersion[]> {
  const { data, error } = await supabase
    .from('fuel_retail_price_markup')
    .select(
      'id,effective_from,gasolene_87_markup,gasolene_90_markup,auto_diesel_markup,ulsd_markup,is_published',
    )
    .order('effective_from', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    effectiveFrom: r.effective_from,
    gasolene87Markup: Number(r.gasolene_87_markup) || 0,
    gasolene90Markup: Number(r.gasolene_90_markup) || 0,
    autoDieselMarkup: Number(r.auto_diesel_markup) || 0,
    ulsdMarkup: Number(r.ulsd_markup) || 0,
    isPublished: !!r.is_published,
  }));
}

export function inferFuelGrade(raw?: string | null): FuelGrade {
  const s = String(raw || '').toLowerCase();
  if (s.includes('87') || s.includes('e10')) return 'gasolene87';
  if (s.includes('ulsd')) return 'ulsd';
  if (s.includes('diesel') || s.includes('ado')) return 'autoDiesel';
  return 'gasolene90';
}
