import { Link, useSearchParams } from 'react-router-dom';
import { WarehouseInboundPage } from '@/app/freight/os/WarehouseInboundPage';
import { WarehouseReceiveStationPage } from '@/app/freight/os/WarehouseReceiveStationPage';
import { useWarehouseCourierLinks } from '@/app/hooks/useWarehouseCourierLinks';
import { FREIGHT_FORWARDER_PATH, urlForDoor } from '@/app/productDoor';

type IntakeTab = 'inbound' | 'station';

function parseTab(raw: string | null): IntakeTab {
  return raw === 'station' ? 'station' : 'inbound';
}

/**
 * Courier US Intake — receive into a linked (or in-house) freight-forwarder floor.
 * Same scan engine as Freight Forwarder product; partnership context lives in Connect.
 */
export function ReceiveWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const linksQ = useWarehouseCourierLinks();
  const activeWarehouses = (linksQ.data?.links ?? []).filter(
    (l) => l.status === 'active',
  );
  const freightForwarderAppHref = urlForDoor('freight_forwarder', FREIGHT_FORWARDER_PATH);

  function setTab(next: IntakeTab) {
    setParams(next === 'inbound' ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">US Intake</h1>
          <p className="mt-1 text-sm text-slate-500">
            Receive into a building you&apos;re connected to. Floor staff work in the Freight
            Forwarder app.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Active freight forwarder links: {activeWarehouses.length}
            {activeWarehouses.length === 0 && (
              <>
                {' '}
                —{' '}
                <Link to="/app/connect-warehouses" className="font-medium text-amber-800 underline">
                  Connect a freight forwarder
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/connect-warehouses"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Connect freight forwarders
          </Link>
          <a
            href={freightForwarderAppHref}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Open Freight Forwarder app
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'inbound' as const, label: 'Inbound' },
            { id: 'station' as const, label: 'Receive station' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'inbound' && <WarehouseInboundPage embedded />}
      {tab === 'station' && <WarehouseReceiveStationPage embedded />}
    </div>
  );
}
