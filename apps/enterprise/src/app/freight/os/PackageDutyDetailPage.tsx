import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

function minorToUsd(n: unknown) {
  return Number(n ?? 0) / 100;
}

/** Package Detail — custody, invoice verify, landed-cost duty. */
export function PackageDutyDetailPage() {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [packageId, setPackageId] = useState(params.get('id') || '');
  const [note, setNote] = useState('');

  const packages = useQuery({
    queryKey: ['freight', 'packages', organizationId, 'duty-picker'],
    queryFn: () => freightService.listPackages(organizationId),
    enabled: Boolean(session),
  });

  useEffect(() => {
    const fromUrl = params.get('id');
    if (fromUrl && fromUrl !== packageId) setPackageId(fromUrl);
  }, [params, packageId]);

  useEffect(() => {
    if (!packageId && packages.data?.packages?.[0]) {
      const id = String(packages.data.packages[0].id);
      setPackageId(id);
      setParams({ id }, { replace: true });
    }
  }, [packages.data, packageId, setParams]);

  const detail = useQuery({
    queryKey: ['freight', 'package', organizationId, packageId],
    queryFn: () => freightService.getPackage(packageId, organizationId),
    enabled: Boolean(session && packageId),
  });

  const dutyQ = useQuery({
    queryKey: ['freight', 'duty', organizationId, packageId],
    queryFn: () => freightService.getPackageDuty(packageId, organizationId),
    enabled: Boolean(session && packageId),
  });

  const verify = useMutation({
    mutationFn: () => freightService.verifyInvoice(packageId, note || undefined, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'package', organizationId, packageId] });
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
    },
  });

  const compute = useMutation({
    mutationFn: () => freightService.computeDuty(packageId, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'duty', organizationId, packageId] });
    },
  });

  const pkg = detail.data?.package;
  const suite = pkg?.suites as
    | { suite_code?: string; contact_name?: string; trn?: string; trn_valid?: boolean }
    | undefined;
  const duty = dutyQ.data?.duty ?? compute.data?.duty ?? null;

  const dutyView = useMemo(() => {
    if (!duty) return null;
    return {
      aboveThreshold: Boolean(duty.above_threshold),
      cifUsd: minorToUsd(duty.cif_usd_minor),
      importDutyUsd: minorToUsd(duty.import_duty_usd_minor),
      scfUsd: minorToUsd(duty.scf_usd_minor),
      envUsd: minorToUsd(duty.env_usd_minor),
      gctUsd: minorToUsd(duty.gct_usd_minor),
      stampJmd: Number(duty.stamp_jmd_minor ?? 0) / 100,
      cafJmd: Number(duty.caf_jmd_minor ?? 0) / 100,
      totalDutyUsd: minorToUsd(duty.total_duty_usd_minor),
    };
  }, [duty]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label className="text-xs font-medium text-slate-500">Package</label>
          <select
            value={packageId}
            onChange={(e) => {
              setPackageId(e.target.value);
              setParams({ id: e.target.value });
            }}
            className="mt-1 w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          >
            {(packages.data?.packages ?? []).map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {String(p.courier_tracking_number ?? p.id)} · {String(p.status)}
              </option>
            ))}
          </select>
        </div>
        {pkg && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-700">
            {String(pkg.status).replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {!packageId && (
        <p className="text-sm text-slate-500">No packages yet — receive or create one first.</p>
      )}

      {detail.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(detail.error as Error).message}
        </p>
      )}

      {pkg && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Package</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Suite</dt>
                <dd className="font-medium">{suite?.suite_code ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Contact</dt>
                <dd className="font-medium">{suite?.contact_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">TRN</dt>
                <dd className="font-mono">
                  {suite?.trn ?? '—'}{' '}
                  {suite?.trn_valid === false && (
                    <span className="text-xs font-sans text-red-600">invalid</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Weight</dt>
                <dd className="tabular-nums">
                  {pkg.weight_lbs != null ? `${pkg.weight_lbs} lb` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Declared</dt>
                <dd className="tabular-nums">
                  US${minorToUsd(pkg.declared_value_usd_minor).toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Bin</dt>
                <dd className="font-mono">{String(pkg.bin_location ?? '—')}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Invoice audit</h2>
              <button
                type="button"
                disabled={verify.isPending || Boolean(pkg.invoice_verified_at)}
                onClick={() => verify.mutate()}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50"
              >
                {pkg.invoice_verified_at ? 'Verified' : 'Verify invoice'}
              </button>
            </div>
            <p className="mt-3 font-mono text-sm text-slate-700">
              {String(pkg.invoice_file_name || pkg.invoice_storage_path || 'No invoice on file')}
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={Boolean(pkg.invoice_verified_at)} readOnly className="rounded" />
              Verified against physical package
            </label>
            <textarea
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              placeholder="Mismatch notes…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {verify.error && (
              <p className="mt-2 text-xs text-red-700">{(verify.error as Error).message}</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Landed cost / duty</h2>
              <button
                type="button"
                disabled={compute.isPending || !packageId}
                onClick={() => compute.mutate()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Recalculate duty
              </button>
            </div>
            {compute.error && (
              <p className="mt-2 text-xs text-red-700">{(compute.error as Error).message}</p>
            )}
            {!dutyView ? (
              <p className="mt-3 text-sm text-slate-500">
                No duty snapshot yet — recalculate after invoice + value are set.
              </p>
            ) : (
              <>
                {dutyView.aboveThreshold ? (
                  <p className="mt-2 text-xs text-amber-800">
                    CIF above US$100 tax-free threshold
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-green-700">
                    CIF ≤ US$100 — primary import taxes waived
                  </p>
                )}
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <tbody>
                      {(
                        [
                          ['CIF', dutyView.cifUsd],
                          ['Import Duty', dutyView.importDutyUsd],
                          ['SCF 0.3%', dutyView.scfUsd],
                          ['ENV 0.5%', dutyView.envUsd],
                          ['GCT 15%', dutyView.gctUsd],
                          ['Stamp (J$)', dutyView.stampJmd],
                          ['CAF (J$)', dutyView.cafJmd],
                        ] as const
                      ).map(([label, val]) => (
                        <tr key={label} className="border-t border-slate-100">
                          <td className="py-2 text-slate-600">{label}</td>
                          <td className="py-2 text-right font-mono tabular-nums">
                            {label.includes('J$')
                              ? `J$${val.toFixed(0)}`
                              : `US$${val.toFixed(2)}`}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 font-semibold">
                        <td className="py-2">Total duty (USD equiv.)</td>
                        <td className="py-2 text-right font-mono">
                          US${dutyView.totalDutyUsd.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-slate-900">Custody timeline</h2>
            <ol className="mt-4 space-y-3">
              {(detail.data?.scanEvents ?? []).length === 0 ? (
                <li className="text-sm text-slate-500">No scan events yet</li>
              ) : (
                (detail.data?.scanEvents ?? []).map((ev) => (
                  <li key={String(ev.id)} className="flex gap-3 text-sm">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <div>
                      <p className="font-medium text-slate-900">
                        {String(ev.event_type || ev.note || 'Scan')}
                      </p>
                      <p className="font-mono text-xs text-slate-500">
                        {String(ev.occurred_at || '')}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
