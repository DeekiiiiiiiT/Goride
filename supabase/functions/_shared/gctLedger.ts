/**
 * GCT output-tax ledger writers — shadow write on order tax point.
 * Reversals are new rows (never delete).
 */

import { resolveTaxPoint } from './gctCore.ts';

type Sb = {
  schema?: (s: string) => { from: (t: string) => any };
  from: (t: string) => any;
};

function acct(sb: Sb) {
  // public.* mirrors of accounting.* (PostgREST-exposed)
  return sb;
}

async function ensureOpenPeriodFor(
  a: ReturnType<typeof acct>,
  taxPoint: Date,
): Promise<string | null> {
  if (!a) return null;
  const start = new Date(taxPoint.getFullYear(), taxPoint.getMonth(), 1);
  const end = new Date(taxPoint.getFullYear(), taxPoint.getMonth() + 1, 0);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = end.toISOString().slice(0, 10);

  const { data: existing } = await a
    .from('gct_periods')
    .select('id, status')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();
  if (existing) {
    if (existing.status !== 'open') return null; // filed/closed — do not attach
    return existing.id as string;
  }
  const { data: created } = await a
    .from('gct_periods')
    .insert({ period_start: periodStart, period_end: periodEnd, status: 'open' })
    .select('id')
    .single();
  return (created?.id as string) ?? null;
}

export type OrderGctLedgerInput = {
  orderId: string;
  merchantId?: string | null;
  taxFoodJmd: number;
  taxPlatformJmd: number;
  foodBaseJmd: number;
  platformBaseJmd: number;
  foodRatePercent: number;
  platformRatePercent: number;
  invoiceAt?: string | null;
  paymentAt?: string | null;
  deliveryAt?: string | null;
};

/** Write food + platform output tax rows for a finalised order (idempotent by source_doc). */
export async function recordOrderOutputTax(sb: Sb, input: OrderGctLedgerInput): Promise<void> {
  const a = acct(sb);
  if (!a) return;

  const { data: existing } = await a
    .from('gct_output_tax')
    .select('id')
    .eq('source_doc_type', 'delivery_order')
    .eq('source_doc_id', input.orderId)
    .is('reversal_of_id', null)
    .limit(1);
  if (existing?.length) return;

  let taxPoint: Date;
  try {
    taxPoint = resolveTaxPoint({
      invoiceAt: input.invoiceAt,
      paymentAt: input.paymentAt,
      deliveryAt: input.deliveryAt ?? new Date().toISOString(),
    });
  } catch {
    taxPoint = new Date();
  }

  const periodId = await ensureOpenPeriodFor(a, taxPoint);
  const rows: Array<Record<string, unknown>> = [];

  if (input.taxFoodJmd > 0) {
    rows.push({
      tax_point: taxPoint.toISOString(),
      source_doc_type: 'delivery_order',
      source_doc_id: input.orderId,
      recipient_ref: input.merchantId ?? null,
      supply_class: 'standard',
      base_amount_jmd: Math.round(input.foodBaseJmd * 100) / 100,
      rate_percent: input.foodRatePercent,
      tax_amount_jmd: Math.round(input.taxFoodJmd * 100) / 100,
      period_id: periodId,
    });
  }
  if (input.taxPlatformJmd > 0) {
    rows.push({
      tax_point: taxPoint.toISOString(),
      source_doc_type: 'delivery_order_platform',
      source_doc_id: input.orderId,
      recipient_ref: 'roam_rush',
      supply_class: 'standard',
      base_amount_jmd: Math.round(input.platformBaseJmd * 100) / 100,
      rate_percent: input.platformRatePercent,
      tax_amount_jmd: Math.round(input.taxPlatformJmd * 100) / 100,
      period_id: periodId,
    });
  }
  if (rows.length === 0) return;
  const { error } = await a.from('gct_output_tax').insert(rows);
  if (error) {
    console.warn(JSON.stringify({ event: 'gct_output_tax_write_failed', error: error.message, orderId: input.orderId }));
  }
}

/** Reverse all non-reversed output rows for an order (cancel/refund). */
export async function reverseOrderOutputTax(sb: Sb, orderId: string): Promise<void> {
  const a = acct(sb);
  if (!a) return;

  const { data: originals } = await a
    .from('gct_output_tax')
    .select('*')
    .in('source_doc_type', ['delivery_order', 'delivery_order_platform'])
    .eq('source_doc_id', orderId)
    .is('reversal_of_id', null);

  if (!originals?.length) return;

  // Skip if already reversed
  const ids = originals.map((r: { id: string }) => r.id);
  const { data: existingRev } = await a
    .from('gct_output_tax')
    .select('id')
    .in('reversal_of_id', ids)
    .limit(1);
  if (existingRev?.length) return;

  const now = new Date().toISOString();
  const reversals = originals.map((r: Record<string, unknown>) => ({
    tax_point: now,
    source_doc_type: String(r.source_doc_type) + '_reversal',
    source_doc_id: orderId,
    supplier_entity_id: r.supplier_entity_id ?? null,
    recipient_ref: r.recipient_ref ?? null,
    supply_class: r.supply_class,
    base_amount_jmd: -Number(r.base_amount_jmd ?? 0),
    rate_percent: r.rate_percent,
    tax_amount_jmd: -Number(r.tax_amount_jmd ?? 0),
    period_id: r.period_id ?? null,
    reversal_of_id: r.id,
  }));

  const { error } = await a.from('gct_output_tax').insert(reversals);
  if (error) {
    console.warn(JSON.stringify({ event: 'gct_output_tax_reversal_failed', error: error.message, orderId }));
  }
}
