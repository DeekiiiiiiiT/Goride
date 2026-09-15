/**
 * Admin Remittance Desk — Layer A′ COD settle (search, live balance, receipt, reverse).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchRemittanceAccounts,
  fetchRemittanceExceptions,
  fetchRemittanceReconciliation,
  settleRemittance,
  reverseRemittanceSettlement,
  retryRemittanceException,
  resolveRemittanceException,
  updateRemittancePauseThreshold,
} from '@roam/dash-admin-client';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import type { AdminOutletContext } from '../../DashAdminPortal';

function fmtMinor(minor: number): string {
  return `J$${(minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function RemittanceDeskPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session);
  const token = session.access_token;

  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [exceptions, setExceptions] = useState<Array<Record<string, unknown>>>([]);
  const [recon, setRecon] = useState<{
    drift: unknown[];
    missingCollections: unknown[];
    trialBreaks: unknown[];
    legacyDrift?: unknown[];
    stalePending?: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amountJmd, setAmountJmd] = useState('');
  const [method, setMethod] = useState('lynk');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  /** R-4: one key per settle panel open — not per click. */
  const [settleIdempotencyKey, setSettleIdempotencyKey] = useState(() => crypto.randomUUID());
  const [thresholdJmd, setThresholdJmd] = useState('10000');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, e, r] = await Promise.all([
        fetchRemittanceAccounts(token),
        fetchRemittanceExceptions(token),
        fetchRemittanceReconciliation(token),
      ]);
      setAccounts(a.accounts ?? []);
      setExceptions(e.exceptions ?? []);
      setRecon(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load remittance desk');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => String(a.courier_id).toLowerCase().includes(q));
  }, [accounts, query]);

  const selected = accounts.find((a) => String(a.courier_id) === selectedId) ?? null;
  const expectedMinor = selected ? Number(selected.balance_minor ?? 0) : 0;

  const selectCourier = (id: string, balanceMinor: number, pauseThresholdMinor?: number) => {
    setSelectedId(id);
    setAmountJmd(String(balanceMinor / 100));
    setThresholdJmd(String((pauseThresholdMinor ?? 1000000) / 100));
    setSettleIdempotencyKey(crypto.randomUUID());
    setLastReceipt(null);
  };

  const handleSettle = async () => {
    if (!selectedId || !canWrite) return;
    const amount = Number(amountJmd);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    setBusy(true);
    try {
      const result = await settleRemittance(token, {
        courierId: selectedId,
        amountMinor: Math.round(amount * 100),
        method,
        expectedBalanceMinor: expectedMinor,
        idempotencyKey: settleIdempotencyKey,
        notes: notes || undefined,
      });
      if (!result.ok) {
        if (result.status === 409) {
          toast.error('Balance changed — refresh and try again');
          await load();
        } else {
          toast.error(result.error || 'Settle failed');
        }
        return;
      }
      setLastReceipt(result.reference ?? null);
      toast.success(`Settled — receipt ${result.reference}`);
      setAmountJmd('');
      setNotes('');
      setSettleIdempotencyKey(crypto.randomUUID());
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Settle failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReverse = async (settlementId: string) => {
    if (!canWrite) return;
    setBusy(true);
    try {
      const result = await reverseRemittanceSettlement(token, settlementId);
      if (!result.ok) {
        toast.error(result.error || 'Reverse failed');
        return;
      }
      toast.success('Settlement reversed');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reverse failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRetryException = async (id: string) => {
    if (!canWrite) return;
    setBusy(true);
    try {
      await retryRemittanceException(token, id);
      toast.success('Retry succeeded — exception cleared');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleResolveException = async (id: string) => {
    if (!canWrite) return;
    const note = window.prompt('Resolve note (optional)') ?? '';
    setBusy(true);
    try {
      await resolveRemittanceException(token, id, note || undefined);
      toast.success('Exception marked resolved');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resolve failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveThreshold = async () => {
    if (!selectedId || !canWrite) return;
    const jmd = Number(thresholdJmd);
    if (!(jmd > 0)) {
      toast.error('Threshold must be positive');
      return;
    }
    setBusy(true);
    try {
      await updateRemittancePauseThreshold(token, selectedId, Math.round(jmd * 100));
      toast.success('Pause threshold updated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Threshold update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Remittance Desk</h1>
          <p className="text-sm text-slate-400 mt-1">
            COD cash couriers owe Roam — settle here (not Driver Settlements Collect).
          </p>
        </div>
        <Link to="/pricing?tab=cod" className="text-sm text-amber-400 hover:underline">
          Pricing COD overview →
        </Link>
      </div>

      {exceptions.length > 0 && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4">
          <div className="flex items-center gap-2 text-amber-300 font-semibold mb-2">
            <AlertTriangle className="h-4 w-4" />
            Open exceptions ({exceptions.length})
          </div>
          <ul className="text-xs text-slate-300 space-y-2 max-h-48 overflow-y-auto">
            {exceptions.map((x) => (
              <li
                key={String(x.id)}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-900/40 pb-2"
              >
                <span>
                  Order {String(x.order_id).slice(0, 8)}… — {String(x.reason)}
                  {x.attempts != null ? ` · attempts ${String(x.attempts)}` : ''}
                </span>
                {canWrite && (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRetryException(String(x.id))}
                      className="px-2 py-1 rounded bg-amber-600 text-white text-[11px] font-medium disabled:opacity-50"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleResolveException(String(x.id))}
                      className="px-2 py-1 rounded border border-slate-600 text-slate-300 text-[11px] disabled:opacity-50"
                    >
                      Mark resolved
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recon && (recon.stalePending?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-red-700/50 bg-red-950/30 p-4">
          <p className="text-red-300 font-semibold text-sm mb-2">
            Stale pending settlements ({recon.stalePending!.length}) — settle may not have posted
          </p>
          <ul className="text-xs text-slate-300 space-y-1 max-h-32 overflow-y-auto">
            {recon.stalePending!.map((s) => (
              <li key={String(s.id)}>
                {String(s.reference)} · courier {String(s.courier_id).slice(0, 8)}… ·{' '}
                {fmtMinor(Number(s.amount_minor ?? 0))} — voided or retry via support; reverse only
                works on posted
              </li>
            ))}
          </ul>
        </div>
      )}

      {recon && (
        <div className="grid gap-3 sm:grid-cols-5 text-sm">
          {[
            { label: 'Ledger drift', n: recon.drift?.length ?? 0 },
            { label: 'Missing collections', n: recon.missingCollections?.length ?? 0 },
            { label: 'Trial breaks', n: recon.trialBreaks?.length ?? 0 },
            { label: 'Legacy drift', n: recon.legacyDrift?.length ?? 0 },
            { label: 'Stale pending', n: recon.stalePending?.length ?? 0 },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
            >
              <p className="text-slate-500 text-xs">{k.label}</p>
              <p className={`text-lg font-semibold ${k.n > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {k.n}
              </p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courier ID…"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
            />
            <div className="rounded-xl border border-slate-800 overflow-hidden max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-slate-400 text-xs sticky top-0">
                  <tr>
                    <th className="text-left p-2">Courier</th>
                    <th className="text-right p-2">Owed</th>
                    <th className="text-center p-2">Paused</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const id = String(a.courier_id);
                    const active = id === selectedId;
                    return (
                      <tr
                        key={id}
                        onClick={() =>
                          selectCourier(
                            id,
                            Number(a.balance_minor ?? 0),
                            Number(a.pause_threshold_minor ?? 1000000),
                          )
                        }
                        className={`cursor-pointer border-t border-slate-800 ${
                          active ? 'bg-amber-950/40' : 'hover:bg-slate-900/80'
                        }`}
                      >
                        <td className="p-2 font-mono text-xs text-slate-300">
                          {id.slice(0, 8)}…
                        </td>
                        <td className="p-2 text-right text-white">
                          {fmtMinor(Number(a.balance_minor ?? 0))}
                        </td>
                        <td className="p-2 text-center">
                          {a.is_paused ? (
                            <span className="text-red-400">Yes</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
            <h2 className="font-semibold text-white">Settle</h2>
            {!selected ? (
              <p className="text-sm text-slate-500">Pick a courier from the list.</p>
            ) : (
              <>
                <p className="text-sm text-slate-300">
                  Live balance:{' '}
                  <span className="font-semibold text-white">{fmtMinor(expectedMinor)}</span>
                </p>
                {canWrite ? (
                  <>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Pause threshold (JMD)
                        </label>
                        <input
                          value={thresholdJmd}
                          onChange={(e) => setThresholdJmd(e.target.value)}
                          className="w-32 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleSaveThreshold()}
                        className="px-3 py-2 rounded-lg border border-slate-600 text-slate-200 text-xs disabled:opacity-50"
                      >
                        Save threshold
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={amountJmd}
                        onChange={(e) => setAmountJmd(e.target.value)}
                        placeholder="Amount JMD"
                        className="w-36 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
                      />
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
                      >
                        <option value="lynk">Lynk</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cash_office">Cash office</option>
                        <option value="wipay">WiPay</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm min-h-[72px]"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSettle()}
                      className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {busy ? 'Working…' : 'Confirm settlement'}
                    </button>
                    {lastReceipt && (
                      <p className="text-xs text-emerald-400">Last receipt: {lastReceipt}</p>
                    )}
                    <button
                      type="button"
                      className="block text-xs text-slate-500 underline"
                      onClick={() => {
                        const sid = window.prompt('Settlement UUID to reverse');
                        if (sid) void handleReverse(sid.trim());
                      }}
                    >
                      Reverse a settlement by ID…
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Read-only role — cannot settle.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
