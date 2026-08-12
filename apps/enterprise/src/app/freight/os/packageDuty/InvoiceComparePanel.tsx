import { InvoiceFillSuggestions } from '@/app/freight/invoiceParse/InvoiceFillSuggestions';
import type { InvoiceParseSuggestion } from '@/app/freight/invoiceParse/types';
import { DocRoleBadge } from './DocRoleBadge';
import {
  DOC_ROLE,
  customerDocStatus,
  fileDisplayName,
  sealReadinessLines,
  warehouseDocStatus,
} from './docRoles';

type Props = {
  packageId: string;
  pkg: Record<string, unknown>;
  hasCustomerInvoice: boolean;
  hasWarehouseSlip: boolean;
  requiredFromCustomer: boolean;
  unobtainable: boolean;
  note: string;
  setNote: (v: string) => void;
  unobtainableNote: string;
  setUnobtainableNote: (v: string) => void;
  parseReading: boolean;
  invoiceSuggestion: InvoiceParseSuggestion | null;
  setInvoiceSuggestion: (v: InvoiceParseSuggestion | null) => void;
  uploadPending: boolean;
  verifyPending: boolean;
  flagsPending: boolean;
  applyPending: boolean;
  applyError?: Error | null;
  verifyError?: Error | null;
  uploadError?: Error | null;
  flagsError?: Error | null;
  onUpload: (file: File, slot: 'warehouse' | 'customer') => void;
  onApplyFill: () => void;
  onVerify: () => void;
  onToggleRequired: () => void;
  onMarkUnobtainable: () => void;
  onClearUnobtainable: () => void;
};

export function InvoiceComparePanel({
  packageId,
  pkg,
  hasCustomerInvoice,
  hasWarehouseSlip,
  requiredFromCustomer,
  unobtainable,
  note,
  setNote,
  unobtainableNote,
  setUnobtainableNote,
  parseReading,
  invoiceSuggestion,
  setInvoiceSuggestion,
  uploadPending,
  verifyPending,
  flagsPending,
  applyPending,
  applyError,
  verifyError,
  uploadError,
  flagsError,
  onUpload,
  onApplyFill,
  onVerify,
  onToggleRequired,
  onMarkUnobtainable,
  onClearUnobtainable,
}: Props) {
  const verified = Boolean(pkg.invoice_verified_at);
  const customerStatus = customerDocStatus({
    hasFile: hasCustomerInvoice,
    verified,
    unobtainable,
    requiredFromCustomer,
    context: 'seal',
  });
  const warehouseStatus = warehouseDocStatus(hasWarehouseSlip);
  const readiness = sealReadinessLines({
    hasCustomerFile: hasCustomerInvoice,
    hasWarehouseSlip,
    verified,
    unobtainable,
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {requiredFromCustomer && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
            Soft hold · customer invoice
          </span>
        )}
        {unobtainable && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200">
            Could not obtain
          </span>
        )}
        {verified && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200">
            Verified for seal
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Seal readiness
        </p>
        {readiness.map((line) => (
          <p
            key={line.text}
            className={`text-xs ${
              line.tone === 'warn'
                ? 'font-medium text-amber-900'
                : line.tone === 'ok'
                  ? 'text-emerald-800'
                  : 'text-slate-500'
            }`}
          >
            {line.text}
          </p>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div
          className={`rounded-lg border p-4 ${
            warehouseStatus === 'ok'
              ? 'border-slate-200 bg-slate-50/60'
              : 'border-slate-200 bg-slate-50/40'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {DOC_ROLE.warehouse_slip.label}
            </h3>
            <div className="flex items-center gap-2">
              <DocRoleBadge status={warehouseStatus} />
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50">
                {uploadPending ? 'Uploading…' : hasWarehouseSlip ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="sr-only"
                  disabled={uploadPending || !packageId}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onUpload(file, 'warehouse');
                  }}
                />
              </label>
            </div>
          </div>
          <p
            className={`mt-2 text-sm ${
              hasWarehouseSlip ? 'font-mono text-slate-800' : 'text-slate-500'
            }`}
          >
            {fileDisplayName(
              'warehouse_slip',
              pkg.warehouse_invoice_file_name as string | undefined,
              pkg.warehouse_invoice_storage_path as string | undefined,
              warehouseStatus,
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">{DOC_ROLE.warehouse_slip.purpose}</p>
        </div>

        <div
          className={`rounded-lg border p-4 ${
            customerStatus === 'blocking'
              ? 'border-amber-200 bg-amber-50/40'
              : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {DOC_ROLE.customer_invoice.label}
            </h3>
            <div className="flex items-center gap-2">
              <DocRoleBadge status={customerStatus} />
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50">
                {uploadPending ? 'Uploading…' : hasCustomerInvoice ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="sr-only"
                  disabled={uploadPending || !packageId}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onUpload(file, 'customer');
                  }}
                />
              </label>
            </div>
          </div>
          <p
            className={`mt-2 text-sm ${
              hasCustomerInvoice ? 'font-mono text-slate-800' : 'font-medium text-amber-950'
            }`}
          >
            {fileDisplayName(
              'customer_invoice',
              pkg.invoice_file_name as string | undefined,
              pkg.invoice_storage_path as string | undefined,
              customerStatus,
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">{DOC_ROLE.customer_invoice.purpose}</p>
        </div>
      </div>

      {(parseReading || invoiceSuggestion) && (
        <div className="mt-4">
          <InvoiceFillSuggestions
            reading={parseReading}
            applying={applyPending}
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
                externalOrderNumber: null,
                suiteCode: null,
                shipTo: null,
                orderTotalUsd: null,
                lines: [],
              }
            }
            onApply={onApplyFill}
            onDismiss={() => setInvoiceSuggestion(null)}
          />
        </div>
      )}

      {applyError && (
        <p className="mt-2 text-xs text-red-700">{applyError.message}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={flagsPending}
          onClick={onToggleRequired}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          {requiredFromCustomer
            ? 'Clear soft hold (customer invoice)'
            : 'Mark customer invoice required'}
        </button>
        <button
          type="button"
          disabled={verifyPending || verified || !hasCustomerInvoice}
          onClick={onVerify}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50"
        >
          {verified ? 'Verified' : 'Verify customer invoice'}
        </button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={verified} readOnly className="rounded" />
        Verified against physical package (seal gate)
      </label>
      <textarea
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        rows={2}
        placeholder="Mismatch notes…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-3">
        <p className="text-xs font-medium text-slate-600">
          Could not get a customer commercial invoice?
        </p>
        <textarea
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          rows={2}
          placeholder="Note (e.g. customer unreachable)…"
          value={unobtainableNote}
          onChange={(e) => setUnobtainableNote(e.target.value)}
          disabled={unobtainable}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {!unobtainable ? (
            <button
              type="button"
              disabled={flagsPending}
              onClick={onMarkUnobtainable}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              Mark could not obtain
            </button>
          ) : (
            <button
              type="button"
              disabled={flagsPending}
              onClick={onClearUnobtainable}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              Clear unobtainable
            </button>
          )}
        </div>
        {unobtainable && pkg.invoice_unobtainable_note != null && (
          <p className="mt-2 text-xs text-slate-500">
            Note: {String(pkg.invoice_unobtainable_note)}
          </p>
        )}
      </div>

      {(verifyError || uploadError || flagsError) && (
        <p className="mt-2 text-xs text-red-700">
          {(verifyError || uploadError || flagsError)?.message}
        </p>
      )}
    </div>
  );
}
