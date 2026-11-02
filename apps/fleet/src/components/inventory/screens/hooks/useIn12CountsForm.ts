import { useMemo, useState, useCallback } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { useInScreenBase } from './useInShared';

export function useIn12CountsForm() {
  const base = useInScreenBase();
  const { shell, submit } = base;
  const [lineAction, setLineAction] = useState('');
  const sessions = shell.countSessions;
  const [varianceReason, setVarianceReason] = useState('shrinkage');

  const pendingSession = useMemo(() => {
    return (
      sessions.find((s) => {
        const st = strField(s, 'status', '').toLowerCase();
        return st.includes('submit') || st.includes('pending') || st.includes('approval');
      }) ?? sessions[0] ??
      null
    );
  }, [sessions]);

  const pendingSessionId = pendingSession ? strField(pendingSession, 'id', '') : '';

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

  const openSheet = (sessionId: string) =>
    shell.openGap('count-session', { countSessionId: sessionId });

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

  const valueLabel = useMemo(() => {
    let sum = 0;
    for (const s of sessions) {
      sum += Number(strField(s, 'variance_value_jmd', strField(s, 'book_value_jmd', '0')));
    }
    return formatJmd(sum || null);
  }, [sessions]);

  return {
    ...base,
    shell,
    submit,
    sessions,
    pendingSessionId,
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
    valueLabel,
    formatJmd,
    strField,
  };
}
