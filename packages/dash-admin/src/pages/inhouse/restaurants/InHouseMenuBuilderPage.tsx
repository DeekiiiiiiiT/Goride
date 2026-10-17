import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { listInHouseStores } from '@roam/dash-admin-client';
import { useEffect, useState } from 'react';
import type { AdminOutletContext } from '../../../DashAdminPortal';
import { EngineMenuPanel } from '../EngineMenuPanel';
import { InHouseMenuEditor } from '../InHouseMenuEditor';
import { IH } from '../inHouseTheme';

type EditorMode = 'builder' | 'advanced';

/** Menu Builder — engine panel by default; classic Advanced editor as legacy bridge. */
export function InHouseMenuBuilderPage() {
  const { id = '' } = useParams();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [name, setName] = useState('Restaurant');
  const [markupBps, setMarkupBps] = useState(1500);
  const [mode, setMode] = useState<EditorMode>('builder');

  useEffect(() => {
    void listInHouseStores(session.access_token).then((result) => {
      const store = result.stores.find((row) => String(row.merchant_id) === id);
      const merchant = (store?.merchant || {}) as { name?: string };
      setName(merchant.name || 'Restaurant');
      setMarkupBps(Number(store?.markup_bps ?? 1500));
    }).catch(() => undefined);
  }, [id, session.access_token]);

  return (
    <div className="-mx-4 -mt-4 min-h-full bg-[#0f172a] text-slate-200 sm:-mx-6">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 bg-[#0f172a]/95 px-4 py-3 backdrop-blur sm:px-6">
        <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-slate-400">
          <button type="button" className={IH.link} onClick={() => navigate('/in-house?tab=restaurants')}>
            In-House Desk
          </button>
          <span>/</span>
          <button type="button" className={`truncate ${IH.link}`} onClick={() => navigate(`/in-house/restaurants/${id}`)}>
            {name}
          </button>
          <span>/</span>
          <span className="font-medium text-slate-100">Menu Builder</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 bg-slate-900/80 p-0.5">
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'builder' ? IH.chipActive : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setMode('builder')}
            >
              Menu builder
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'advanced' ? IH.chipActive : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setMode('advanced')}
              title="Advanced editor — legacy menus"
            >
              Advanced editor
            </button>
          </div>
          {mode === 'advanced' ? (
            <span className="text-[10px] text-slate-500">Legacy menus</span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] p-0 sm:p-0">
        {mode === 'builder' ? (
          <EngineMenuPanel
            token={session.access_token}
            merchantId={id}
            markupBps={markupBps}
            restaurantName={name}
          />
        ) : (
          <div className="p-4 sm:p-6">
            <InHouseMenuEditor
              token={session.access_token}
              merchantId={id}
              restaurantName={name}
              markupBps={markupBps}
              onBack={() => setMode('builder')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
