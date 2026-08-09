import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { InvoiceFillSuggestions } from '@/app/freight/invoiceParse/InvoiceFillSuggestions';
import { parseRetailInvoice } from '@/app/freight/invoiceParse/parseRetailInvoice';
import type { InvoiceParseSuggestion } from '@/app/freight/invoiceParse/types';
import { DocRoleBadge } from '@/app/freight/os/packageDuty/DocRoleBadge';
import {
  DOC_ROLE,
  customerDocStatus,
  emptyDocCopy,
  warehouseDocStatus,
} from '@/app/freight/os/packageDuty/docRoles';

type Tab = 'required' | 'missing' | 'mismatch' | 'unobtainable' | 'ready';

/** Invoice Audit Queue — dual invoice workflow. */
export function InvoiceAuditQueuePage({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<Tab>('required');
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const [parseReading, setParseReading] = useState(false);
  const [suggestPkgId, setSuggestPkgId] = useState<string | null>(null);
  const [invoiceSuggestion, setInvoiceSuggestion] = useState<InvoiceParseSuggestion | null>(
    null,
  );

  const q = useQuery({
    queryKey: ['freight', 'invoice-audit', organizationId, tab],
    queryFn: () => freightService.invoiceAuditQueue(tab, organizationId),
    enabled: Boolean(session),
  });
  const verify = useMutation({
    mutationFn: (id: string) => freightService.verifyInvoice(id, undefined, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
    },
  });
  const upload = useMutation({
    mutationFn: ({
      id,
      file,
      slot,
    }: {
      id: string;
      file: File;
      slot: 'warehouse' | 'customer';
    }) => freightService.uploadPackageInvoice(id, file, organizationId, slot),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'package'] });
      if (vars.slot === 'customer') setTab('mismatch');
    },
  });
  const applyFill = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      freightService.updatePackage(id, body, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'package'] });
      setInvoiceSuggestion(null);
      setSuggestPkgId(null);
    },
  });
  const flags = useMutation({
    mutationFn: ({
      id,
      invoiceUnobtainable,
    }: {
      id: string;
      invoiceUnobtainable: boolean;
    }) =>
      freightService.setInvoiceFlags(
        id,
        { invoiceUnobtainable, unobtainableNote: 'Could not obtain from customer' },
        organizationId,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
      setTab('unobtainable');
    },
  });

  const rows = useMemo(() => q.data?.packages ?? [], [q.data]);

  async function handleCustomerUpload(id: string, file: File) {
    await upload.mutateAsync({ id, file, slot: 'customer' });
    setSuggestPkgId(id);
    setParseReading(true);
    setInvoiceSuggestion(null);
    try {
      setInvoiceSuggestion(await parseRetailInvoice(file));
    } finally {
      setParseReading(false);
    }
  }

  function applyParsedInvoiceFields() {
    if (!invoiceSuggestion || !suggestPkgId) return;
    const row = rows.find((r) => String(r.id) === suggestPkgId);
    const body: Record<string, unknown> = {};
    if (!String(row?.retailer ?? '').trim() && invoiceSuggestion.retailer) {
      body.retailer = invoiceSuggestion.retailer;
    }
    if (!String(row?.description ?? '').trim() && invoiceSuggestion.description) {
      body.description = invoiceSuggestion.description;
    }
    if (
      (row?.declared_value_usd_minor == null || Number(row.declared_value_usd_minor) === 0) &&
      invoiceSuggestion.declaredValueUsd != null
    ) {
      body.declaredValueUsdMinor = Math.round(invoiceSuggestion.declaredValueUsd * 100);
    }
    if (
      (row?.weight_lbs == null || Number(row.weight_lbs) === 0) &&
      invoiceSuggestion.weightLbs != null
    ) {
      body.weightLbs = invoiceSuggestion.weightLbs;
    }
    if (Object.keys(body).length === 0) {
      setInvoiceSuggestion(null);
      setSuggestPkgId(null);
      return;
    }
    applyFill.mutate({ id: suggestPkgId, body });
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Invoice Audit</h1>
          <p className="mt-1 text-sm text-slate-500">
            Queue is about the <span className="font-medium text-slate-700">customer commercial invoice</span>{' '}
            (seal gate). Warehouse packing slip is optional and never blocks seal.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Queue is about the <span className="font-medium text-slate-700">customer commercial invoice</span>{' '}
          (seal gate). Warehouse packing slip is optional.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['required', 'Customer invoice required'],
            ['missing', 'Awaiting customer invoice'],
            ['mismatch', 'Unverified'],
            ['unobtainable', 'Could not obtain'],
            ['ready', 'Ready for seal'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === id
                ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {q.isLoading && <p className="text-sm text-slate-500">Loading queue…</p>}
      {q.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(q.error as Error).message}
        </p>
      )}
      {(verify.error || upload.error || flags.error || applyFill.error) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(
            (verify.error || upload.error || flags.error || applyFill.error) as Error
          ).message}
        </p>
      )}

      {(parseReading || invoiceSuggestion) && (
        <InvoiceFillSuggestions
          reading={parseReading}
          applying={applyFill.isPending}
          suggestion={
            invoiceSuggestion ?? {
              source: 'pdf_text',
              retailer: null,
              description: null,
              declaredValueUsd: null,
              weightLbs: null,
              currencyHint: null,
              confidence: 'none',
              warnings: [],
              itemLabels: [],
            }
          }
          onApply={applyParsedInvoiceFields}
          onDismiss={() => {
            setInvoiceSuggestion(null);
            setSuggestPkgId(null);
          }}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!q.isLoading && rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">Queue clear for this tab.</div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Tracking</th>
                <th className="px-4 py-2">Suite</th>
                <th className="px-4 py-2">{DOC_ROLE.warehouse_slip.shortLabel}</th>
                <th className="px-4 py-2">{DOC_ROLE.customer_invoice.shortLabel}</th>
                <th className="px-4 py-2">Declared USD</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row.id);
                const suite = row.suites as { suite_code?: string } | null;
                const declared = Number(row.declared_value_usd_minor ?? 0) / 100;
                const hasWh = Boolean(
                  row.warehouse_invoice_file_name || row.warehouse_invoice_storage_path,
                );
                const hasCust = Boolean(row.invoice_file_name || row.invoice_storage_path);
                const whStatus = warehouseDocStatus(hasWh);
                const custStatus = customerDocStatus({
                  hasFile: hasCust,
                  verified: Boolean(row.invoice_verified_at),
                  unobtainable: Boolean(row.invoice_unobtainable_at),
                  requiredFromCustomer: Boolean(row.invoice_required_from_customer),
                  context: 'seal',
                });
                const wh = String(row.warehouse_invoice_file_name || '');
                const cust = String(row.invoice_file_name || '');
                return (
                  <tr key={id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {String(row.courier_tracking_number ?? '—')}
                    </td>
                    <td className="px-4 py-2.5">{suite?.suite_code ?? '—'}</td>
                    <td className="max-w-[10rem] px-4 py-2.5 text-xs text-slate-600">
                      <div className="flex flex-col gap-1">
                        <DocRoleBadge status={whStatus} />
                        <span className={`truncate ${hasWh ? 'font-mono' : 'text-slate-400'}`}>
                          {hasWh ? wh : emptyDocCopy('warehouse_slip', whStatus)}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[10rem] px-4 py-2.5 text-xs text-slate-600">
                      <div className="flex flex-col gap-1">
                        <DocRoleBadge status={custStatus} />
                        <span
                          className={`truncate ${
                            hasCust
                              ? 'font-mono'
                              : custStatus === 'blocking'
                                ? 'font-medium text-amber-900'
                                : 'text-slate-400'
                          }`}
                        >
                          {hasCust ? cust : emptyDocCopy('customer_invoice', custStatus)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">${declared.toFixed(2)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/app/packages/${id}`}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                        >
                          Compare
                        </Link>
                        {(tab === 'required' || tab === 'missing' || tab === 'mismatch') && (
                          <>
                            <label className="cursor-pointer rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50">
                              Customer commercial invoice
                              <input
                                type="file"
                                accept="application/pdf,image/*"
                                className="sr-only"
                                disabled={upload.isPending}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (file) void handleCustomerUpload(id, file);
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              disabled={flags.isPending}
                              onClick={() =>
                                flags.mutate({ id, invoiceUnobtainable: true })
                              }
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                            >
                              Could not obtain
                            </button>
                          </>
                        )}
                        {tab === 'mismatch' ? (
                          <button
                            type="button"
                            disabled={verify.isPending}
                            onClick={() => verify.mutate(id)}
                            className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-slate-950 disabled:opacity-60"
                          >
                            Mark verified
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
