import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useFacilities, useIntakeClaims } from '@/app/hooks/useFreight';
import { AddWarehouseBuildingPanel } from '@/app/freight/os/AddWarehouseBuildingPanel';
import { FREIGHT_FORWARDER_PATH } from '@/app/productDoor';

function SetupSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, label: 'Company' },
    { n: 2 as const, label: 'Review' },
    { n: 3 as const, label: 'Ready' },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs font-medium">
      {steps.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <li key={s.n} className="flex min-w-0 items-center gap-2">
            {i > 0 ? <span className="h-px w-6 shrink-0 bg-slate-200" /> : null}
            <span
              className={
                done || active
                  ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white'
                  : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-500'
              }
            >
              {s.n}
            </span>
            <span className={active || done ? 'text-slate-900' : 'text-slate-400'}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** First-run join. Extra buildings live under Facilities. */
export function FreightForwarderSetupPage() {
  const qc = useQueryClient();
  const facilities = useFacilities('warehouse');
  const claims = useIntakeClaims();
  const buildings = (facilities.data?.facilities ?? []) as Record<string, unknown>[];
  const pending = (claims.data?.requests ?? []).some((r) => String(r.status) === 'pending');
  const ready = buildings.length > 0 && !pending;
  const step: 1 | 2 | 3 = ready ? 3 : pending ? 2 : 1;

  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['freight', 'intake-claims'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'facilities'] });
    }, 10000);
    return () => window.clearInterval(t);
  }, [pending, qc]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Setup</h1>
        {pending ? null : (
          <p className="mt-1 text-sm text-slate-500">
            {ready
              ? 'Your warehouse is approved. Connect the couriers you receive for, then start scanning.'
              : 'Tell us which company you operate. Roam reviews every join before you can receive packages.'}
          </p>
        )}
      </div>

      <SetupSteps current={step} />

      {buildings.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-6">
          <p className="text-sm font-semibold text-slate-900">Your buildings</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {buildings.map((f) => (
              <li
                key={String(f.id)}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
              >
                {String(f.name)}
                {f.city ? ` · ${String(f.city)}` : ''}
              </li>
            ))}
          </ul>
          {ready ? (
            <p className="mt-3 text-xs text-slate-500">
              Need another building? Add it under{' '}
              <Link
                to={`${FREIGHT_FORWARDER_PATH}/facilities`}
                state={{ from: `${FREIGHT_FORWARDER_PATH}/setup` }}
                className="font-medium text-slate-800 underline-offset-2 hover:underline"
              >
                Facilities
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : null}

      {ready ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            to={`${FREIGHT_FORWARDER_PATH}/partners`}
            state={{ from: `${FREIGHT_FORWARDER_PATH}/setup` }}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Connect courier partners
          </Link>
          <Link
            to={`${FREIGHT_FORWARDER_PATH}/receive`}
            state={{ from: `${FREIGHT_FORWARDER_PATH}/setup` }}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Open Receive Station
          </Link>
        </div>
      ) : (
        <AddWarehouseBuildingPanel
          onSubmitted={() => {
            void qc.invalidateQueries({ queryKey: ['freight', 'intake-claims'] });
          }}
        />
      )}
    </div>
  );
}
