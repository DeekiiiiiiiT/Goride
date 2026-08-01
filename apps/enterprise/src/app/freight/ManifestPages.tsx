import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useCreateManifest,
  useFacilities,
  useFreightOrgId,
  useManifest,
  useManifests,
  usePackages,
} from '@/app/hooks/useFreight';
import { freightService } from '@/app/services/freightService';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function ManifestsListPage() {
  const { data, isLoading, error } = useManifests();
  const create = useCreateManifest();
  const miami = useFacilities('miami_warehouse');
  const hub = useFacilities('ja_hub');
  const [err, setErr] = useState<string | null>(null);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        carrierName: fd.get('carrierName') || null,
        shipmentType: fd.get('shipmentType') || 'air',
        originFacilityId: (fd.get('originFacilityId') as string) || null,
        destinationFacilityId: (fd.get('destinationFacilityId') as string) || null,
        awbOrBl: fd.get('awbOrBl') || null,
      });
      e.currentTarget.reset();
    } catch (ex) {
      setErr((ex as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Manifests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Air/sea consolidation — seal, export broker CSV, ship to Jamaica.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      <ul className="space-y-2">
        {(data?.manifests ?? []).map((m) => (
          <li key={String(m.id)}>
            <Link
              to={`/app/manifests/${m.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm hover:bg-slate-50"
            >
              <span className="font-medium">{String(m.manifest_number)}</span>
              <span className="text-slate-500">
                {String(m.shipment_type)} · {String(m.status)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold">Open new manifest</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Carrier
            <input name="carrierName" placeholder="Amerijet" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Type
            <select name="shipmentType" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="air">Air</option>
              <option value="sea">Sea</option>
            </select>
          </label>
          <label className="block text-sm">
            Origin
            <select name="originFacilityId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">—</option>
              {(miami.data?.facilities ?? []).map((f) => (
                <option key={String(f.id)} value={String(f.id)}>{String(f.name)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Destination hub
            <select name="destinationFacilityId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">—</option>
              {(hub.data?.facilities ?? []).map((f) => (
                <option key={String(f.id)} value={String(f.id)}>{String(f.name)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            AWB / BL
            <input name="awbOrBl" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button type="submit" disabled={create.isPending} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950">
          Create
        </button>
      </form>
    </div>
  );
}

export function ManifestDetailPage() {
  const { id } = useParams();
  const orgId = useFreightOrgId();
  const qc = useQueryClient();
  const { data, isLoading, error } = useManifest(id);
  const miamiPkgs = usePackages('received_miami');
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const addPkgs = useMutation({
    mutationFn: () => freightService.addManifestPackages(id!, selected, orgId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'manifest', orgId, id] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      setSelected([]);
    },
  });
  const seal = useMutation({
    mutationFn: () => freightService.sealManifest(id!, orgId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['freight', 'manifest', orgId, id] }),
  });
  const transition = useMutation({
    mutationFn: (status: string) => freightService.transitionManifest(id!, status, undefined, orgId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'manifest', orgId, id] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
    },
  });

  async function downloadCsv() {
    if (!id) return;
    const res = await freightService.customsExport(id, orgId);
    const blob = new Blob([res.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${res.manifestNumber}-customs.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`Exported ${res.invoicePaths.length} invoice path(s) referenced in CSV.`);
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-700">{(error as Error).message}</p>;
  if (!data?.manifest) return <p>Not found</p>;

  const m = data.manifest;
  const status = String(m.status);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/manifests" className="text-sm text-slate-500 hover:underline">← Manifests</Link>
        <h1 className="mt-2 text-2xl font-semibold">{String(m.manifest_number)}</h1>
        <p className="text-sm text-slate-500">
          {String(m.shipment_type)} · {status} · {String(m.carrier_name || '—')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === 'open' && (
          <button type="button" onClick={() => void seal.mutateAsync()} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950">
            Seal manifest
          </button>
        )}
        {status === 'sealed' && (
          <button type="button" onClick={() => void transition.mutateAsync('shipped')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            Mark shipped
          </button>
        )}
        {status === 'shipped' && (
          <button type="button" onClick={() => void transition.mutateAsync('arrived_ja')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            Arrived Jamaica
          </button>
        )}
        {(status === 'arrived_ja' || status === 'sealed' || status === 'shipped') && (
          <button type="button" onClick={() => void downloadCsv()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            Download customs CSV
          </button>
        )}
      </div>
      {msg && <p className="text-sm text-emerald-800">{msg}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Lines ({(data.lines ?? []).length})</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.lines ?? []).map((line) => {
            const pkg = line.packages as Record<string, unknown> | null;
            const suite = pkg?.suites as { suite_code?: string } | null;
            return (
              <li key={String(line.id)} className="flex justify-between border-b border-slate-50 pb-2">
                <span>
                  #{String(line.line_number)} · {String(pkg?.courier_tracking_number || pkg?.id)} · {suite?.suite_code || '—'}
                </span>
                <span className="text-slate-500">{String(pkg?.status || '')}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {status === 'open' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Add received Miami packages</h2>
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
            {(miamiPkgs.data?.packages ?? []).map((p) => (
              <li key={String(p.id)}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(String(p.id))}
                    onChange={(e) => {
                      const id = String(p.id);
                      setSelected((prev) =>
                        e.target.checked ? [...prev, id] : prev.filter((x) => x !== id),
                      );
                    }}
                  />
                  {String(p.courier_tracking_number || p.id)}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!selected.length || addPkgs.isPending}
            onClick={() => void addPkgs.mutateAsync()}
            className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            Add selected
          </button>
        </section>
      )}
    </div>
  );
}
