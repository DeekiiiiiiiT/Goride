/**
 * GCT input-tax ledger writers — Expense Hub → accounting.gct_input_tax.
 * Reversals are new rows (never delete).
 */

import { resolveCreditableInputTax, type InputTaxCreditRestriction } from './gctCore.ts';

type Sb = {
  schema?: (s: string) => { from: (t: string) => any };
  from: (t: string) => any;
};

function acct(sb: Sb) {
  return sb;
}

async function ensureOpenPeriodFor(
  a: ReturnType<typeof acct>,
  taxPoint: Date,
): Promise<string | null> {
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
    if (existing.status !== 'open') return null;
    return existing.id as string;
  }
  const { data: created } = await a
    .from('gct_periods')
    .insert({ period_start: periodStart, period_end: periodEnd, status: 'open' })
    .select('id')
    .single();
  return (created?.id as string) ?? null;
}

function restrictionFromCategory(category?: string | null): InputTaxCreditRestriction {
  const c = String(category || '').toLowerCase();
  if (c.includes('entertain') || c.includes('meal')) return 'entertainment';
  if (c.includes('vehicle') || c.includes('lease') || c.includes('motor')) return 'motor_vehicle';
  if (c.includes('capital') || c.includes('purchase')) return 'capital_24m';
  return 'none';
}

export type ExpenseInputTaxInput = {
  expenseDocId: string;
  vendorTrn?: string | null;
  vendorGctRegistered?: boolean;
  baseAmountJmd: number;
  taxAmountJmd: number;
  ratePercent?: number;
  incurredDate: string;
  category?: string | null;
  creditRestriction?: InputTaxCreditRestriction;
};

/** Shadow-write input tax when an expense with GCT is posted. */
export async function recordExpenseInputTax(sb: Sb, input: ExpenseInputTaxInput): Promise<void> {
  const tax = Number(input.taxAmountJmd);
  if (!Number.isFinite(tax) || tax <= 0) return;

  const trn = String(input.vendorTrn || '').trim();
  if (!trn || input.vendorGctRegistered === false) {
    console.warn(
      JSON.stringify({
        event: 'gct_input_tax_skipped',
        reason: !trn ? 'no_vendor_trn' : 'vendor_unregistered',
        expenseDocId: input.expenseDocId,
      }),
    );
    return;
  }

  const a = acct(sb);
  const sourceType = 'expense_doc';
  const { data: existing } = await a
    .from('gct_input_tax')
    .select('id')
    .eq('source_doc_type', sourceType)
    .eq('source_doc_id', input.expenseDocId)
    .is('reversal_of_id', null)
    .maybeSingle();
  if (existing) return;

  const taxPoint = new Date(input.incurredDate || Date.now());
  const periodId = await ensureOpenPeriodFor(a, taxPoint);
  const restriction = input.creditRestriction ?? restrictionFromCategory(input.category);
  const base = Math.max(0, Number(input.baseAmountJmd) || 0);
  const rate =
    input.ratePercent != null && Number.isFinite(Number(input.ratePercent))
      ? Number(input.ratePercent)
      : base > 0
      ? Math.round((tax / base) * 10000) / 100
      : 15;
  const creditable = resolveCreditableInputTax({
    taxAmountJmd: tax,
    restriction,
  });

  const { error } = await a.from('gct_input_tax').insert({
    tax_point: taxPoint.toISOString(),
    supplier_trn: trn,
    supplier_name: null,
    invoice_ref: `expense_doc:${input.expenseDocId}`,
    supply_class: 'standard',
    base_amount_jmd: Math.round(base * 100) / 100,
    rate_percent: rate,
    tax_amount_jmd: Math.round(tax * 100) / 100,
    creditable_amount_jmd: creditable,
    credit_restriction: restriction,
    period_id: periodId,
    source_ref: `expense_doc:${input.expenseDocId}`,
    source_doc_type: sourceType,
    source_doc_id: input.expenseDocId,
  });
  if (error) {
    console.warn(
      JSON.stringify({
        event: 'gct_input_tax_write_failed',
        error: error.message,
        expenseDocId: input.expenseDocId,
      }),
    );
  }
}

/** Reverse input tax for a voided expense document. */
export async function reverseExpenseInputTax(sb: Sb, expenseDocId: string): Promise<void> {
  const a = acct(sb);
  const { data: originals } = await a
    .from('gct_input_tax')
    .select('*')
    .eq('source_doc_type', 'expense_doc')
    .eq('source_doc_id', expenseDocId)
    .is('reversal_of_id', null);

  if (!originals?.length) return;

  const ids = originals.map((r: { id: string }) => r.id);
  const { data: existingRev } = await a
    .from('gct_input_tax')
    .select('id')
    .in('reversal_of_id', ids)
    .limit(1);
  if (existingRev?.length) return;

  const now = new Date().toISOString();
  const reversals = originals.map((r: Record<string, unknown>) => ({
    tax_point: now,
    supplier_trn: r.supplier_trn ?? null,
    supplier_name: r.supplier_name ?? null,
    invoice_ref: String(r.invoice_ref || '') + '_reversal',
    supply_class: r.supply_class ?? 'standard',
    base_amount_jmd: -Number(r.base_amount_jmd ?? 0),
    rate_percent: r.rate_percent,
    tax_amount_jmd: -Number(r.tax_amount_jmd ?? 0),
    creditable_amount_jmd: -Number(r.creditable_amount_jmd ?? 0),
    credit_restriction: r.credit_restriction ?? 'none',
    period_id: r.period_id ?? null,
    source_ref: `expense_doc:${expenseDocId}:reversal`,
    source_doc_type: 'expense_doc_reversal',
    source_doc_id: expenseDocId,
    reversal_of_id: r.id,
  }));

  const { error } = await a.from('gct_input_tax').insert(reversals);
  if (error) {
    console.warn(
      JSON.stringify({
        event: 'gct_input_tax_reversal_failed',
        error: error.message,
        expenseDocId,
      }),
    );
  }
}
