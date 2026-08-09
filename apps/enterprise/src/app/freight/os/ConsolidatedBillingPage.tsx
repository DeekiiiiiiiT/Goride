import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

function usd(n: unknown) {
  return Number(n ?? 0) / 100;
}

/** Dual-ledger consolidated billing — generate from package. */
export function ConsolidatedBillingPage() {
  const { organizationId, session } = useAuth();
  const [params, setParams] = useSearchParams();
  const urlPackageId = params.get('packageId') || '';
  const wantAutogenerate = params.get('autogenerate') === '1';
  const [packageId, setPackageId] = useState(urlPackageId);
  const [invoiceId, setInvoiceId] = useState('');
  const autoRan = useRef(false);

  const packages = useQuery({
    queryKey: ['freight', 'packages', organizationId, 'billing'],
    queryFn: () => freightService.listPackages(organizationId),
    enabled: Boolean(session),
  });

  // URL wins when present; otherwise first package in list
  useEffect(() => {
    if (urlPackageId && urlPackageId !== packageId) {
      setPackageId(urlPackageId);
      setInvoiceId('');
      return;
    }
    if (!packageId && packages.data?.packages?.[0]) {
      const id = String(packages.data.packages[0].id);
      setPackageId(id);
      setParams({ packageId: id }, { replace: true });
    }
  }, [urlPackageId, packages.data, packageId, setParams]);

  const create = useMutation({
    mutationFn: () =>
      freightService.createConsolidatedInvoice({ packageId }, organizationId),
    onSuccess: (res) => {
      setInvoiceId(String(res.invoice.id));
    },
  });

  // One-shot autogenerate from package workspace deep link
  useEffect(() => {
    if (!wantAutogenerate || !packageId || autoRan.current) return;
    if (create.isPending || create.isSuccess || invoiceId) return;
    autoRan.current = true;
    create.mutate();
    // Strip autogenerate so refresh doesn't double-create
    setParams({ packageId }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot; mutate identity is stable
  }, [wantAutogenerate, packageId, create.isPending, create.isSuccess, invoiceId, setParams]);

  const existing = useQuery({
    queryKey: ['freight', 'billing-invoice', organizationId, invoiceId],
    queryFn: () => freightService.getConsolidatedInvoice(invoiceId, organizationId),
    enabled: Boolean(session && invoiceId),
  });

  const invoice = create.data?.invoice ?? existing.data?.invoice;
  const lines = create.data?.lines ?? existing.data?.lines ?? [];

  const courier = useMemo(
    () => lines.filter((l) => l.ledger === 'courier_revenue'),
    [lines],
  );
  const government = useMemo(
    () => lines.filter((l) => l.ledger === 'government_passthrough'),
    [lines],
  );

  const fx = Number(invoice?.fx_usd_jmd ?? 155);
  const courierTotal = usd(invoice?.courier_total_usd_minor);
  const govTotal = usd(invoice?.government_total_usd_minor);
  const grand = usd(invoice?.grand_total_usd_minor);

  function selectPackage(next: string) {
    setPackageId(next);
    setInvoiceId('');
    autoRan.current = false;
    setParams(next ? { packageId: next } : {}, { replace: true });
  }

  function printInvoice() {
    window.print();
  }

  function exportCsv() {
    if (!invoice) return;
    const header = 'ledger,code,label,usd,jmd\n';
    const body = lines
      .map(
        (l) =>
          `${l.ledger},${l.code},"${String(l.label).replace(/"/g, '""')}",${usd(l.amount_usd_minor).toFixed(2)},${(Number(l.amount_jmd_minor ?? 0) / 100).toFixed(2)}`,
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(invoice.invoice_number)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
          <p className="mt-1 text-sm text-slate-500">
            Split courier fees from government pass-through
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!invoice}
            onClick={printInvoice}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            Print
          </button>
          <button
            type="button"
            disabled={!invoice}
            onClick={exportCsv}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            Export
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="min-w-[240px] flex-1">
          <label className="text-xs font-medium text-slate-500">Package</label>
          <select
            value={packageId}
            onChange={(e) => selectPackage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {(packages.data?.packages ?? []).map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {String(p.courier_tracking_number ?? p.id)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!packageId || create.isPending}
          onClick={() => create.mutate()}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {create.isPending ? 'Generating…' : 'Generate invoice'}
        </button>
      </div>

      {create.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(create.error as Error).message}
        </p>
      )}

      {invoice && (
        <>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">{String(invoice.invoice_number)}</span>
            {' · '}
            FX 1 USD = J${fx.toFixed(2)}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Courier revenue</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {courier.map((line) => (
                  <li
                    key={String(line.id ?? line.code)}
                    className="flex justify-between border-b border-slate-100 py-2"
                  >
                    <span className="text-slate-600">{String(line.label)}</span>
                    <span className="font-mono tabular-nums">
                      US${usd(line.amount_usd_minor).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between text-sm font-semibold">
                <span>Subtotal</span>
                <span className="font-mono">
                  US${courierTotal.toFixed(2)} · J${(courierTotal * fx).toFixed(0)}
                </span>
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Government pass-through</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {government.length === 0 ? (
                  <li className="py-2 text-slate-500">No duty lines (below threshold or unset)</li>
                ) : (
                  government.map((line) => (
                    <li
                      key={String(line.id ?? line.code)}
                      className="flex justify-between border-b border-slate-100 py-2"
                    >
                      <span className="text-slate-600">{String(line.label)}</span>
                      <span className="font-mono tabular-nums">
                        US${usd(line.amount_usd_minor).toFixed(2)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <p className="mt-3 flex justify-between text-sm font-semibold">
                <span>Subtotal</span>
                <span className="font-mono">
                  US${govTotal.toFixed(2)} · J${(govTotal * fx).toFixed(0)}
                </span>
              </p>
            </section>
          </div>

          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-5 py-4">
            <p className="flex justify-between text-base font-bold text-slate-900">
              <span>Grand total due</span>
              <span className="font-mono">
                US${grand.toFixed(2)} · J${(grand * fx).toFixed(0)}
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
