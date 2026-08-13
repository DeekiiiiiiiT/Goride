import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { useHandoffPackage, useWarehouseCourierLinks } from '@/app/hooks/useWarehouseCourierLinks';
import { freightService } from '@/app/services/freightService';
import { FREIGHT_FORWARDER_PATH } from '@/app/productDoor';

function awaitingInvoice(p: Record<string, unknown>): boolean {
  return (
    Boolean(p.invoice_required_from_customer) &&
    !p.invoice_verified_at &&
    !p.invoice_unobtainable_at
  );
}

function PackageTable({
  rows,
  empty,
  emptyAction,
  showFloorActions,
  showCourier,
  courierNames,
  onToggleInvoice,
  onUploadSlip,
  busyId,
  onOpenReceive,
  onHandoff,
}: {
  rows: Record<string, unknown>[];
  empty: string;
  emptyAction?: { to: string; label: string };
  showFloorActions?: boolean;
  showCourier?: boolean;
  courierNames?: Record<string, string>;
  onToggleInvoice?: (id: string, next: boolean) => void;
  onUploadSlip?: (id: string, file: File) => void;
  busyId?: string | null;
  onOpenReceive: (tracking: string) => void;
  onHandoff?: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-sm text-slate-500">{empty}</p>
        {emptyAction ? (
          <Link
            to={emptyAction.to}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            {emptyAction.label}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <table className="min-w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-2">Tracking</th>
          {showCourier ? <th className="px-4 py-2">Courier</th> : null}
          <th className="px-4 py-2">Retailer</th>
          <th className="px-4 py-2">Status</th>
          <th className="px-4 py-2">Invoice flag</th>
          <th className="px-4 py-2">Weight</th>
          <th className="px-4 py-2">Dims</th>
          <th className="px-4 py-2">Bin</th>
          {showFloorActions ? <th className="px-4 py-2">Actions</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const id = String(p.id);
          const awaiting = awaitingInvoice(p);
          const ownerId = String(p.owner_org_id ?? p.organization_id ?? '');
          const dims =
            p.length_in != null || p.width_in != null || p.height_in != null
              ? `${p.length_in ?? '—'}×${p.width_in ?? '—'}×${p.height_in ?? '—'}`
              : '—';
          const tracking = String(p.courier_tracking_number || '');
          return (
            <tr
              key={id}
              className={`${tracking ? 'cursor-pointer' : ''} border-t border-slate-100 hover:bg-slate-50`}
              onClick={() => {
                if (!tracking) return;
                onOpenReceive(tracking);
              }}
            >
              <td className="px-4 py-3 font-mono text-xs">
                {tracking || 'No tracking yet'}
              </td>
              {showCourier ? (
                <td className="px-4 py-2.5 text-slate-700">
                  {courierNames?.[ownerId] ?? '—'}
                </td>
              ) : null}
              <td className="px-4 py-2.5 text-slate-700">{String(p.retailer || '—')}</td>
              <td className="px-4 py-2.5 text-slate-700">
                {String(p.status ?? '').replace(/_/g, ' ')}
              </td>
              <td className="px-4 py-2.5">
                {awaiting ? (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                    Flagged for customer invoice
                  </span>
                ) : p.invoice_required_from_customer ? (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    Cleared
                  </span>
                ) : (
                    <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 tabular-nums">
                {p.weight_lbs != null ? `${p.weight_lbs} lb` : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{dims}</td>
              <td className="px-4 py-2.5 font-mono text-xs">
                {String(p.bin_location ?? '—')}
              </td>
              {showFloorActions ? (
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-1.5">
                    <label className="inline-flex min-h-11 items-center gap-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(p.invoice_required_from_customer)}
                        disabled={busyId === id}
                        onChange={(e) => onToggleInvoice?.(id, e.target.checked)}
                      />
                      Ask courier for customer invoice
                    </label>
                    {onHandoff && String(p.status) === 'received_at_warehouse' ? (
                      <button
                        type="button"
                        disabled={busyId === id}
                        onClick={() => onHandoff(id)}
                        className="inline-flex min-h-11 items-center text-xs font-medium text-slate-800 underline"
                      >
                        Release from floor
                      </button>
                    ) : null}
                    <label className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-amber-800 underline">
                      {busyId === id ? 'Saving…' : 'Upload packing slip'}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="sr-only"
                        disabled={busyId === id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) onUploadSlip?.(id, file);
                        }}
                      />
                    </label>
                  </div>
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Warehouse inbound queue — expected inbound + packages on the floor. */
export function WarehouseInboundPage({
  embedded = false,
  showCourier,
}: {
  embedded?: boolean;
  showCourier?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const [facilityFilter, setFacilityFilter] = useState('');
  const [ownerOrgFilter, setOwnerOrgFilter] = useState('');
  const linksQ = useWarehouseCourierLinks();
  const showCourierCol = showCourier ?? !embedded;

  const activeCourierLinks = useMemo(
    () => (linksQ.data?.links ?? []).filter((l) => String(l.status) === 'active'),
    [linksQ.data?.links],
  );

  const courierNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const link of linksQ.data?.links ?? []) {
      const courierId = String(link.courier_org_id ?? link.courier_org?.id ?? '');
      if (!courierId) continue;
      map[courierId] = link.is_self
        ? 'In-house'
        : String(link.courier_org?.name || 'Courier');
    }
    return map;
  }, [linksQ.data?.links]);

  const facilities = useQuery({
    queryKey: ['freight', 'facilities', organizationId, 'warehouse'],
    queryFn: () => freightService.listFacilities(organizationId, 'warehouse'),
    enabled: Boolean(session),
  });

  const q = useQuery({
    queryKey: [
      'freight',
      'packages',
      organizationId,
      'warehouse-inbound',
      embedded ? 'embedded' : 'warehouse',
      ownerOrgFilter || 'all',
    ],
    queryFn: () =>
      freightService.listPackages(organizationId, undefined, {
        ...(embedded ? {} : { scope: 'warehouse-desk' as const }),
        ...(ownerOrgFilter ? { ownerOrgId: ownerOrgFilter } : {}),
      }),
    enabled: Boolean(session),
  });

  const rows = q.data?.packages ?? [];
  const expected = rows.filter((p) => String(p.status) === 'expected');
  const onFloor = rows.filter((p) => String(p.status) === 'received_at_warehouse');

  const expectedFiltered = expected;
  const onFloorFiltered = facilityFilter
    ? onFloor.filter(
        (p) =>
          String(p.current_facility_id ?? '') === facilityFilter ||
          String(p.intended_facility_id ?? '') === facilityFilter,
      )
    : onFloor;

  const handoff = useHandoffPackage();

  const flagMut = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      await freightService.setInvoiceFlags(
        id,
        { invoiceRequiredFromCustomer: next },
        organizationId,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
    },
  });

  const slipMut = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      await freightService.uploadPackageInvoice(id, file, organizationId, 'warehouse');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'packages'] });
    },
  });

  const warehousesByCountry = (
    (facilities.data?.facilities ?? []) as Record<string, unknown>[]
  ).reduce<Record<string, Record<string, unknown>[]>>((acc, f) => {
    const cc = String(f.country_code || '??').toUpperCase();
    if (!acc[cc]) acc[cc] = [];
    acc[cc].push(f);
    return acc;
  }, {});

  const busyId =
    flagMut.isPending || slipMut.isPending || handoff.isPending
      ? String(
          (flagMut.variables as { id?: string } | undefined)?.id ??
            (slipMut.variables as { id?: string } | undefined)?.id ??
            (handoff.variables as { id?: string } | undefined)?.id ??
            '',
        )
      : null;

  const receivePath = embedded ? '/app/receive?tab=station' : `${FREIGHT_FORWARDER_PATH}/receive`;
  function openReceive(tracking: string) {
    const sep = receivePath.includes('?') ? '&' : '?';
    navigate(`${receivePath}${sep}tracking=${encodeURIComponent(tracking)}`, {
      state: { from: location.pathname },
    });
  }

  const warehouseCount = (facilities.data?.facilities ?? []).length;

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Inbound</h1>
            <p className="mt-1 text-sm text-slate-500">Coming in, then on the floor.</p>
          </div>
          <Link
            to={`${FREIGHT_FORWARDER_PATH}/receive`}
            state={{ from: location.pathname }}
            className="inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Open Receive Station
          </Link>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Coming in, then on the floor.</p>
      )}

      {!embedded && warehouseCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6">
          <p className="text-sm font-semibold text-slate-900">No warehouse address yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Confirm your company in Setup. Packages show here after Roam approves the join.
          </p>
          <Link
            to={`${FREIGHT_FORWARDER_PATH}/setup`}
            state={{ from: location.pathname }}
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Go to Setup
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <div className="min-w-[12rem] max-w-sm flex-1">
          <label className="text-xs font-medium text-slate-500">Our building (on floor)</label>
          <select
            value={facilityFilter}
            onChange={(e) => setFacilityFilter(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
          >
            <option value="">All buildings</option>
            {Object.entries(warehousesByCountry)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cc, list]) => (
                <optgroup key={cc} label={cc}>
                  {list.map((f) => (
                    <option key={String(f.id)} value={String(f.id)}>
                      {String(f.name)} ({String(f.code)})
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
        {activeCourierLinks.length > 0 ? (
          <div className="min-w-[12rem] max-w-sm flex-1">
            <label className="text-xs font-medium text-slate-500">Which courier</label>
            <select
              value={ownerOrgFilter}
              onChange={(e) => setOwnerOrgFilter(e.target.value)}
              className="mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm"
            >
              <option value="">All couriers</option>
              {activeCourierLinks.map((link) => {
                const id = String(link.courier_org_id ?? link.courier_org?.id ?? '');
                const label = link.is_self
                  ? 'In-house'
                  : String(link.courier_org?.name || 'Courier');
                return (
                  <option key={String(link.id)} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        ) : null}
      </div>

      {q.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {q.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(q.error as Error).message}
        </p>
      )}
      {(flagMut.error || slipMut.error || handoff.error) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {((flagMut.error || slipMut.error || handoff.error) as Error).message}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">
            Expected (incoming) · {expectedFiltered.length}
          </h2>
          <p className="text-xs text-slate-500">Courier said these parcels are coming</p>
        </div>
        <PackageTable
          rows={expectedFiltered}
          empty="Waiting for the courier to tell us a parcel is coming."
          emptyAction={{ to: receivePath, label: 'Open Receive Station' }}
          showCourier={showCourierCol}
          courierNames={courierNames}
          onOpenReceive={openReceive}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">
            On floor (received) · {onFloorFiltered.length}
          </h2>
          <p className="text-xs text-slate-500">Tap a row to receive again or add a packing slip</p>
        </div>
        <PackageTable
          rows={onFloorFiltered}
          empty="No packages on the floor yet. Scan at Receive Station."
          emptyAction={{ to: receivePath, label: 'Open Receive Station' }}
          showFloorActions
          showCourier={showCourierCol}
          courierNames={courierNames}
          busyId={busyId}
          onToggleInvoice={(id, next) => flagMut.mutate({ id, next })}
          onUploadSlip={(id, file) => slipMut.mutate({ id, file })}
          onHandoff={(id) => handoff.mutate({ id })}
          onOpenReceive={openReceive}
        />
      </section>
    </div>
  );
}
