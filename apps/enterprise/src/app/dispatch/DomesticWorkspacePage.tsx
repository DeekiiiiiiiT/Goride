import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DispatchBoardPage } from '@/app/dispatch/DispatchBoardPage';
import { ShipmentsListPage } from '@/app/freight/ShipmentsListPage';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';

type DomesticTab = 'shipments' | 'dispatch';

function parseTab(raw: string | null): DomesticTab {
  return raw === 'dispatch' ? 'dispatch' : 'shipments';
}

/** Tabbed hub: Shipments | Dispatch — each tab module-gated. */
export function DomesticWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const { isModuleEnabled } = useModuleAccess();
  const { canAccessModule } = useSeatAccess();

  const canShipments =
    isModuleEnabled('freight_shipments') && canAccessModule('freight_shipments');
  const canDispatch =
    isModuleEnabled('freight_dispatch') && canAccessModule('freight_dispatch');

  const requested = parseTab(params.get('tab'));
  const tab: DomesticTab =
    requested === 'dispatch' && canDispatch
      ? 'dispatch'
      : requested === 'shipments' && canShipments
        ? 'shipments'
        : canShipments
          ? 'shipments'
          : canDispatch
            ? 'dispatch'
            : 'shipments';

  useEffect(() => {
    if (!canShipments && !canDispatch) return;
    if (requested === 'dispatch' && !canDispatch) {
      setParams(canShipments ? {} : { tab: 'dispatch' }, { replace: true });
    } else if (requested === 'shipments' && !canShipments && canDispatch) {
      setParams({ tab: 'dispatch' }, { replace: true });
    }
  }, [requested, canShipments, canDispatch, setParams]);

  function setTab(next: DomesticTab) {
    setParams(next === 'shipments' ? {} : { tab: next }, { replace: true });
  }

  if (!canShipments && !canDispatch) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Domestic</h1>
          <p className="mt-1 text-sm text-slate-500">
            No domestic modules enabled for this seat.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { id: DomesticTab; label: string }[] = [];
  if (canShipments) tabs.push({ id: 'shipments', label: 'Shipments' });
  if (canDispatch) tabs.push({ id: 'dispatch', label: 'Dispatch' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Domestic</h1>
        <p className="mt-1 text-sm text-slate-500">
          Book Jamaica local shipments, then assign and track on the dispatch board.
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
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
      )}

      {tab === 'shipments' && canShipments && <ShipmentsListPage embedded />}
      {tab === 'dispatch' && canDispatch && <DispatchBoardPage embedded />}
    </div>
  );
}
