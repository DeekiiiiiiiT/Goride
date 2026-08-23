import React, { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getIdentityDetail,
  listIdentityAuditEvents,
  listIdentitySessions,
  revokeMerchantStaff,
  type IdentityDetail,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { IdentityHeaderCard } from './components/IdentityHeaderCard';
import { IdentityActionBar } from './components/IdentityActionBar';
import { IdentityStatusBadge } from './components/IdentityStatusBadge';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { useDashAdminAccess } from '../../hooks/useDashAdminAccess';

type Tab = 'overview' | 'customer' | 'courier' | 'merchant' | 'access' | 'sessions' | 'audit';

export function IdentityDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const { prompt } = useAdminConfirm();
  const { hasPermission } = useDashAdminAccess();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<IdentityDetail | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; last_seen?: string; device?: string }>>([]);
  const [auditEvents, setAuditEvents] = useState<Array<{ action: string; created_at: string; reason?: string | null }>>([]);

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

  useEffect(() => {
    if (!userId || tab !== 'sessions') return;
    void listIdentitySessions(session.access_token, userId)
      .then((r) => setSessions(r.sessions ?? []))
      .catch(() => setSessions([]));
  }, [tab, userId, session.access_token]);

  useEffect(() => {
    if (!userId || tab !== 'audit') return;
    void listIdentityAuditEvents(session.access_token, { target_user_id: userId, limit: 50 })
      .then((r) => setAuditEvents(r.events ?? []))
      .catch(() => setAuditEvents([]));
  }, [tab, userId, session.access_token]);

  const handleRevokeStaff = async (memberId: string) => {
    const values = await prompt({
      title: 'Revoke staff access',
      description: 'Remove this person from the merchant team.',
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Reason', required: true, multiline: true }],
    });
    if (!values?.reason) return;
    try {
      await revokeMerchantStaff(session.access_token, memberId, values.reason);
      toast.success('Staff access revoked');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

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
    { id: 'sessions', label: 'Sessions', show: hasPermission('sessions.read') },
    { id: 'audit', label: 'Audit', show: hasPermission('audit.read') },
  ];

  return (
    <div className="space-y-4">
      <Link to="/users" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Users
      </Link>

      <IdentityHeaderCard detail={detail} userId={userId} />
      <IdentityActionBar
        userId={userId}
        detail={detail}
        accessToken={session.access_token}
        onReload={() => void load()}
      />

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
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Global status</span>
            <IdentityStatusBadge status={String(detail.identity.global_status || 'active')} />
          </div>
          <div>
            <span className="text-slate-400 block mb-2">Personas</span>
            <ul className="space-y-2">
              {(detail.personas ?? []).map((p) => (
                <li key={`${p.persona}-${p.ref_id}`} className="flex items-center gap-2 text-slate-200">
                  <span>{p.persona}</span>
                  <IdentityStatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'customer' && detail.customer && (
        <div className="rounded-xl border border-slate-800 p-4 text-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Status</span>
            <IdentityStatusBadge status={String(detail.customer.account_status || 'active')} />
          </div>
          <p className="text-slate-300">Phone: {String(detail.customer.phone || '—')}</p>
          <Link to={`/customers/${detail.customer.id}`} className="text-emerald-400 hover:underline text-xs">
            Full customer record →
          </Link>
        </div>
      )}

      {tab === 'courier' && detail.courier && (
        <div className="rounded-xl border border-slate-800 p-4 text-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Status</span>
            <IdentityStatusBadge status={String(detail.courier.status || 'pending')} />
          </div>
          <Link to={`/couriers/${userId}`} className="text-emerald-400 hover:underline text-xs">
            Full courier record →
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
                  <li key={String(m.id)} className="flex items-center gap-2">
                    <Link to={`/merchants/${m.id}`} className="text-emerald-400 hover:underline">
                      {String(m.name)}
                    </Link>
                    <IdentityStatusBadge status={String(m.operational_status || 'active')} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(detail.staffMemberships ?? []).length > 0 && (
            <div>
              <h3 className="text-white font-medium mb-2">Staff memberships</h3>
              <ul className="space-y-2 text-slate-300">
                {detail.staffMemberships.map((s) => (
                  <li key={String(s.id)} className="flex items-center justify-between gap-2">
                    <span>
                      {String((s.merchants as { name?: string } | undefined)?.name || s.merchant_id)} — {String(s.role)}
                    </span>
                    {hasPermission('merchant.staff.revoke') && (
                      <button
                        type="button"
                        className="text-red-400 text-xs hover:underline"
                        onClick={() => void handleRevokeStaff(String(s.id))}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'access' && (
        <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-300 space-y-2">
          <p>Console roles: {(detail.consoleRoles ?? []).join(', ') || 'None'}</p>
          <Link to="/users/operators" className="text-emerald-400 hover:underline text-xs">
            Manage operators →
          </Link>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-slate-300">{s.device ?? s.id}</td>
                  <td className="px-4 py-3 text-slate-400">{s.last_seen ?? '—'}</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-slate-500">No session data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {auditEvents.map((e, i) => (
                <tr key={`${e.action}-${i}`}>
                  <td className="px-4 py-3 text-slate-400">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-300">{e.action}</td>
                  <td className="px-4 py-3 text-slate-400">{e.reason ?? '—'}</td>
                </tr>
              ))}
              {auditEvents.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">No audit events</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
