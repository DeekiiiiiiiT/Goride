import { useCustomsCases, useFreightOrgId } from '@/app/hooks/useFreight';
import { freightService } from '@/app/services/freightService';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function CustomsBoardPage() {
  const { data, isLoading, error } = useCustomsCases();
  const orgId = useFreightOrgId();
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      freightService.updateCustomsCase(args.id, args.body, orgId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'customs'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'manifests'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Customs board</h1>
        <p className="mt-1 text-sm text-slate-500">
          Mirror your broker&apos;s ASYCUDA progress — not a live customs API.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      <div className="space-y-3">
        {(data?.customsCases ?? []).map((c) => {
          const m = c.manifests as { manifest_number?: string; status?: string } | null;
          return (
            <div key={String(c.id)} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{m?.manifest_number || 'Manifest'}</p>
                  <p className="text-sm text-slate-500">
                    Case {String(c.status)} · channel {String(c.channel || '—')} · broker {String(c.broker_ref || '—')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    onClick={() =>
                      void update.mutateAsync({
                        id: String(c.id),
                        body: { status: 'submitted', brokerRef: c.broker_ref || 'BROKER-REF' },
                      })
                    }
                  >
                    Submitted
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs"
                    onClick={() =>
                      void update.mutateAsync({
                        id: String(c.id),
                        body: { status: 'hold', holdReason: 'Inspection', channel: 'red' },
                      })
                    }
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs"
                    onClick={() =>
                      void update.mutateAsync({
                        id: String(c.id),
                        body: { status: 'cleared', channel: 'green' },
                      })
                    }
                  >
                    Cleared
                  </button>
                </div>
              </div>
              {c.hold_reason ? (
                <p className="mt-2 text-sm text-amber-800">Hold: {String(c.hold_reason)}</p>
              ) : null}
            </div>
          );
        })}
        {!isLoading && !(data?.customsCases ?? []).length && (
          <p className="text-sm text-slate-500">No customs cases — seal a manifest first.</p>
        )}
      </div>
    </div>
  );
}
