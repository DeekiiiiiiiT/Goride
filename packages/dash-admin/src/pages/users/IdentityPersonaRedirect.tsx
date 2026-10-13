import { useEffect, useState } from 'react';
import { Navigate, useOutletContext, useParams } from 'react-router-dom';
import { getIdentityDetail } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

/** Old /users/:id bookmarks land on the right person. */
export function IdentityPersonaRedirect() {
  const { userId } = useParams();
  const { session } = useOutletContext<AdminOutletContext>();
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void getIdentityDetail(session.access_token, userId)
      .then((detail) => {
        const customer = detail.personas.find((row) => row.persona === 'customer' && row.ref_id);
        const courier = detail.personas.find((row) => row.persona === 'courier');
        if (customer?.ref_id) setTo(`/customers/${customer.ref_id}`);
        else if (courier) setTo(`/couriers/${userId}`);
        else setTo(`/team?tab=all-users&id=${userId}`);
      })
      .catch(() => setTo(`/team?tab=all-users`));
  }, [session.access_token, userId]);

  if (!to) return <p className="text-sm text-slate-400">Opening the right profile…</p>;
  return <Navigate to={to} replace />;
}
