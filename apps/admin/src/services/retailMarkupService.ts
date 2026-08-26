import { supabase } from '../utils/supabase/client';

export type RetailMarkupVersionRow = {
  id: string;
  effectiveFrom: string;
  gasolene87Markup: number;
  gasolene90Markup: number;
  autoDieselMarkup: number;
  ulsdMarkup: number;
  isPublished: boolean;
  versionLabel?: string;
};

export const retailMarkupService = {
  async listVersions(): Promise<RetailMarkupVersionRow[]> {
    const { data, error } = await supabase
      .from('fuel_retail_price_markup')
      .select('*')
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
      versionLabel: r.version_label,
    }));
  },

  async publishVersion(input: {
    versionLabel: string;
    effectiveFrom: string;
    gasolene87Markup: number;
    gasolene90Markup: number;
    autoDieselMarkup: number;
    ulsdMarkup: number;
    notes?: string;
  }): Promise<void> {
    const { error } = await supabase.from('fuel_retail_price_markup').upsert({
      version_label: input.versionLabel,
      effective_from: input.effectiveFrom,
      gasolene_87_markup: input.gasolene87Markup,
      gasolene_90_markup: input.gasolene90Markup,
      auto_diesel_markup: input.autoDieselMarkup,
      ulsd_markup: input.ulsdMarkup,
      notes: input.notes || null,
      is_published: true,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};
