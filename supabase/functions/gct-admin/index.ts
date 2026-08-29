/**
 * GCT Admin API — Dominion Accounting → GCT engine
 */

import { Hono } from 'https://deno.land/x/hono@v4.3.11/mod.ts';
import { cors } from 'https://deno.land/x/hono@v4.3.11/middleware.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requirePlatformAdmin } from '../_shared/platformAdmin.ts';
import {
  resolveRatePercentAsOf,
  resolveCreditableInputTax,
  type GctRateRow,
  type GctSupplyClass,
  type InputTaxCreditRestriction,
} from '../_shared/gctCore.ts';
import { loadGlobalGctConfig } from '../_shared/gctRate.ts';

const app = new Hono().basePath('/gct-admin');
app.use('*', cors());

const WRITE_ROLES = new Set(['platform_owner', 'superadmin']);

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

function acct(sb: SupabaseClient) {
  return sb.schema('accounting');
}

app.get('/health', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const sb = svc();
  const a = acct(sb);
  const config = await loadGlobalGctConfig(sb);

  const [{ data: flags }, { data: needsReview }, { count: openPeriods }, { data: rateRows }] =
    await Promise.all([
      a.from('gct_engine_flags').select('value').eq('key', 'resolver').maybeSingle(),
      a
        .from('gct_entities')
        .select('id, entity_type, entity_id, trn, registered, needs_review, notes')
        .eq('needs_review', true)
        .limit(50),
      a.from('gct_periods').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      a
        .from('gct_rates')
        .select('supply_class, rate_percent, effective_from, effective_to')
        .eq('supply_class', 'standard'),
    ]);

  let dbStandard: number | null = null;
  try {
    if (rateRows?.length) {
      const rows: GctRateRow[] = rateRows.map((r: Record<string, unknown>) => ({
        supplyClass: r.supply_class as GctSupplyClass,
        ratePercent: Number(r.rate_percent),
        effectiveFrom: String(r.effective_from).slice(0, 10),
        effectiveTo: r.effective_to ? String(r.effective_to).slice(0, 10) : null,
      }));
      dbStandard = resolveRatePercentAsOf(rows, 'standard', new Date());
    }
  } catch {
    dbStandard = null;
  }

  return c.json({
    ok: true,
    effectiveRatePercent: config.ratePercent,
    gctEnabled: config.enabled,
    fromDb: config.fromDb ?? false,
    sourceDisagreement: config.sourceDisagreement ?? false,
    kvRatePercent: config.kvRatePercent ?? null,
    dbStandardRatePercent: dbStandard,
    resolverFlags: (flags as { value?: unknown } | null)?.value ?? null,
    needsReviewEntities: needsReview ?? [],
    openPeriodCount: openPeriods ?? 0,
  });
});

app.get('/rates', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const a = acct(svc());
  const [{ data: rates, error }, { data: classes }] = await Promise.all([
    a
      .from('gct_rates')
      .select('*')
      .order('supply_class')
      .order('effective_from', { ascending: false }),
    a.from('gct_supply_classes').select('*').order('code'),
  ]);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ rates: rates ?? [], classes: classes ?? [] });
});

app.post('/rates', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!WRITE_ROLES.has(auth.role)) {
    return c.json({ error: 'Only platform_owner can append rates' }, 403);
  }

  const body = await c.req.json();
  const supplyClass = String(body.supply_class || body.supplyClass || '').trim();
  const ratePercent = Number(body.rate_percent ?? body.ratePercent);
  const effectiveFrom = String(body.effective_from || body.effectiveFrom || '').slice(0, 10);
  const effectiveTo = body.effective_to || body.effectiveTo
    ? String(body.effective_to || body.effectiveTo).slice(0, 10)
    : null;
  const authority = String(body.authority || '').trim();

  if (!supplyClass || !Number.isFinite(ratePercent) || !effectiveFrom) {
    return c.json({ error: 'supply_class, rate_percent, effective_from required' }, 400);
  }

  const a = acct(svc());
  const priorEnd = new Date(new Date(effectiveFrom + 'T12:00:00Z').getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  await a
    .from('gct_rates')
    .update({ effective_to: priorEnd })
    .eq('supply_class', supplyClass)
    .is('effective_to', null)
    .lt('effective_from', effectiveFrom);

  const { data, error } = await a
    .from('gct_rates')
    .insert({
      supply_class: supplyClass,
      rate_percent: ratePercent,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      authority,
      created_by: auth.id,
    })
    .select('*')
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ rate: data });
});

