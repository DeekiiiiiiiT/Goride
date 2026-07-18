/**
 * Workbench tab shell — Approvals / Settlement / Export + landing.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/api';
import type { FinancialTransaction } from '../../../types/data';
import type { BusinessFinanceBundle } from '../types';
import { WorkbenchHome, type WorkbenchPanel } from './WorkbenchHome';
import { WorkbenchApprovals } from './WorkbenchApprovals';
import { WorkbenchSettlement } from './WorkbenchSettlement';
import { WorkbenchExport } from './WorkbenchExport';

type Props = {
  bundle: BusinessFinanceBundle;
  onNavigatePage?: (page: string) => void;
  onOpenDriver?: (driverId: string) => void;
  initialPanel?: WorkbenchPanel;
};

export function WorkbenchTab({ bundle, onNavigatePage, onOpenDriver, initialPanel = 'home' }: Props) {
  const [panel, setPanel] = useState<WorkbenchPanel>(initialPanel);

  const pendingQ = useQuery({
    queryKey: ['workbench-pending-count'],
    queryFn: async () => {
      const res = await api.getTransactions(undefined, { limit: 500, offset: 0 });
      const list: FinancialTransaction[] = Array.isArray(res)
        ? res
        : Array.isArray((res as any)?.data)
          ? (res as any).data
          : Array.isArray((res as any)?.transactions)
            ? (res as any).transactions
            : [];
      return list.filter((t) => t.type === 'Expense' && t.status === 'Pending').length;
    },
    staleTime: 30_000,
  });

  if (panel === 'approvals') {
    return <WorkbenchApprovals period={bundle.period} onBack={() => setPanel('home')} />;
  }
  if (panel === 'settlement') {
    return (
      <WorkbenchSettlement
        rows={bundle.driverBalances.rows}
        onBack={() => setPanel('home')}
        onOpenDriver={onOpenDriver}
      />
    );
  }
  if (panel === 'export') {
    return <WorkbenchExport bundle={bundle} onBack={() => setPanel('home')} />;
  }

  return (
    <WorkbenchHome
      pendingApprovals={pendingQ.data ?? 0}
      settlementReadyCount={bundle.driverBalances.rows.length}
      onOpenPanel={setPanel}
      onNavigatePage={onNavigatePage}
    />
  );
}
