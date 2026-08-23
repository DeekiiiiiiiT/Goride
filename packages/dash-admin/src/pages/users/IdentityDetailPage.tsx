import React, { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getIdentityDetail, type IdentityDetail } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

type Tab = 'overview' | 'customer' | 'courier' | 'merchant' | 'access';

export function IdentityDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<IdentityDetail | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await getIdentityDetail(session.access_token, userId);
      setDetail(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load person');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [session.access_token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!detail || !userId) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p>Person not found.</p>
        <Link to="/users" className="text-emerald-400 text-sm mt-2 inline-block">
          Back to directory
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'customer', label: 'Customer', show: !!detail.customer },
    { id: 'courier', label: 'Courier', show: !!detail.courier },
    { id: 'merchant', label: 'Merchant', show: (detail.ownedMerchants?.length ?? 0) > 0 || (detail.staffMemberships?.length ?? 0) > 0 },
    { id: 'access', label: 'Access', show: (detail.consoleRoles?.length ?? 0) > 0 },
  ];

  return (
    <div className="space-y-4">
      <Link to="/users" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Users
      </Link>
      <div>
        <h2 className="text-xl font-semibold text-white">
          {String(detail.identity.display_name || detail.authEmail || userId)}
        </h2>
        <p className="text-sm text-slate-400">{detail.authEmail || detail.identity.primary_email as string}</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === t.id ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="rounded-xl border border-slate-800 p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Global status</span>
            <span className="text-white">{String(detail.identity.global_status || 'active')}</span>
          </div>
          <div>
            <span className="text-slate-400 block mb-2">Personas</span>
            <ul className="space-y-1">
              {(detail.personas ?? []).map((p) => (
                <li key={`${p.persona}-${p.ref_id}`} className="text-slate-200">
                  {p.persona} — {p.status}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'customer' && detail.customer && (
        <div className="rounded-xl border border-slate-800 p-4 text-sm space-y-2">
          <p className="text-slate-300">Status: {String(detail.customer.account_status || 'active')}</p>
          <Link to={`/customers/${detail.customer.id}`} className="text-emerald-400 hover:underline">
            Open full customer record
          </Link>
        </div>
      )}

      {tab === 'courier' && detail.courier && (
        <div className="rounded-xl border border-slate-800 p-4 text-sm space-y-2">
          <p className="text-slate-300">Status: {String(detail.courier.status || 'pending')}</p>
          <Link to={`/couriers/${userId}`} className="text-emerald-400 hover:underline">
            Open full courier record
          </Link>
        </div>
      )}

      {tab === 'merchant' && (
        <div className="space-y-4 text-sm">
          {(detail.ownedMerchants ?? []).length > 0 && (
            <div>
              <h3 className="text-white font-medium mb-2">Owned stores</h3>
              <ul className="space-y-1 text-slate-300">
                {detail.ownedMerchants.map((m) => (
                  <li key={String(m.id)}>
                    <Link to={`/merchants/${m.id}`} className="text-emerald-400 hover:underline">
                      {String(m.name)}
                    </Link>
                    {' — '}
                    {String(m.operational_status || 'active')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(detail.staffMemberships ?? []).length > 0 && (
            <div>
              <h3 className="text-white font-medium mb-2">Staff memberships</h3>
              <ul className="space-y-1 text-slate-300">
                {detail.staffMemberships.map((s) => (
                  <li key={String(s.id)}>
                    {String((s.merchants as { name?: string } | undefined)?.name || s.merchant_id)} — {String(s.role)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'access' && (
        <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-300">
          Console roles: {(detail.consoleRoles ?? []).join(', ') || 'None'}
        </div>
      )}
    </div>
  );
}
