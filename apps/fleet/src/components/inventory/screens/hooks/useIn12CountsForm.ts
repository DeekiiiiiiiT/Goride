import { useMemo, useState, useCallback } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { asRecord, numField, strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { buildCountSessionRow, buildCountVarianceLineRow } from '../../inventoryViewRows';
import type { CountSessionRow, CountVarianceLineRow } from '../../inventoryTypes';
import { useInScreenBase } from './useInShared';

/**
 * Stitch → data (In12 Counts)
 * batch location → CountSessionRow.locationLabel | auditor chip → CountSessionRow.auditorLabel | variance table → CountVarianceLineRow
 */
export function useIn12CountsForm() {
  const base = useInScreenBase();
  const { shell, submit, live } = base;
  const [lineAction, setLineAction] = useState('');
  const sessions = shell.countSessions;
  const selectedCountSessionId = shell.selectedCountSessionId;
  const setSelectedCountSessionId = shell.setSelectedCountSessionId;
  const [varianceReason, setVarianceReason] = useState('shrinkage');

  const sessionRows: CountSessionRow[] = useMemo(
    () => sessions.map((s) => buildCountSessionRow(s)),
    [sessions],
  );

  const pendingSession = useMemo(() => {
    if (selectedCountSessionId) {
      return sessions.find((s) => strField(s, 'id', '') === selectedCountSessionId) ?? null;
    }
    return (
      sessions.find((s) => {
        const st = strField(s, 'status', '').toLowerCase();
        return st.includes('submit') || st.includes('pending') || st.includes('approval');
      }) ?? null
    );
  }, [sessions, selectedCountSessionId]);

  const pendingSessionId = pendingSession ? strField(pendingSession, 'id', '') : '';
  const pendingSessionRow = pendingSession ? buildCountSessionRow(pendingSession) : null;

  const headerAuditorLabel = pendingSessionRow?.auditorLabel ?? sessionRows[0]?.auditorLabel ?? '—';
  const headerAuditorRole = strField(
    pendingSession ?? sessions[0] ?? {},
    'auditor_role',
    strField(pendingSession ?? sessions[0] ?? {}, 'auditor_title', '—'),
  );

  const countKpis = asRecord(shell.overview?.countKpis);
  const matchPctRaw = numField(countKpis, 'match_pct', numField(countKpis, 'accuracy_pct', NaN));
  const matchPctLabel = Number.isFinite(matchPctRaw) ? `${matchPctRaw.toFixed(1)}%` : sessionRows[0]?.matchPctLabel ?? '—';
  const stockRefCount = numField(countKpis, 'stock_reference_count', shell.stockRows.length);

  const varianceLineRows: CountVarianceLineRow[] = useMemo(() => {
    const lines = (pendingSession?.lines as Record<string, unknown>[] | undefined) ?? [];
    if (lines.length) {
      return lines.map((line, index) => buildCountVarianceLineRow(line, index, formatJmd));
    }
    return [];
  }, [pendingSession]);

  const copyAuditHash = useCallback((sessionId: string) => {
    const session = sessions.find((s) => strField(s, 'id', '') === sessionId);
    const hash = strField(session ?? {}, 'audit_hash', strField(session ?? {}, 'hash', ''));
    if (hash) void navigator.clipboard.writeText(hash);
  }, [sessions]);

  const viewRecord = (sessionId: string) => {
    const session = sessions.find((s) => strField(s, 'id', '') === sessionId);
    const movementId = strField(session ?? {}, 'movement_id', '');
    if (movementId) shell.setSelectedItemId(movementId);
    shell.setTab('movements');
  };

  const openSheet = (sessionId: string) => {
    setSelectedCountSessionId(sessionId);
    shell.openGap('count-session', { countSessionId: sessionId });
  };

  const sessionPrimaryAction = (row: CountSessionRow): { label: string; run: () => void } => {
    const st = row.status.toLowerCase();
    if (st.includes('submit') || st.includes('pending') || st.includes('approval')) {
      return { label: 'Open Sheet', run: () => openSheet(row.id) };
    }
    if (st.includes('reconcil') || st.includes('closed')) {
      const hash = strField(
        sessions.find((s) => strField(s, 'id', '') === row.id) ?? {},
        'audit_hash',
        '',
      );
      if (hash) return { label: 'Audit Hash', run: () => copyAuditHash(row.id) };
      return { label: 'View Record', run: () => viewRecord(row.id) };
    }
    return { label: 'View Record', run: () => viewRecord(row.id) };
  };

  const approve = (sessionId: string) =>
    submit.run(async () => {
      await inventoryApi.countApprove(sessionId);
      await shell.refresh();
      await shell.refreshTab();
    });

  const reject = (sessionId: string) =>
    submit.run(async () => {
      await inventoryApi.countReject(sessionId, { reason: 'Rejected from counts tab' });
      await shell.refresh();
      await shell.refreshTab();
    });

  const recount = (sessionId: string) =>
    submit.run(async () => {
      await inventoryApi.countRecount(sessionId);
      await shell.refresh();
      await shell.refreshTab();
    });

  const startCount = () => shell.openGap('count-session', { countSessionId: null });

  const approveDisabledReason = pendingSessionId ? '' : 'No count session pending approval';

  const valueLabel = useMemo(() => {
    let sum = 0;
    for (const s of sessions) {
      sum += Number(strField(s, 'variance_value_jmd', strField(s, 'book_value_jmd', '0')));
    }
    return formatJmd(sum || null);
  }, [sessions]);

  const signoffLeadLabel = pendingSessionRow?.approverLabel ?? headerAuditorLabel;

  return {
    ...base,
    shell,
    submit,
    live,
    sessions,
    sessionRows,
    selectedCountSessionId,
    setSelectedCountSessionId,
    pendingSession,
    pendingSessionId,
    pendingSessionRow,
    headerAuditorLabel,
    headerAuditorRole,
    matchPctLabel,
    stockRefCount,
    varianceLineRows,
    sessionPrimaryAction,
    varianceReason,
    setVarianceReason,
    copyAuditHash,
    viewRecord,
    lineAction,
    setLineAction,
    openSheet,
    approve,
    reject,
    recount,
    startCount,
    approveDisabledReason,
    signoffLeadLabel,
    valueLabel,
    formatJmd,
    strField,
  };
}
