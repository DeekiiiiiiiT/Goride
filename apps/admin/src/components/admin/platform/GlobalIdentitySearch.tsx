import React, { useState } from 'react';
import { Search, Loader2, LogOut, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import { resolveRole } from '../../../utils/permissions';
import {
  lookupUserByEmail,
  forceLogout,
  fullDeleteUser,
  type CrossProductStatus,
} from '../../../services/platform/identityService';
import { CrossProductStatusPanel } from './CrossProductStatusPanel';
import { ConfirmationModal } from '../ConfirmationModal';

export function GlobalIdentitySearch() {
  const { session, role } = useAuth();
  const token = session?.access_token;
  const resolved = resolveRole(role || (session?.user as { user_metadata?: { role?: string } })?.user_metadata?.role);
  const isPlatformOwner = resolved === 'platform_owner';

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<CrossProductStatus | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState('');
  const [deleteStepOpen, setDeleteStepOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !email.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const row = await lookupUserByEmail(token, email.trim());
      setStatus(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lookup failed';
      toast.error(msg);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function runForceLogout() {
    if (!token || !status) return;
    setLogoutBusy(true);
    try {
      await forceLogout(token, status.user_id);
      toast.success('Sessions terminated.');
      const next = await lookupUserByEmail(token, status.email);
      setStatus(next);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Force logout failed');
    } finally {
      setLogoutBusy(false);
    }
  }

  async function runFullDelete() {
    if (!token || !status) return;
    if (deleteEmailConfirm.trim().toLowerCase() !== status.email.trim().toLowerCase()) {
      toast.error('Email does not match');
      return;
    }
    setDeleteBusy(true);
    try {
      await fullDeleteUser(token, status.user_id);
      toast.success('User permanently deleted.');
      setStatus(null);
      setEmail('');
      setDeleteEmailConfirm('');
      setDeleteStepOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Full delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Look up any auth user by email and review driver, rider, and fleet membership without opening a customer
          record.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@company.com"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-sm text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Search
        </button>
      </form>

      {status ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              Force sign out everywhere
            </button>
            {isPlatformOwner && (
              <>
                {!deleteStepOpen ? (
                  <button
                    type="button"
                    onClick={() => setDeleteStepOpen(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/15"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Full delete…
                  </button>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-[200px]">
                    <input
                      type="text"
                      value={deleteEmailConfirm}
                      onChange={(e) => setDeleteEmailConfirm(e.target.value)}
                      placeholder={`Type ${status.email} to confirm`}
                      className="flex-1 px-3 py-2 text-xs rounded-lg bg-white border border-red-300 text-slate-900 placeholder:text-slate-400 dark:bg-slate-950 dark:border-red-900/40 dark:text-white dark:placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => void runFullDelete()}
                      disabled={
                        deleteBusy ||
                        deleteEmailConfirm.trim().toLowerCase() !== status.email.trim().toLowerCase()
                      }
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-40"
                    >
                      {deleteBusy ? 'Deleting…' : 'Permanently delete user'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <CrossProductStatusPanel status={status} />

          {!isPlatformOwner && (
            <p className="text-[11px] text-slate-500">
              Full platform deletion is limited to platform owners. Product-scoped removal is available from Driver and
              Rides admin pages.
            </p>
          )}
        </div>
      ) : (
        loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        )
      )}

      <ConfirmationModal
        isOpen={confirmOpen}
        title="Force sign out?"
        message={`Terminate every active session for ${status?.email ?? 'this user'}?`}
        variant="danger"
        confirmLabel="Force sign out"
        loading={logoutBusy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void runForceLogout()}
      />
    </div>
  );
}
