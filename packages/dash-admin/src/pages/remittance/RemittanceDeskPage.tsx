/**
 * Admin Remittance Desk — Layer A′ COD settle (single operator home).
 * Order: health → queues → courier → history → actions.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchRemittanceAccounts,
  fetchRemittanceEvents,
  fetchRemittanceExceptions,
  fetchRemittanceReconciliation,
  settleRemittance,
  reverseRemittanceSettlement,
  reverseRemittanceWriteOff,
  retryRemittanceException,
  resolveRemittanceException,
  updateRemittancePauseThreshold,
  writeOffRemittance,
} from '@roam/dash-admin-client';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import type { AdminOutletContext } from '../../DashAdminPortal';

function fmtMinor(minor: number): string {
  return `J$${(minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function eventLabel(type: string): string {
  switch (type) {
    case 'collected':
      return 'Collection';
    case 'settled':
      return 'Settlement';
    case 'write_off':
      return 'Write-off';
    case 'reversal':
      return 'Reversal';
    case 'adjustment':
      return 'Adjustment';
    default:
      return type;
  }
}

const WRITE_OFF_REASONS = [
  { value: 'inactive_courier', label: 'Inactive courier' },
  { value: 'uncollectible', label: 'Uncollectible' },
  { value: 'ops_error', label: 'Ops / pricing error' },
  { value: 'other', label: 'Other' },
] as const;

export function RemittanceDeskPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const token = session.access_token;

  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [exceptions, setExceptions] = useState<Array<Record<string, unknown>>>([]);
  const [recon, setRecon] = useState<{
    drift: unknown[];
    missingCollections: unknown[];
    trialBreaks: unknown[];
    stalePending?: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [amountJmd, setAmountJmd] = useState('');
  const [method, setMethod] = useState('lynk');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  /** R-4: one key per settle panel open — not per click. */
  const [settleIdempotencyKey, setSettleIdempotencyKey] = useState(() => crypto.randomUUID());
  const [thresholdJmd, setThresholdJmd] = useState('10000');
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffReason, setWriteOffReason] = useState<string>('uncollectible');
  const [writeOffNotes, setWriteOffNotes] = useState('');
  const [writeOffConfirm, setWriteOffConfirm] = useState('');
  const [writeOffIdempotencyKey, setWriteOffIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [lastWriteOffEventId, setLastWriteOffEventId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const loadEvents = useCallback(
    async (courierId: string) => {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const r = await fetchRemittanceEvents(token, courierId, 50);
        setEvents(r.events ?? []);
      } catch (err) {
        setEvents([]);
        setEventsError(err instanceof Error ? err.message : 'Could not load history');
      } finally {
        setEventsLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      setEventsError(null);
      return;
    }
    void loadEvents(selectedId);
  }, [selectedId, loadEvents]);

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
    setWriteOffIdempotencyKey(crypto.randomUUID());
    setLastReceipt(null);
    setLastWriteOffEventId(null);
    setWriteOffOpen(false);
    setWriteOffNotes('');
    setWriteOffConfirm('');
  };

  const refreshAfterMoneyMove = async () => {
    await load();
    if (selectedId) await loadEvents(selectedId);
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
          await refreshAfterMoneyMove();
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
      await refreshAfterMoneyMove();
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
      await refreshAfterMoneyMove();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reverse failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReverseWriteOff = async (eventId: string) => {
    if (!canWrite) return;
    setBusy(true);
    try {
      const result = await reverseRemittanceWriteOff(token, eventId);
      if (!result.ok) {
        toast.error(result.error || 'Write-off reverse failed');
        return;
      }
      toast.success('Write-off reversed — balance restored');
      if (lastWriteOffEventId === eventId) setLastWriteOffEventId(null);
      await refreshAfterMoneyMove();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Write-off reverse failed');
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
      await refreshAfterMoneyMove();
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

  const handleWriteOff = async () => {
    if (!selectedId || !canWrite) return;
    const amount = Number(amountJmd);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a positive amount to write off');
      return;
    }
    if (writeOffNotes.trim().length < 8) {
      toast.error('Write-off notes must explain why (min 8 characters)');
      return;
    }
    if (writeOffConfirm.trim().toUpperCase() !== 'WRITE OFF') {
      toast.error('Type WRITE OFF to confirm');
      return;
    }
    setBusy(true);
    try {
      const result = await writeOffRemittance(token, {
        courierId: selectedId,
        amountMinor: Math.round(amount * 100),
        reasonCode: writeOffReason,
        notes: writeOffNotes.trim(),
        expectedBalanceMinor: expectedMinor,
        idempotencyKey: writeOffIdempotencyKey,
      });
      if (!result.ok) {
        if (result.status === 409) {
          toast.error('Balance changed — refresh and try again');
          await refreshAfterMoneyMove();
        } else {
          toast.error(result.error || 'Write-off failed');
        }
        return;
      }
      setLastWriteOffEventId(result.eventId ?? null);
      toast.success(`Wrote off — event ${result.eventId?.slice(0, 8) ?? ''}…`);
      setWriteOffOpen(false);
      setWriteOffNotes('');
      setWriteOffConfirm('');
      setWriteOffIdempotencyKey(crypto.randomUUID());
      setAmountJmd('');
      await refreshAfterMoneyMove();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Write-off failed');
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
            The only place to settle COD cash couriers owe Roam — never Driver Settlements Collect.
          </p>
        </div>
        <Link to="/pricing" className="text-sm text-slate-400 hover:text-amber-400 hover:underline">
          Pricing rules (defaults) →
        </Link>
      </div>

      {recon && (
        <div className="grid gap-3 sm:grid-cols-4 text-sm">
          {[
            {
              label: 'Ledger drift',
              hint: 'Balance ≠ sum of events',
              n: recon.drift?.length ?? 0,
            },
            {
              label: 'Missing collections',
              hint: 'Delivered cash with no ledger row',
              n: recon.missingCollections?.length ?? 0,
            },
            {
              label: 'Trial breaks',
              hint: 'Bag split no longer balances',
              n: recon.trialBreaks?.length ?? 0,
            },
            {
              label: 'Stale pending',
              hint: 'Settle started but not posted',
              n: recon.stalePending?.length ?? 0,
            },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
            >
              <p className="text-slate-500 text-xs">{k.label}</p>
              <p className={`text-lg font-semibold ${k.n > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {k.n}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">{k.hint}</p>
            </div>
          ))}
        </div>
      )}

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

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
              <h2 className="font-semibold text-white">Courier</h2>
              {!selected ? (
                <p className="text-sm text-slate-500">Pick a courier from the list.</p>
              ) : (
                <>
                  <p className="text-sm text-slate-300">
                    Live balance:{' '}
                    <span className="font-semibold text-white">{fmtMinor(expectedMinor)}</span>
                    {selected.is_paused ? (
                      <span className="ml-2 text-red-400 text-xs font-medium">Paused</span>
                    ) : null}
                    <span
                      className={`ml-2 text-[11px] font-medium ${
                        String(selected.threshold_source) === 'override'
                          ? 'text-amber-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {String(selected.threshold_source) === 'override'
                        ? 'Custom override'
                        : 'Default'}
                    </span>
                  </p>
                  {canWrite ? (
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="flex-1 min-w-[10rem]">
                        <label className="block text-[11px] text-slate-500 mb-1">
                          This courier&apos;s pause threshold (JMD)
                        </label>
                        <input
                          value={thresholdJmd}
                          onChange={(e) => setThresholdJmd(e.target.value)}
                          className="w-32 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm"
                        />
                        <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                          Saving here locks a custom override. Pricing Default updates only
                          couriers still on Default.
                        </p>
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
                  ) : (
                    <p className="text-sm text-slate-500">Read-only role — cannot settle.</p>
                  )}
                </>
              )}
            </div>

            {selected && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <h2 className="font-semibold text-white">History</h2>
                {eventsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                  </div>
                ) : eventsError ? (
                  <p className="text-sm text-red-400">{eventsError}</p>
                ) : events.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No remittance events yet for this courier.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-64 overflow-y-auto text-xs">
                    {events.map((ev) => {
                      const type = String(ev.event_type ?? '');
                      const amount = Number(ev.amount_minor ?? 0);
                      const settlementId =
                        ev.settlement_id != null ? String(ev.settlement_id) : null;
                      const eventId = String(ev.id);
                      const alreadyReversed = events.some(
                        (other) =>
                          String(other.event_type) === 'reversal' &&
                          String(other.reversal_of ?? '') === eventId,
                      );
                      return (
                        <li
                          key={eventId}
                          className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 space-y-1"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-slate-200 font-medium">{eventLabel(type)}</span>
                            <span
                              className={
                                amount < 0 ? 'text-emerald-400' : 'text-amber-300'
                              }
                            >
                              {amount >= 0 ? '+' : ''}
                              {fmtMinor(amount)}
                            </span>
                          </div>
                          <p className="text-slate-500">
                            {ev.created_at
                              ? new Date(String(ev.created_at)).toLocaleString()
                              : '—'}
                            {ev.order_id
                              ? ` · order ${String(ev.order_id).slice(0, 8)}…`
                              : ''}
                            {' · after '}
                            {fmtMinor(Number(ev.balance_after_minor ?? 0))}
                          </p>
                          {canWrite && type === 'write_off' && !alreadyReversed && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                const confirm = window.prompt('Type REVERSE to confirm');
                                if (confirm?.trim().toUpperCase() !== 'REVERSE') {
                                  toast.error('Type REVERSE to confirm');
                                  return;
                                }
                                void handleReverseWriteOff(eventId);
                              }}
                              className="text-[11px] text-red-300 underline disabled:opacity-50"
                            >
                              Reverse this write-off
                            </button>
                          )}
                          {canWrite && type === 'settled' && settlementId && !alreadyReversed && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    'Reverse this settlement? Balance will increase again.',
                                  )
                                ) {
                                  return;
                                }
                                void handleReverse(settlementId);
                              }}
                              className="text-[11px] text-slate-400 underline disabled:opacity-50"
                            >
                              Reverse this settlement
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {selected && canWrite && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
                <h2 className="font-semibold text-white">Actions</h2>
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

                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setWriteOffOpen((o) => !o)}
                    className="text-xs text-red-400/90 underline disabled:opacity-50"
                  >
                    {writeOffOpen ? 'Hide write-off' : 'Write off balance (forgiveness)…'}
                  </button>
                  {writeOffOpen && (
                    <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 space-y-3">
                      <p className="text-xs text-red-200/90">
                        This forgives what the courier owes Roam. It is not a payment. Prefer Settle
                        when cash/Lynk was received.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Amount above will be written off. Remaining after:{' '}
                        <span className="text-white">
                          {fmtMinor(
                            Math.max(
                              0,
                              expectedMinor - Math.round((Number(amountJmd) || 0) * 100),
                            ),
                          )}
                        </span>
                      </p>
                      <select
                        value={writeOffReason}
                        onChange={(e) => setWriteOffReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-red-900/50 text-white text-sm"
                      >
                        {WRITE_OFF_REASONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={writeOffNotes}
                        onChange={(e) => setWriteOffNotes(e.target.value)}
                        placeholder="Required: why this debt is forgiven"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-red-900/50 text-white text-sm min-h-[72px]"
                      />
                      <input
                        value={writeOffConfirm}
                        onChange={(e) => setWriteOffConfirm(e.target.value)}
                        placeholder="Type WRITE OFF to confirm"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-red-900/50 text-white text-sm"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleWriteOff()}
                        className="px-4 py-2 rounded-lg bg-red-800 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {busy ? 'Working…' : 'Confirm write-off'}
                      </button>
                      {lastWriteOffEventId && (
                        <p className="text-xs text-red-300/80">
                          Last write-off is in History — use Reverse on that row.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 pt-3">
                  <button
                    type="button"
                    className="text-[11px] text-slate-500 underline"
                    onClick={() => setAdvancedOpen((o) => !o)}
                  >
                    {advancedOpen ? 'Hide advanced UUID reverse' : 'Advanced: reverse by UUID…'}
                  </button>
                  {advancedOpen && (
                    <div className="mt-2 space-y-2">
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
                      <button
                        type="button"
                        className="block text-xs text-slate-500 underline"
                        onClick={() => {
                          const eid = window.prompt(
                            'Write-off event UUID to reverse\n\nRestores what the courier owes Roam. Does not create a cash receipt.',
                          );
                          if (!eid?.trim()) return;
                          const confirm = window.prompt('Type REVERSE to confirm');
                          if (confirm?.trim().toUpperCase() !== 'REVERSE') {
                            toast.error('Type REVERSE to confirm');
                            return;
                          }
                          void handleReverseWriteOff(eid.trim());
                        }}
                      >
                        Reverse a write-off by event ID…
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
