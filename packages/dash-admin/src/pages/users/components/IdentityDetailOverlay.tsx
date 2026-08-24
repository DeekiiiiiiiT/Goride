import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  getIdentityDetail,
  listIdentityAuditEvents,
  listIdentitySessions,
  revokeMerchantStaff,
  type IdentityDetail,
} from '@roam/dash-admin-client';
import { IdentityHeaderCard } from './IdentityHeaderCard';
import { IdentityActionBar } from './IdentityActionBar';
import { IdentityStatusBadge } from './IdentityStatusBadge';
import { useAdminConfirm } from '../../../contexts/AdminConfirmContext';
import { useDashAdminAccess } from '../../../hooks/useDashAdminAccess';
import type { IdentityActionScope } from './identityActions';

type Tab = 'overview' | 'customer' | 'courier' | 'merchant' | 'access' | 'sessions' | 'audit';

function tabToActionScope(tab: Tab): IdentityActionScope {
  switch (tab) {
    case 'customer':
      return 'customer';
    case 'courier':
      return 'courier';
    case 'merchant':
      return 'merchant_owner';
    default:
      return 'all';
  }
}

type PanelProps = {
  userId: string;
  accessToken: string;
  detail: IdentityDetail;
  onReload: () => void;
  /** Compact Actions dropdown instead of button bar */
  actionsAsMenu?: boolean;
};

export function IdentityDetailPanel({
  userId,
  accessToken,
  detail,
  onReload,
  actionsAsMenu = true,
}: PanelProps) {
  const { prompt } = useAdminConfirm();
  const { hasPermission } = useDashAdminAccess();
  const [tab, setTab] = useState<Tab>('overview');
  const [sessions, setSessions] = useState<Array<{ id: string; last_seen?: string; device?: string }>>([]);
  const [auditEvents, setAuditEvents] = useState<Array<{ action: string; created_at: string; reason?: string | null }>>([]);

  useEffect(() => {
    setTab('overview');
  }, [userId]);

  useEffect(() => {
    if (tab !== 'sessions') return;
    void listIdentitySessions(accessToken, userId)
      .then((r) => setSessions(r.sessions ?? []))
      .catch(() => setSessions([]));
  }, [tab, userId, accessToken]);

  useEffect(() => {
    if (tab !== 'audit') return;
    void listIdentityAuditEvents(accessToken, { target_user_id: userId, limit: 50 })
      .then((r) => setAuditEvents(r.events ?? []))
      .catch(() => setAuditEvents([]));
  }, [tab, userId, accessToken]);

  const handleRevokeStaff = async (memberId: string) => {
    const values = await prompt({
      title: 'Revoke staff access',
      description: 'Remove this person from the merchant team.',
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Reason', required: true, multiline: true }],
    });
    if (!values?.reason) return;
    try {
      await revokeMerchantStaff(accessToken, memberId, values.reason);
      toast.success('Staff access revoked');
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

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
      <IdentityHeaderCard detail={detail} userId={userId} />
      <IdentityActionBar
        userId={userId}
        detail={detail}
        accessToken={accessToken}
        onReload={onReload}
        variant={actionsAsMenu ? 'menu' : 'bar'}
        actionScope={tabToActionScope(tab)}
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

type OverlayProps = {
  open: boolean;
  userId: string | null;
  accessToken: string;
  onClose: () => void;
  onChanged?: () => void;
};

export function IdentityDetailOverlay({
  open,
  userId,
  accessToken,
  onClose,
  onChanged,
}: OverlayProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<IdentityDetail | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await getIdentityDetail(accessToken, userId);
      setDetail(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load person');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    if (!open || !userId) {
      setDetail(null);
      return;
    }
    void load();
  }, [open, userId, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !userId) return null;

  const title = detail
    ? String(detail.identity.display_name || detail.authEmail || userId)
    : 'Person';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-end sm:justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-overlay-title"
        className="relative w-full sm:max-w-2xl lg:max-w-3xl h-full sm:h-auto sm:max-h-[92vh] bg-slate-900 border-l sm:border border-slate-800 sm:rounded-xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
          <h2 id="identity-overlay-title" className="text-lg font-semibold text-white truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && !detail ? (
            <div className="flex justify-center py-16 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !detail ? (
            <p className="text-center py-16 text-slate-400">Person not found.</p>
          ) : (
            <IdentityDetailPanel
              userId={userId}
              accessToken={accessToken}
              detail={detail}
              actionsAsMenu
              onReload={() => {
                void load();
                onChanged?.();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
