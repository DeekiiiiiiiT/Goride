import { Link, useSearchParams } from 'react-router-dom';
import { WarehouseInboundPage } from '@/app/freight/os/WarehouseInboundPage';
import { WarehouseReceiveStationPage } from '@/app/freight/os/WarehouseReceiveStationPage';

type IntakeTab = 'inbound' | 'station';

function parseTab(raw: string | null): IntakeTab {
  return raw === 'station' ? 'station' : 'inbound';
}

/** Tabbed hub: Inbound queue | Receive station. */
export function ReceiveWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));

  function setTab(next: IntakeTab) {
    setParams(next === 'inbound' ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">US Intake</h1>
          <p className="mt-1 text-sm text-slate-500">
            See what&apos;s inbound, then scan it in at the receive station.
          </p>
        </div>
        <Link
          to="/warehouse"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          Open Warehouse app
        </Link>
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
