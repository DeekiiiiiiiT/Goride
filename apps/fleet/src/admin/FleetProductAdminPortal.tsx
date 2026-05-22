import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase/client';
import { hasProductAdminRole, jwtPrimaryRole } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  Users,
  ExternalLink,
  LogOut,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { approveFleetCustomer, fetchFleetAdminCustomers, type FleetAdminCustomer } from './fleetAdminService';
import { Button } from '../components/ui/button';

const DRIVER_ADMIN_URL = 'https://roamdriver.co/admin';
const RIDES_ADMIN_URL = 'https://roam-s.co/admin';

function FleetAdminLogin({ onSession }: { onSession: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          required
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

export function FleetProductAdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<FleetAdminCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [page, setPage] = useState<'dashboard' | 'customers'>('dashboard');

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
                          ) : (
                            <span className="text-emerald-400">{c.status}</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
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
    </div>
  );
}
