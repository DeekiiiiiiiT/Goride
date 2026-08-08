import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

/** Manifest Builder + Validation Gatekeeper — wired for seal/AWBOLDS/JCA. */
export function ManifestGatekeeperPage() {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const manifests = useQuery({
    queryKey: ['freight', 'manifests', organizationId],
    queryFn: () => freightService.listManifests(organizationId),
    enabled: Boolean(session),
  });
  const openManifests = useMemo(
    () =>
      (manifests.data?.manifests ?? []).filter((m) =>
        ['open', 'sealed', 'shipped'].includes(String(m.status)),
      ),
    [manifests.data],
  );
  const [manifestId, setManifestId] = useState('');
  const activeId = manifestId || String(openManifests[0]?.id ?? '');

  const readiness = useQuery({
    queryKey: ['freight', 'readiness', organizationId, activeId],
    queryFn: () => freightService.manifestReadiness(activeId, organizationId),
    enabled: Boolean(session && activeId),
  });

  const detail = useQuery({
    queryKey: ['freight', 'manifest', organizationId, activeId],
    queryFn: () => freightService.getManifest(activeId, organizationId),
    enabled: Boolean(session && activeId),
  });

  const seal = useMutation({
    mutationFn: () => freightService.sealManifest(activeId, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight'] });
    },
  });
  const awbolds = useMutation({
    mutationFn: () => freightService.generateAwbolds(activeId, organizationId),
    onSuccess: (res) => {
      const blob = new Blob([res.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${String(detail.data?.manifest.manifest_number ?? 'manifest')}-awbolds.xml`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  const submitJca = useMutation({
    mutationFn: () => freightService.submitJca(activeId, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight'] });
    },
  });

  const blockers = readiness.data?.blockers ?? [];
  const canSeal = readiness.data?.canSeal === true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Manifest Builder</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pack container · validate · AWBOLDS / Submit to JCA
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Manifest</label>
        <select
          value={activeId}
          onChange={(e) => setManifestId(e.target.value)}
          className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {openManifests.length === 0 ? (
            <option value="">No open/sealed manifests</option>
          ) : (
            openManifests.map((m) => (
              <option key={String(m.id)} value={String(m.id)}>
                {String(m.manifest_number)} · {String(m.status)} · MAWB{' '}
                {String(m.awb_or_bl || '—')}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Flight / voyage</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">MAWB</dt>
                <dd className="font-mono font-medium">
                  {String(detail.data?.manifest.awb_or_bl || '—')}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Carrier</dt>
                <dd className="font-medium">
                  {String(detail.data?.manifest.carrier_name || '—')}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="font-medium">{String(detail.data?.manifest.status || '—')}</dd>
              </div>
            </dl>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">
                Lines ({detail.data?.lines?.length ?? 0})
              </h2>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Tracking</th>
                  <th className="px-4 py-2">Suite</th>
                  <th className="px-4 py-2">Weight</th>
                </tr>
              </thead>
              <tbody>
                {(detail.data?.lines ?? []).map((line) => {
                  const pkg = line.packages as Record<string, unknown> | undefined;
                  const suite = pkg?.suites as { suite_code?: string } | undefined;
                  return (
                    <tr key={String(line.id)} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">{String(line.line_number)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {String(pkg?.courier_tracking_number ?? '—')}
                      </td>
                      <td className="px-4 py-2.5">{suite?.suite_code ?? '—'}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {pkg?.weight_lbs != null ? `${pkg.weight_lbs} lb` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-5 lg:sticky lg:top-20 lg:self-start">
          <h2 className="text-sm font-semibold text-slate-900">Validation Gatekeeper</h2>
          <p className="mt-1 text-xs text-slate-500">
            {readiness.data
              ? `${readiness.data.readyCount}/${readiness.data.total} packages ready`
              : 'Select a manifest'}
          </p>

          <div className="mt-4 space-y-2">
            {blockers.length === 0 && readiness.data ? (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                No blockers — seal enabled
              </p>
            ) : (
              blockers.map((b) => (
                <div
                  key={`${b.packageId}-${b.code}`}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs"
                >
                  <p className="font-semibold text-red-800">{b.message}</p>
                  <p className="font-mono text-red-700">{b.tracking}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 space-y-2">
            <button
              type="button"
              disabled={!canSeal || !activeId || seal.isPending}
              onClick={() => seal.mutate()}
              className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Seal Manifest
            </button>
            <button
              type="button"
              disabled={!activeId || awbolds.isPending}
              onClick={() => awbolds.mutate()}
              className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Download AWBOLDS XML
            </button>
            <button
              type="button"
              disabled={!activeId || submitJca.isPending}
              onClick={() => submitJca.mutate()}
              className="w-full rounded-lg border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50"
            >
              Submit to JCA
            </button>
            {(seal.error || awbolds.error || submitJca.error) && (
              <p className="text-xs text-red-700">
                {((seal.error || awbolds.error || submitJca.error) as Error).message}
              </p>
            )}
            {submitJca.data?.result && (
              <p className="text-xs text-green-700">
                JCA {submitJca.data.result.status}
                {submitJca.data.result.jcaRef
                  ? ` · ${submitJca.data.result.jcaRef}`
                  : ''}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
