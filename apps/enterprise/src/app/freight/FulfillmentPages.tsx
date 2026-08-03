import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useClientFleet,
  useCreateClientFleet,
  useDeliveryBatches,
  useFreightCarriers,
  useFreightClients,
  useFreightOrgId,
  useReadyFulfillment,
} from '@/app/hooks/useFreight';
import { freightService } from '@/app/services/freightService';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function FulfillmentDeskPage() {
  const { data, isLoading, error } = useReadyFulfillment();
  const batches = useDeliveryBatches();
  const clientFleet = useClientFleet();
  const carriers = useFreightCarriers(false);
  const orgId = useFreightOrgId();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [assigneeType, setAssigneeType] = useState('org_fleet');
  const [clientAssetId, setClientAssetId] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const collect = useMutation({
    mutationFn: (packageId: string) =>
      freightService.collectPickup({ packageId }, orgId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'fulfillment'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
    },
  });

  const buildBatch = useMutation({
    mutationFn: () =>
      freightService.createDeliveryBatch(
        {
          packageIds: selected,
          assigneeType,
          clientFleetAssetId: clientAssetId || null,
          thirdPartyCarrierId: carrierId || null,
          offerNow: true,
        },
        orgId,
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['freight', 'fulfillment'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'batches'] });
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
      setSelected([]);
      setMsg(
        `Batch ${String(res.batch.batch_number)} created. POD token: ${res.podToken}`,
      );
    },
  });

  const pickupPkgs = (data?.packages ?? []).filter(
    (p) => p.fulfillment_mode === 'pickup' || p.status === 'awaiting_pickup',
  );
  const doorPkgs = (data?.packages ?? []).filter(
    (p) =>
      p.fulfillment_mode === 'door_delivery' ||
      (p.status === 'ready_for_fulfillment' && p.fulfillment_mode !== 'pickup'),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Fulfillment desk</h1>
        <p className="mt-1 text-sm text-slate-500">
          Branch pickup or door delivery via Roam, org fleet, client fleet, or 3PL.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {msg}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pickup queue
        </h2>
        <ul className="space-y-2">
          {pickupPkgs.map((p) => {
            const suite = p.suites as { suite_code?: string } | null;
            return (
              <li
                key={String(p.id)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
              >
                <span>
                  {String(p.courier_tracking_number || p.id)} · {suite?.suite_code || '—'} ·{' '}
                  {String(p.status).replace(/_/g, ' ')}
                </span>
                <button
                  type="button"
                  disabled={collect.isPending}
                  onClick={() => void collect.mutateAsync(String(p.id))}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
                >
                  Mark collected
                </button>
              </li>
            );
          })}
          {!pickupPkgs.length && (
            <li className="text-sm text-slate-500">No pickup tickets.</li>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Door delivery — build batch
        </h2>
        <ul className="max-h-56 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-sm">
          {doorPkgs.map((p) => (
            <li key={String(p.id)}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(String(p.id))}
                  onChange={(e) => {
                    const pid = String(p.id);
                    setSelected((prev) =>
                      e.target.checked ? [...prev, pid] : prev.filter((x) => x !== pid),
                    );
                  }}
                />
                {String(p.courier_tracking_number || p.id)} ·{' '}
                {String(p.delivery_address || 'no address')}
              </label>
            </li>
          ))}
          {!doorPkgs.length && (
            <li className="text-slate-500">No door-delivery packages ready.</li>
          )}
        </ul>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <label className="block text-sm">
            Assignee type
            <select
              value={assigneeType}
              onChange={(e) => setAssigneeType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="org_fleet">Org fleet</option>
              <option value="client_fleet">Client fleet</option>
              <option value="third_party">3PL</option>
            </select>
          </label>
          {assigneeType === 'client_fleet' && (
            <label className="block text-sm">
              Client driver
              <select
                value={clientAssetId}
                onChange={(e) => setClientAssetId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {(clientFleet.data?.assets ?? []).map((a) => (
                  <option key={String(a.id)} value={String(a.id)}>
                    {String(a.driver_name)} ({String(a.vehicle_plate || '—')})
                  </option>
                ))}
              </select>
            </label>
          )}
          {assigneeType === 'third_party' && (
            <label className="block text-sm">
              3PL carrier
              <select
                value={carrierId}
                onChange={(e) => setCarrierId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {(carriers.data?.carriers ?? []).map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {String(c.name)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <button
          type="button"
          disabled={!selected.length || buildBatch.isPending}
          onClick={() => void buildBatch.mutateAsync()}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          {buildBatch.isPending ? 'Building…' : `Create delivery batch (${selected.length})`}
        </button>
        {buildBatch.error && (
          <p className="text-sm text-red-700">{(buildBatch.error as Error).message}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent batches
        </h2>
        <ul className="space-y-2">
          {(batches.data?.batches ?? []).slice(0, 10).map((b) => (
            <li key={String(b.id)}>
              <Link
                to={`/app/fulfillment/batches/${b.id}`}
                className="flex justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm hover:bg-slate-50"
              >
                <span className="font-medium">{String(b.batch_number)}</span>
                <span className="text-slate-500">
                  {String(b.assignee_type).replace(/_/g, ' ')} · {String(b.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function DeliveryBatchDetailPage() {
  const { id } = useParams();
  const orgId = useFreightOrgId();
  const qc = useQueryClient();
  const [data, setData] = useState<{
    batch: Record<string, unknown>;
    stops: Record<string, unknown>[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [podNote, setPodNote] = useState('');
  const [podPhoto, setPodPhoto] = useState<File | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      const fresh = await freightService.getDeliveryBatch(id, orgId);
      setData(fresh);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, orgId]);

  async function load(packageId: string) {
    if (!id) return;
    await freightService.loadBatchStop(id, packageId, orgId);
    await refresh();
    void qc.invalidateQueries({ queryKey: ['freight', 'batches'] });
  }

  async function deliver(packageId: string) {
    if (!id) return;
    setDeliveringId(packageId);
    try {
      let podPhotoPath: string | null = null;
      if (podPhoto) {
        podPhotoPath = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Could not read photo'));
          reader.readAsDataURL(podPhoto);
        });
      }
      await freightService.deliverBatchStop(
        id,
        {
          packageId,
          podNote: podNote.trim() || 'Confirmed by ops',
          podPhotoPath,
        },
        orgId,
      );
      setPodNote('');
      setPodPhoto(null);
      await refresh();
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeliveringId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading batch…</p>;
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data) return <p>Not found</p>;

  const mapsUrl = buildMapsUrl(data.stops);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/fulfillment" className="text-sm text-slate-500 hover:underline">
          ← Fulfillment
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{String(data.batch.batch_number)}</h1>
        <p className="text-sm text-slate-500">
          {String(data.batch.assignee_type).replace(/_/g, ' ')} · {String(data.batch.status)}
        </p>
        {data.batch.pod_token ? (
          <p className="mt-2 text-xs text-slate-500">
            Client POD link: /pod/{String(data.batch.pod_token)}
          </p>
        ) : null}
      </div>

      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm font-semibold text-amber-800 underline"
        >
          Open multi-stop Google Maps
        </a>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-600">
          POD note (used on next Delivered)
          <input
            value={podNote}
            onChange={(e) => setPodNote(e.target.value)}
            placeholder="Left with security / signed…"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm text-slate-600">
          POD photo (optional)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPodPhoto(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs"
          />
        </label>
      </div>

      <ul className="space-y-2">
        {data.stops.map((s) => {
          const pkg = s.packages as Record<string, unknown> | null;
          return (
            <li
              key={String(s.id)}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <span>
                #{String(s.stop_order)} · {String(pkg?.courier_tracking_number || s.package_id)} ·{' '}
                {String(s.address || '—')} · {String(s.status)}
              </span>
              <span className="flex gap-2">
                {s.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void load(String(s.package_id))}
                    className="rounded-lg border px-2 py-1 text-xs"
                  >
                    Load
                  </button>
                )}
                {(s.status === 'pending' || s.status === 'loaded') && (
                  <button
                    type="button"
                    disabled={deliveringId === String(s.package_id)}
                    onClick={() => void deliver(String(s.package_id))}
                    className="rounded-lg bg-amber-500 px-2 py-1 text-xs font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {deliveringId === String(s.package_id) ? 'Saving…' : 'Delivered'}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function buildMapsUrl(stops: Record<string, unknown>[]): string | null {
  const coords = stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => `${s.lat},${s.lng}`);
  if (coords.length < 1) return null;
  const dest = coords[coords.length - 1];
  const waypoints = coords.slice(0, -1).join('|');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}${
    waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''
  }`;
}

export function ClientFleetPage() {
  const { data, isLoading, error } = useClientFleet();
  const create = useCreateClientFleet();
  const clients = useFreightClients();
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        clientId: fd.get('clientId'),
        driverName: fd.get('driverName'),
        driverPhone: fd.get('driverPhone') || null,
        vehiclePlate: fd.get('vehiclePlate') || null,
        vehicleLabel: fd.get('vehicleLabel') || null,
      });
      e.currentTarget.reset();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Client fleet</h1>
        <p className="mt-1 text-sm text-slate-500">
          Customer-owned drivers and vehicles for self-fleet door delivery.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-700">{(error as Error).message}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Driver</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Plate</th>
              <th className="px-4 py-2">Client</th>
            </tr>
          </thead>
          <tbody>
            {(data?.assets ?? []).map((a) => {
              const client = a.clients as { name?: string } | null;
              return (
                <tr key={String(a.id)} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium">{String(a.driver_name)}</td>
                  <td className="px-4 py-2">{String(a.driver_phone || '—')}</td>
                  <td className="px-4 py-2">{String(a.vehicle_plate || '—')}</td>
                  <td className="px-4 py-2">{client?.name || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold">Register asset</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Client
            <select name="clientId" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Select…</option>
              {(clients.data?.clients ?? []).map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Driver name
            <input name="driverName" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Phone
            <input name="driverPhone" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Plate
            <input name="vehiclePlate" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm sm:col-span-2">
            Vehicle label
            <input name="vehicleLabel" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        {formError && <p className="text-sm text-red-700">{formError}</p>}
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
        >
          Save
        </button>
      </form>
    </div>
  );
}
