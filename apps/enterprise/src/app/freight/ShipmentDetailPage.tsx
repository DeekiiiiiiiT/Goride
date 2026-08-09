import { Link, useParams } from 'react-router-dom';
import {
  useBillShipment,
  useFreightShipment,
  useTransitionShipment,
} from '@/app/hooks/useFreight';

const NEXT: Record<string, string[]> = {
  draft: ['booked', 'cancelled'],
  booked: ['in_transit', 'cancelled', 'exception'],
  in_transit: ['out_for_delivery', 'delivered', 'exception'],
  out_for_delivery: ['delivered', 'exception'],
  exception: ['in_transit', 'cancelled'],
};

export function ShipmentDetailPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useFreightShipment(id);
  const transition = useTransitionShipment();
  const bill = useBillShipment();

  if (isLoading) return <p className="text-sm text-slate-500">Loading shipment…</p>;
  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {(error as Error).message}
      </p>
    );
  }
  if (!data?.shipment) return <p>Not found</p>;

  const s = data.shipment;
  const status = String(s.status);
  const next = NEXT[status] ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/domestic" className="text-sm text-slate-500 hover:underline">
          ← Shipments
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{String(s.reference_code)}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {String(s.origin_label)} → {String(s.destination_label)}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase">
            {status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {next.map((st) => (
          <button
            key={st}
            type="button"
            disabled={transition.isPending}
            onClick={() => void transition.mutateAsync({ id: String(s.id), status: st })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            Mark {st.replace(/_/g, ' ')}
          </button>
        ))}
        {status !== 'cancelled' && !s.billed_at && (
          <button
            type="button"
            disabled={bill.isPending}
            onClick={() => void bill.mutateAsync(String(s.id))}
            className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {bill.isPending ? 'Billing…' : 'Bill shipment'}
          </button>
        )}
        {Boolean(s.billed_at) && (
          <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Billed
          </span>
        )}
      </div>

      {(transition.error || bill.error) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {((transition.error || bill.error) as Error).message}
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Legs</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.legs ?? []).map((leg) => (
            <li key={String(leg.id)} className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
              <span>
                Leg {String(leg.sequence)} · {String(leg.status)}
              </span>
              <span className="text-slate-500">
                {leg.carrier_id ? `Carrier ${String(leg.carrier_id).slice(0, 8)}…` : 'Unassigned'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Consignments</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.consignments ?? []).map((c) => (
            <li key={String(c.id)}>
              {String(c.description)} × {String(c.quantity)}
              {c.hazmat ? ' · HAZMAT' : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Tracking</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data.trackingEvents ?? []).length === 0 && (
            <li className="text-slate-500">No events yet</li>
          )}
          {(data.trackingEvents ?? []).map((ev) => (
            <li key={String(ev.id)} className="flex justify-between gap-3">
              <span>
                {String(ev.status)}
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
