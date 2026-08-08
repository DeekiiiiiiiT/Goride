import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCreatePackage, usePackage, usePackages, usePipelineDashboard, useSuites } from '@/app/hooks/useFreight';
import { useParams } from 'react-router-dom';

export function PackagesListPage() {
  const dash = usePipelineDashboard();
  const { data, isLoading, error } = usePackages();
  const suites = useSuites();
  const create = useCreatePackage();
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create.mutateAsync({
        suiteId: (fd.get('suiteId') as string) || null,
        courierTrackingNumber: fd.get('courierTrackingNumber') || null,
        description: fd.get('description') || null,
        declaredValueUsdMinor: fd.get('declaredValueUsd')
          ? Math.round(Number(fd.get('declaredValueUsd')) * 100)
          : null,
      });
      form.reset();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const counts = dash.data?.counts ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Packages</h1>
        <p className="mt-1 text-sm text-slate-500">
          International mailbox parcels — pre-alert through delivery.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(counts)
          .slice(0, 10)
          .map(([status, n]) => (
            <div key={status} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {status.replace(/_/g, ' ')}
              </p>
              <p className="text-lg font-semibold tabular-nums">{n}</p>
            </div>
          ))}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Tracking</th>
              <th className="px-4 py-2">Suite</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Weight</th>
            </tr>
          </thead>
          <tbody>
            {(data?.packages ?? []).map((p) => {
              const suite = p.suites as { suite_code?: string } | null;
              return (
                <tr key={String(p.id)} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/app/packages/${p.id}`} className="font-medium text-amber-800 underline">
                      {String(p.courier_tracking_number || p.id).slice(0, 24)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{suite?.suite_code || '—'}</td>
                  <td className="px-4 py-2">{String(p.status).replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2">{p.weight_lbs != null ? `${p.weight_lbs} lb` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold">Ops pre-alert</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Suite
            <select name="suiteId" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Select…</option>
              {(suites.data?.suites ?? []).map((s) => (
                <option key={String(s.id)} value={String(s.id)}>
                  {String(s.suite_code)} — {String(s.contact_name || '')}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Courier tracking #
            <input name="courierTrackingNumber" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Description
            <input name="description" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Declared value (USD)
            <input name="declaredValueUsd" type="number" step="0.01" min={0} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        {formError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        )}
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {create.isPending ? 'Saving…' : 'Create expected package'}
        </button>
      </form>
    </div>
  );
}

export function PackageDetailPage() {
  const { id } = useParams();
  const { data, isLoading, error } = usePackage(id);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {(error as Error).message}
      </p>
    );
  }
  if (!data?.package) return <p>Not found</p>;
  const p = data.package;
  const suite = p.suites as { suite_code?: string } | null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/packages" className="text-sm text-slate-500 hover:underline">
          ← Packages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {String(p.courier_tracking_number || p.id)}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {suite?.suite_code || 'No suite'} · {String(p.status).replace(/_/g, ' ')}
        </p>
      </div>

      <dl className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Description</dt>
          <dd className="font-medium">{String(p.description || '—')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Weight</dt>
          <dd className="font-medium">{p.weight_lbs != null ? `${p.weight_lbs} lb` : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Fulfillment</dt>
          <dd className="font-medium">{String(p.fulfillment_mode || '—').replace(/_/g, ' ')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Assignee preference</dt>
          <dd className="font-medium">{String(p.preferred_assignee_type || '—').replace(/_/g, ' ')}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Delivery address</dt>
          <dd className="font-medium">{String(p.delivery_address || '—')}</dd>
        </div>
      </dl>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Custody timeline</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.scanEvents ?? []).length === 0 && (
            <li className="text-slate-500">No scans yet</li>
          )}
          {(data.scanEvents ?? []).map((ev) => (
            <li key={String(ev.id)} className="flex justify-between gap-3 border-b border-slate-50 pb-2">
              <span>
                {String(ev.event_type).replace(/_/g, ' ')}
                {ev.note ? ` — ${String(ev.note)}` : ''}
              </span>
              <span className="shrink-0 text-slate-500">
                {new Date(String(ev.occurred_at)).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
