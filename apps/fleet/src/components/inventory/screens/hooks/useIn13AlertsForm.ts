import { useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { buildAlertRow } from '../../inventoryViewRows';
import type { AlertRow, AlertResolvedRow } from '../../inventoryTypes';
import { useAuth } from '../../../auth/AuthContext';
import { useInScreenBase } from './useInShared';

export type AlertsTab = 'open' | 'assigned' | 'snoozed' | 'done';

function alertStatus(a: Record<string, unknown>): string {
  return strField(a, 'status', 'open').toLowerCase();
}

function isSnoozed(a: Record<string, unknown>): boolean {
  const until = strField(a, 'snoozed_until', '');
  if (!until) return alertStatus(a) === 'snoozed';
  return new Date(until).getTime() > Date.now();
}

export function useIn13AlertsForm() {
  const base = useInScreenBase();
  const { shell, submit } = base;
  const { user } = useAuth();
  const [tab, setTab] = useState<AlertsTab>('open');
  const [search, setSearch] = useState('');

  const alerts = shell.alerts;
  const selectedAlertId = shell.selectedAlertId;
  const setSelectedAlertId = shell.setSelectedAlertId;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts.filter((a) => {
      const st = alertStatus(a);
      const assignee = strField(a, 'assignee_id', strField(a, 'assignee', ''));
      if (tab === 'open') {
        if (!(st === 'open' || st === 'new')) return false;
        if (isSnoozed(a)) return false;
        if (assignee) return false;
      } else if (tab === 'assigned') {
        if (!assignee) return false;
        if (st === 'done' || st === 'closed') return false;
      } else if (tab === 'snoozed') {
        if (!isSnoozed(a)) return false;
      } else if (st !== 'done' && st !== 'closed') {
        return false;
      }
      if (!q) return true;
      const hay = [
        strField(a, 'title', ''),
        strField(a, 'message', ''),
        strField(a, 'kind', ''),
        strField(a, 'vehicle_plate', ''),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [alerts, tab, search]);

  const alertRows: AlertRow[] = useMemo(
    () => filtered.map((a) => buildAlertRow(a)),
    [filtered],
  );

  const selectedAlert = useMemo(() => {
    if (!selectedAlertId) return null;
    return alerts.find((a) => strField(a, 'id', '') === selectedAlertId) ?? null;
  }, [alerts, selectedAlertId]);

  const selectedAlertRow = useMemo(
    () => (selectedAlert ? buildAlertRow(selectedAlert) : null),
    [selectedAlert],
  );

  const selectAlert = (id: string | null) => setSelectedAlertId(id);

  const tabCounts = useMemo(
    () => ({
      open: alerts.filter((a) => {
        const st = alertStatus(a);
        const assignee = strField(a, 'assignee_id', strField(a, 'assignee', ''));
        return (st === 'open' || st === 'new') && !isSnoozed(a) && !assignee;
      }).length,
      assigned: alerts.filter((a) => {
        const st = alertStatus(a);
        const assignee = strField(a, 'assignee_id', strField(a, 'assignee', ''));
        return !!assignee && st !== 'done' && st !== 'closed';
      }).length,
      snoozed: alerts.filter((a) => isSnoozed(a)).length,
      done: alerts.filter((a) => {
        const st = alertStatus(a);
        return st === 'done' || st === 'closed';
      }).length,
    }),
    [alerts],
  );

  const markAllViewed = () =>
    submit.run(async () => {
      for (const a of alerts) {
        const id = strField(a, 'id', '');
        const st = alertStatus(a);
        if (id && (st === 'open' || st === 'new')) {
          await inventoryApi.alertViewed(id);
        }
      }
      await shell.refresh();
    });

  const markDone = (id: string) =>
    submit.run(async () => {
      await inventoryApi.alertDone(id);
      await shell.refresh();
    });

  const markViewed = (id: string) =>
    submit.run(async () => {
      await inventoryApi.alertViewed(id);
      await shell.refresh();
    });

  const assignToMe = (id: string) =>
    submit.run(async () => {
      const userId = user?.id;
      if (!userId) throw new Error('Not signed in');
      await inventoryApi.alertAssign(id, userId);
      await shell.refresh();
    });

  const openRelated = (alert: Record<string, unknown>) => {
    const itemId = strField(alert, 'item_id', '');
    const assetId = strField(alert, 'asset_id', '');
    const vehicleId = strField(alert, 'vehicle_id', '');
    if (itemId) {
      shell.setSelectedItemId(itemId);
      shell.openModal('item-drawer');
    } else if (assetId) {
      shell.setSelectedAssetId(assetId);
      shell.openModal('asset-page');
    } else if (vehicleId) {
      shell.setTab('vehicle-kits');
    } else {
      void markViewed(strField(alert, 'id', ''));
    }
  };

  const reorder = (alert: Record<string, unknown>) => {
    const itemId = strField(alert, 'item_id', '') || null;
    shell.openGap('requisition', { itemId });
  };

  const reviewApproval = (alert: Record<string, unknown>) => {
    const approvalId =
      strField(alert, 'approval_id', '') || strField(alert, 'id', '') || null;
    shell.openGap('approval-drawer', { approvalId });
  };

  const addSerial = (alert: Record<string, unknown>) => {
    const assetId = strField(alert, 'asset_id', '');
    if (assetId) shell.setSelectedAssetId(assetId);
    shell.openModal('asset-page');
  };

  const newRequisition = () => shell.openGap('requisition', { itemId: null });

  const markDoneSelectedDisabledReason = selectedAlertId ? '' : 'Select an alert first';

  const resolvedAlertRows: AlertResolvedRow[] = useMemo(
    () =>
      shell.alerts
        .filter((a) => {
          const st = alertStatus(a);
          return st === 'done' || st === 'closed';
        })
        .slice(0, 6)
        .map((a) => {
          const row = buildAlertRow(a);
          return {
            id: row.id,
            title: row.title,
            resolverLabel: strField(a, 'resolved_by_name', row.assigneeLabel || '—'),
            whenLabel: strField(a, 'resolved_at', strField(a, 'updated_at', '—')),
          };
        }),
    [shell.alerts],
  );

  return {
    ...base,
    shell,
    submit,
    tab,
    setTab,
    search,
    setSearch,
    filtered,
    alertRows,
    selectedAlertId,
    selectAlert,
    selectedAlert,
    selectedAlertRow,
    tabCounts,
    markAllViewed,
    markDone,
    markViewed,
    assignToMe,
    openRelated,
    reorder,
    reviewApproval,
    addSerial,
    newRequisition,
    markDoneSelectedDisabledReason,
    resolvedAlertRows,
    formatJmd,
    strField,
  };
}
