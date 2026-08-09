import { type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

/** Seal & submit sidebar — readiness, blockers, Seal, AWBOLDS, JCA (+ optional customs/status slots). */
export function ManifestGatekeeperPanel({
  manifestId,
  extraActions,
}: {
  manifestId: string;
  /** Slot below JCA for Customs CSV / ship / arrive buttons from detail page. */
  extraActions?: ReactNode;
}) {
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const activeId = manifestId;

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
  const status = String(detail.data?.manifest.status || '');
  const showSeal = !status || status === 'open';

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-5 lg:sticky lg:top-20 lg:self-start">
      <h2 className="text-sm font-semibold text-slate-900">Seal & submit</h2>
      <p className="mt-1 text-xs text-slate-500">
        {readiness.data
          ? `${readiness.data.readyCount}/${readiness.data.total} packages ready`
          : activeId
            ? 'Checking readiness…'
            : 'Select a manifest'}
      </p>

      <div className="mt-4 max-h-48 space-y-2 overflow-auto">
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
        {showSeal ? (
          <button
            type="button"
            disabled={!canSeal || !activeId || seal.isPending}
            onClick={() => seal.mutate()}
            className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {seal.isPending ? 'Sealing…' : 'Seal Manifest'}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!activeId || awbolds.isPending}
          onClick={() => awbolds.mutate()}
          className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {awbolds.isPending ? 'Preparing…' : 'Download AWBOLDS XML'}
        </button>
        <button
          type="button"
          disabled={!activeId || submitJca.isPending}
          onClick={() => submitJca.mutate()}
          className="w-full rounded-lg border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50"
        >
          {submitJca.isPending ? 'Submitting…' : 'Submit to JCA'}
        </button>
        {extraActions}
        {(seal.error || awbolds.error || submitJca.error) && (
          <p className="text-xs text-red-700">
            {((seal.error || awbolds.error || submitJca.error) as Error).message}
          </p>
        )}
        {submitJca.data?.result && (
          <p className="text-xs text-green-700">
            JCA {submitJca.data.result.status}
            {submitJca.data.result.jcaRef ? ` · ${submitJca.data.result.jcaRef}` : ''}
          </p>
        )}
      </div>
    </aside>
  );
}

/** Legacy standalone page — panel is the live surface on Manifest detail. */
export function ManifestGatekeeperPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Manifest Builder</h1>
        <p className="mt-1 text-sm text-slate-500">
          Open a manifest from the Manifests list — seal and Customs tools live there now.
        </p>
      </div>
    </div>
  );
}
