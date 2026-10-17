import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { listInHouseStores } from '@roam/dash-admin-client';
import { useEffect, useState } from 'react';
import type { AdminOutletContext } from '../../../DashAdminPortal';
import { InHouseMenuEditor } from '../InHouseMenuEditor';
import { EngineMenuPanel } from '../EngineMenuPanel';

/** Menu builder route under a restaurant home. */
export function InHouseMenuBuilderPage() {
  const { id = '' } = useParams();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [name, setName] = useState('Restaurant');
  const [marketName, setMarketName] = useState('Jamaica');
  const [markupBps, setMarkupBps] = useState(1500);

  useEffect(() => {
    void listInHouseStores(session.access_token).then((result) => {
      const store = result.stores.find((row) => String(row.merchant_id) === id);
      const merchant = (store?.merchant || {}) as { name?: string };
      setName(merchant.name || 'Restaurant');
      setMarkupBps(Number(store?.markup_bps ?? 1500));
    }).catch(() => undefined);
  }, [id, session.access_token]);

  return (
    <div className="space-y-3 p-4 text-slate-100">
      <EngineMenuPanel token={session.access_token} merchantId={id} markupBps={markupBps} />
      <InHouseMenuEditor
        token={session.access_token}
        merchantId={id}
        restaurantName={name}
        marketName={marketName}
        initials={(session.user.email || 'RR').replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'RR'}
        markupBps={markupBps}
        onBack={() => navigate(`/in-house/restaurants/${id}?step=menu`)}
        onDetails={() => navigate(`/in-house/restaurants/${id}?step=basics`)}
        onHours={() => navigate(`/in-house/restaurants/${id}?step=hours`)}
      />
    </div>
  );
}
