import React, { useCallback, useEffect, useState } from 'react';
import { supabaseFleetAdmin as supabase } from '@roam/auth-client';
import { hasProductAdminRole, jwtPrimaryRole, useForgotPassword, hasAnyJwtRole } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  Users,
  ExternalLink,
  LogOut,
  Loader2,
  CheckCircle2,
  MoreHorizontal,
  Trash2,
  X,
  HardDrive,
  BookOpen,
  Wrench,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  approveFleetCustomer,
  deleteFleetCustomer,
  fetchFleetAdminCustomers,
  reactivateFleetCustomer,
  signOutFleetCustomer,
  suspendFleetCustomer,
  type FleetAdminCustomer,
} from './fleetAdminService';
import { StorageCenterPage } from './storage/StorageCenterPage';
import { MaintenanceScheduleLedgerPage } from './ledger/MaintenanceScheduleLedgerPage';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAdminConfirm } from './contexts/AdminConfirmContext';

const DRIVER_ADMIN_URL = 'https://roamdriver.co/admin';
const RIDES_ADMIN_URL = 'https://roam-s.co/admin';

type AdminPage = 'dashboard' | 'customers' | 'storage' | 'ledger-maintenance';

function FleetAdminLogin({ onSession }: { onSession: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword('fleet', { signInHref: '/admin' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotMode) {
      setError(null);
      const err = await sendResetEmail(email);
      if (err) setError(err);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      if (!data.session) throw new Error('No session returned');
      const role = jwtPrimaryRole(data.session.user);
      if (!hasProductAdminRole(data.session.user, 'fleet')) {
        await supabase.auth.signOut();
        throw new Error('Fleet product admin access required');
      }
      onSession(data.session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-8"
      >
        <h1 className="text-lg font-semibold text-white">Roam Fleet Admin</h1>
        <p className="text-sm text-slate-400">Manage rideshare fleet manager accounts.</p>
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          required
        />
        {!forgotMode && (
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          required
        />
        )}
        {!forgotMode && (
          <button
            type="button"
            onClick={() => { setForgotMode(true); setError(null); setNotice(null); }}
            className="text-sm text-amber-400 hover:text-amber-300 text-left"
          >
            Forgot password?
          </button>
        )}
        {forgotMode && (
          <button
            type="button"
            onClick={() => { setForgotMode(false); setError(null); }}
            className="text-sm text-slate-400 hover:text-slate-300 text-left"
          >
            Back to sign in
          </button>
        )}
        <Button type="submit" className="w-full" disabled={loading || forgotLoading}>
          {loading || forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : forgotMode ? 'Send reset email' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

type ModalType = 'suspend' | null;

export function FleetProductAdminPortal() {
  const { confirm, prompt } = useAdminConfirm();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<FleetAdminCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [page, setPage] = useState<AdminPage>('dashboard');
  const [ledgerNavOpen, setLedgerNavOpen] = useState(true);
  
  // Action state
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<FleetAdminCustomer | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s && hasProductAdminRole(s.user, 'fleet')) {
        setSession(s);
      }
      setLoading(false);
    });
  }, []);

  const loadCustomers = useCallback(async () => {
    if (!session?.access_token) return;
    setCustomersLoading(true);
    try {
      setCustomers(await fetchFleetAdminCustomers(session.access_token, true));
    } catch (e) {
      console.error(e);
    } finally {
      setCustomersLoading(false);
    }
  }, [session?.access_token]);

  const userRole = session?.user ? jwtPrimaryRole(session.user) : null;
  const canDelete = session?.user
    ? hasAnyJwtRole(session.user, new Set(['fleet_admin', 'platform_owner', 'superadmin']))
    : false;

  const doSuspend = async () => {
    if (!session?.access_token || !selectedCustomer || !reason.trim()) return;
    setActionLoading(true);
    try {
      await suspendFleetCustomer(session.access_token, selectedCustomer.id, reason.trim());
      toast.success('Customer suspended');
      setModal(null);
      setSelectedCustomer(null);
      setReason('');
      void loadCustomers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to suspend');
    } finally {
      setActionLoading(false);
    }
  };

  const doReactivate = async (customer: FleetAdminCustomer) => {
    if (!session?.access_token) return;
    setActionLoading(true);
    try {
      await reactivateFleetCustomer(session.access_token, customer.id);
      toast.success('Customer reactivated');
      void loadCustomers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reactivate');
    } finally {
      setActionLoading(false);
    }
  };

  const doSignOut = async (customer: FleetAdminCustomer) => {
    if (!session?.access_token) return;
    const ok = await confirm({
      title: 'Sign out customer?',
      description: `Sign out ${customer.email} from all devices?`,
      confirmLabel: 'Sign out',
      variant: 'danger',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await signOutFleetCustomer(session.access_token, customer.id);
      toast.success('Customer signed out from all devices');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to sign out');
    } finally {
      setActionLoading(false);
    }
  };

  const doDelete = async (customer: FleetAdminCustomer) => {
    if (!session?.access_token) return;
    const values = await prompt({
      title: 'Remove from Roam Fleet?',
      description: (
        <>
          Removes fleet manager access for <span className="text-white">{customer.email}</span>. Their
          Roam login and other app profiles are untouched.
        </>
      ),
      confirmLabel: 'Remove',
      variant: 'danger',
      fields: [
        { key: 'reason', label: 'Reason', required: true, multiline: true },
        {
          key: 'confirm_name',
          label: `Type "${customer.email}" to confirm`,
          placeholder: customer.email,
          required: true,
          matchValue: customer.email,
        },
      ],
    });
    if (!values) return;
    setActionLoading(true);
    try {
      await deleteFleetCustomer(session.access_token, customer.id);
      toast.success('Customer removed from Roam Fleet');
      void loadCustomers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (session && page === 'customers') void loadCustomers();
  }, [session, page, loadCustomers]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <FleetAdminLogin onSession={setSession} />;
  }

  const pending = customers.filter((c) => c.accountStatus === 'pending_approval');
  const token = session.access_token;

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-56 border-r border-slate-800 p-4 flex flex-col gap-1">
        <div className="text-sm font-semibold text-white mb-4 px-2">Roam Fleet Admin</div>
        <button
          type="button"
          onClick={() => setPage('dashboard')}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${page === 'dashboard' ? 'bg-slate-800' : 'hover:bg-slate-900'}`}
        >
          <LayoutDashboard className="h-4 w-4" /> Dashboard
        </button>
        <button
          type="button"
          onClick={() => setPage('customers')}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${page === 'customers' ? 'bg-slate-800' : 'hover:bg-slate-900'}`}
        >
          <Users className="h-4 w-4" /> Fleet customers
        </button>
        <button
          type="button"
          onClick={() => setPage('storage')}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${page === 'storage' ? 'bg-slate-800' : 'hover:bg-slate-900'}`}
        >
          <HardDrive className="h-4 w-4" /> Storage
        </button>
        <div className="mt-1">
          <button
            type="button"
            onClick={() => {
              setLedgerNavOpen((o) => !o);
              if (!ledgerNavOpen) setPage('ledger-maintenance');
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              page.startsWith('ledger') ? 'bg-slate-800' : 'hover:bg-slate-900'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span className="flex-1 text-left">Ledger</span>
            {ledgerNavOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            )}
          </button>
          {ledgerNavOpen ? (
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-800 pl-2">
              <button
                type="button"
                onClick={() => setPage('ledger-maintenance')}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                  page === 'ledger-maintenance'
                    ? 'bg-slate-800/80 text-amber-100'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                Maintenance schedule
              </button>
            </div>
          ) : null}
        </div>
        <div className="mt-auto pt-4 border-t border-slate-800 space-y-1">
          <a
            href={DRIVER_ADMIN_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-900"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Driver admin
          </a>
          <a
            href={RIDES_ADMIN_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-900"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Rider admin
          </a>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut().then(() => setSession(null))}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-900"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        {page === 'dashboard' && (
          <div className="space-y-6 max-w-2xl">
            <h2 className="text-xl font-semibold">Dashboard</h2>
            <p className="text-sm text-slate-400">
              Rideshare stack operations — fleet managers, drivers, and riders.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPage('customers')}
                className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-left hover:border-slate-700"
              >
                <div className="text-2xl font-bold">{customers.length || '—'}</div>
                <div className="text-sm text-slate-400">Fleet manager accounts</div>
              </button>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
                <div className="text-2xl font-bold text-amber-200">{pending.length}</div>
                <div className="text-sm text-slate-400">Pending approval</div>
              </div>
            </div>
          </div>
        )}

        {page === 'storage' && (
          <StorageCenterPage accessToken={token} canPurge={canDelete} />
        )}

        {page === 'ledger-maintenance' && (
          <MaintenanceScheduleLedgerPage accessToken={token} />
        )}

        {page === 'customers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Fleet customers</h2>
              <Button variant="outline" size="sm" onClick={() => void loadCustomers()} disabled={customersLoading}>
                Refresh
              </Button>
            </div>
            {customersLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            ) : (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="text-left p-3">Name</th>
                      <th className="text-left p-3">Email</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} className="border-t border-slate-800">
                        <td className="p-3">{c.name}</td>
                        <td className="p-3 text-slate-400">{c.email}</td>
                        <td className="p-3">
                          {c.accountStatus === 'pending_approval' ? (
                            <span className="text-amber-400">Pending</span>
                          ) : c.isSuspended || c.accountStatus === 'suspended' ? (
                            <span className="text-red-400">Suspended</span>
                          ) : (
                            <span className="text-emerald-400">{c.status || 'Active'}</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {c.accountStatus === 'pending_approval' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={async () => {
                                  await approveFleetCustomer(token, c.id);
                                  await loadCustomers();
                                }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>
                            )}
                            <div className="relative">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setActionMenuId(actionMenuId === c.id ? null : c.id)}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                              {actionMenuId === c.id && (
                                <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-700 bg-slate-900 shadow-xl z-20 py-1 text-sm">
                                  {c.isSuspended || c.accountStatus === 'suspended' ? (
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 hover:bg-slate-800"
                                      onClick={() => {
                                        setActionMenuId(null);
                                        void doReactivate(c);
                                      }}
                                    >
                                      Reactivate account
                                    </button>
                                  ) : c.accountStatus !== 'pending_approval' && (
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 hover:bg-slate-800"
                                      onClick={() => {
                                        setActionMenuId(null);
                                        setSelectedCustomer(c);
                                        setModal('suspend');
                                      }}
                                    >
                                      Suspend account
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2"
                                    onClick={() => {
                                      setActionMenuId(null);
                                      void doSignOut(c);
                                    }}
                                  >
                                    <LogOut className="h-3.5 w-3.5" />
                                    Sign out all devices
                                  </button>
                                  {canDelete && (
                                    <>
                                      <hr className="my-1 border-slate-800" />
                                      <button
                                        type="button"
                                        className="w-full text-left px-3 py-2 hover:bg-slate-800 text-red-400 flex items-center gap-2"
                                        onClick={() => {
                                          setActionMenuId(null);
                                          void doDelete(c);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Remove from Fleet
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Suspend Modal */}
      {modal === 'suspend' && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setModal(null); setSelectedCustomer(null); setReason(''); }} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Suspend Customer</h3>
              <button
                type="button"
                onClick={() => { setModal(null); setSelectedCustomer(null); setReason(''); }}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-2">
              Suspending <strong>{selectedCustomer.email}</strong> will temporarily block their access to Roam Fleet.
            </p>
            <label className="block text-xs text-slate-500 mb-1 mt-4">Reason (required)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this customer being suspended?"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => { setModal(null); setSelectedCustomer(null); setReason(''); }}>
                Cancel
              </Button>
              <Button
                onClick={() => void doSuspend()}
                disabled={!reason.trim() || actionLoading}
                className="bg-amber-600 hover:bg-amber-500"
              >
                {actionLoading ? 'Suspending...' : 'Suspend'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