app.get('/entities', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const a = acct(svc());
  const needsReview = c.req.query('needs_review') === '1';
  let q = a.from('gct_entities').select('*').order('updated_at', { ascending: false }).limit(200);
  if (needsReview) q = q.eq('needs_review', true);
  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ entities: data ?? [] });
});

app.patch('/entities/:id', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!WRITE_ROLES.has(auth.role)) {
    return c.json({ error: 'Only platform_owner can update registrations' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.trn != null) patch.trn = String(body.trn).trim() || null;
  if (body.registered != null) patch.registered = Boolean(body.registered);
  if (body.needs_review != null || body.needsReview != null) {
    patch.needs_review = Boolean(body.needs_review ?? body.needsReview);
  }
  if (body.evidence_url != null || body.evidenceUrl != null) {
    patch.evidence_url = body.evidence_url ?? body.evidenceUrl;
  }
  if (body.notes != null) patch.notes = body.notes;
  if (body.registered_from != null || body.registeredFrom != null) {
    patch.registered_from = body.registered_from ?? body.registeredFrom;
  }
  if (patch.registered === true) {
    const trn = patch.trn ?? body.trn;
    if (!trn || String(trn).trim() === '') {
      return c.json({ error: 'TRN required when registered=true' }, 400);
    }
    patch.trn = String(trn).trim();
    patch.verified_by = auth.id;
    patch.verified_at = new Date().toISOString();
  }

  const a = acct(svc());
  const { data, error } = await a.from('gct_entities').update(patch).eq('id', id).select('*').single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ entity: data });
});

app.get('/threshold-watchlist', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const sb = svc();
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const sinceIso = since.toISOString();

  const { data: orders, error } = await sb
    .from('orders')
    .select('merchant_id, total_jmd, subtotal_jmd, created_at')
    .gte('created_at', sinceIso)
    .limit(20000);

  if (error) {
    return c.json({ error: error.message, watchlist: [], thresholdJmd: 15_000_000 }, 200);
  }

  const totals = new Map<string, number>();
  for (const o of orders ?? []) {
    const mid = String((o as { merchant_id?: string }).merchant_id ?? '');
    if (!mid) continue;
    const amt = Number(
      (o as { total_jmd?: number }).total_jmd ??
        (o as { subtotal_jmd?: number }).subtotal_jmd ??
        0,
    );
    totals.set(mid, (totals.get(mid) ?? 0) + (Number.isFinite(amt) ? amt : 0));
  }

  const THRESHOLD = 15_000_000;
  const watchlist = [...totals.entries()]
    .map(([merchantId, rollingSuppliesJmd]) => ({
      merchantId,
      rollingSuppliesJmd: Math.round(rollingSuppliesJmd * 100) / 100,
      thresholdJmd: THRESHOLD,
      ratio: rollingSuppliesJmd / THRESHOLD,
      advisory:
        rollingSuppliesJmd >= THRESHOLD
          ? 'over_threshold'
          : rollingSuppliesJmd >= THRESHOLD * 0.8
          ? 'approaching'
          : 'ok',
    }))
    .filter((r) => r.advisory !== 'ok')
    .sort((a, b) => b.rollingSuppliesJmd - a.rollingSuppliesJmd);

  return c.json({ watchlist, thresholdJmd: THRESHOLD });
});

app.get('/ledger', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const a = acct(svc());
  const kind = c.req.query('kind') || 'output';
  const periodId = c.req.query('period_id');
  const limit = Math.min(500, Number(c.req.query('limit') || 100));

  if (kind === 'input') {
    let q = a.from('gct_input_tax').select('*').order('tax_point', { ascending: false }).limit(limit);
    if (periodId) q = q.eq('period_id', periodId);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ rows: data ?? [] });
  }

  let q = a.from('gct_output_tax').select('*').order('tax_point', { ascending: false }).limit(limit);
  if (periodId) q = q.eq('period_id', periodId);
  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ rows: data ?? [] });
});

app.get('/periods', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const a = acct(svc());
  const { data, error } = await a
    .from('gct_periods')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(36);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ periods: data ?? [] });
});

app.post('/periods/ensure-month', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const body = await c.req.json().catch(() => ({}));
  const ref = body.year && body.month
    ? new Date(Number(body.year), Number(body.month) - 1, 1)
    : new Date();
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = end.toISOString().slice(0, 10);

  const a = acct(svc());
  const { data: existing } = await a
    .from('gct_periods')
    .select('*')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();
  if (existing) return c.json({ period: existing, created: false });

  const { data, error } = await a
    .from('gct_periods')
    .insert({ period_start: periodStart, period_end: periodEnd, status: 'open' })
    .select('*')
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ period: data, created: true });
});

app.post('/periods/:id/close', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!WRITE_ROLES.has(auth.role)) {
    return c.json({ error: 'Only platform_owner can close periods' }, 403);
  }

  const id = c.req.param('id');
  const a = acct(svc());
  const { data: period, error: pErr } = await a.from('gct_periods').select('*').eq('id', id).single();
  if (pErr || !period) return c.json({ error: 'Period not found' }, 404);
  if (period.status !== 'open') return c.json({ error: 'Period is not open' }, 400);

  const [{ data: outputs }, { data: inputs }] = await Promise.all([
    a.from('gct_output_tax').select('tax_amount_jmd').eq('period_id', id),
    a.from('gct_input_tax').select('creditable_amount_jmd').eq('period_id', id),
  ]);

  const outputTotal = (outputs ?? []).reduce(
    (s: number, r: { tax_amount_jmd?: number }) => s + Number(r.tax_amount_jmd ?? 0),
    0,
  );
  const inputTotal = (inputs ?? []).reduce(
    (s: number, r: { creditable_amount_jmd?: number }) => s + Number(r.creditable_amount_jmd ?? 0),
    0,
  );
  const net = Math.round((outputTotal - inputTotal) * 100) / 100;

  const { data, error } = await a
    .from('gct_periods')
    .update({
      status: 'closed',
      output_total_jmd: Math.round(outputTotal * 100) / 100,
      input_total_jmd: Math.round(inputTotal * 100) / 100,
      net_payable_jmd: net,
      filed_at: new Date().toISOString(),
      filed_by: auth.id,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({
    period: data,
    form4a: {
      periodStart: data.period_start,
      periodEnd: data.period_end,
      outputTaxJmd: data.output_total_jmd,
      inputTaxJmd: data.input_total_jmd,
      netPayableJmd: data.net_payable_jmd,
    },
  });
});

app.post('/input-tax', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!WRITE_ROLES.has(auth.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json();
  const taxAmount = Number(body.tax_amount_jmd ?? body.taxAmountJmd ?? 0);
  const restriction = String(
    body.credit_restriction ?? body.creditRestriction ?? 'none',
  ) as InputTaxCreditRestriction;
  const creditable = resolveCreditableInputTax({
    taxAmountJmd: taxAmount,
    restriction,
    creditFraction: body.credit_fraction ?? body.creditFraction,
  });

  const a = acct(svc());
  const { data, error } = await a
    .from('gct_input_tax')
    .insert({
      tax_point: body.tax_point ?? body.taxPoint ?? new Date().toISOString(),
      supplier_trn: body.supplier_trn ?? body.supplierTrn ?? null,
      base_amount_jmd: Number(body.base_amount_jmd ?? body.baseAmountJmd ?? 0),
      rate_percent: Number(body.rate_percent ?? body.ratePercent ?? 15),
      tax_amount_jmd: taxAmount,
      credit_restriction: restriction,
      creditable_amount_jmd: creditable,
      period_id: body.period_id ?? body.periodId ?? null,
      evidence_url: body.evidence_url ?? body.evidenceUrl ?? null,
      source_ref: body.source_ref ?? body.sourceRef ?? null,
    })
    .select('*')
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ row: data });
});

app.post('/resolver-flags', async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!WRITE_ROLES.has(auth.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json();
  const value = {
    prefer_db: body.prefer_db !== false,
    kv_fallback: body.kv_fallback !== false,
    db_authoritative: body.db_authoritative === true,
  };
  const a = acct(svc());
  const { data, error } = await a
    .from('gct_engine_flags')
    .upsert({ key: 'resolver', value, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ flags: data });
});

app.get('/config', async (c) => {
  const sb = svc();
  const config = await loadGlobalGctConfig(sb);
  return c.json({
    ratePercent: config.ratePercent,
    enabled: config.enabled,
    supplyClass: 'standard',
    fromDb: config.fromDb ?? false,
  });
});

Deno.serve(app.fetch);
