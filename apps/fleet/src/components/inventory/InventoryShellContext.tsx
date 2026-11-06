import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { asPagedItems, pagedTotal } from './inventoryData';
import { inventoryApi } from './inventoryApi';
import type { InventoryTabId } from './InventoryTabs';
import { useAuth } from '../auth/AuthContext';

export type InventoryModalId =
  | 'none'
  | 'receive'
  | 'issue'
  | 'custody'
  | 'item-drawer'
  | 'asset-page'
  | 'asset-move'
  | 'asset-condition'
  | 'asset-repair'
  | 'kit-editor'
  | 'first-time-setup'
  | 'inventory-settings'
  | 'opening-balances'
  | 'item-editor'
  | 'import-items'
  | 'locations-bins'
  | 'register-asset'
  | 'snooze-settings'
  | 'kit-compare'
  | 'driver-report-update';

export type InventoryGapContext = {
  itemId?: string | null;
  assetId?: string | null;
  reportId?: string | null;
};

export type InventoryShellState = {
  tab: InventoryTabId;
  setTab: (tab: InventoryTabId) => void;
  modal: InventoryModalId;
  openModal: (modal: InventoryModalId) => void;
  openGap: (modal: InventoryModalId, ctx?: InventoryGapContext) => void;
  closeModal: () => void;
  closeAndGoToTab: (next: InventoryTabId) => void;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
  selectedReportId: string | null;
  setSelectedReportId: (id: string | null) => void;
  selectedAlertId: string | null;
  setSelectedAlertId: (id: string | null) => void;
  setErrorBanner: (message: string | null) => void;
  readOnly: boolean;
  errorBanner: string | null;
  discrepancyBanner: string | null;
  overview: Record<string, unknown> | null;
  stockRows: Record<string, unknown>[];
  items: Record<string, unknown>[];
  movements: Record<string, unknown>[];
  movementsTotal: number;
  kitComplianceRows: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  tabLoading: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  refreshTab: () => Promise<void>;
  verifyLedger: () => Promise<void>;
};

const InventoryShellContext = createContext<InventoryShellState | null>(null);

async function loadTabPayload(tab: InventoryTabId): Promise<Partial<InventoryShellState>> {
  switch (tab) {
    case 'movements': {
      const data = await inventoryApi.movements();
      return {
        movements: asPagedItems(data),
        movementsTotal: pagedTotal(data) ?? asPagedItems(data).length,
      };
    }
    case 'vehicle-kits': {
      const data = await inventoryApi.kitsCompliance();
      return { kitComplianceRows: asPagedItems(data) };
    }
    case 'assets': {
      const data = await inventoryApi.assets();
      return { assets: asPagedItems(data) };
    }
    case 'alerts': {
      const data = await inventoryApi.alerts();
      return { alerts: asPagedItems(data) };
    }
    case 'stock': {
      const [stock, items] = await Promise.all([inventoryApi.stock(), inventoryApi.items()]);
      return {
        stockRows: asPagedItems(stock),
        items: asPagedItems(items),
      };
    }
    default:
      return {};
  }
}

export function InventoryShellProvider({
  tab,
  setTab,
  children,
}: {
  tab: InventoryTabId;
  setTab: (tab: InventoryTabId) => void;
  children: ReactNode;
}) {
  const { resolvedRole } = useAuth();
  const readOnly = resolvedRole === 'fleet_viewer';
  const [modal, setModal] = useState<InventoryModalId>('none');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [stockRows, setStockRows] = useState<Record<string, unknown>[]>([]);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [movements, setMovements] = useState<Record<string, unknown>[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [kitComplianceRows, setKitComplianceRows] = useState<Record<string, unknown>[]>([]);
  const [assets, setAssets] = useState<Record<string, unknown>[]>([]);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [discrepancyBanner, setDiscrepancyBanner] = useState<string | null>(null);

  const refreshOverview = useCallback(async () => {
    const [ov, stock, kits, assetPayload, alertPayload] = await Promise.all([
      inventoryApi.overview() as Promise<Record<string, unknown>>,
      inventoryApi.stock() as Promise<{ items?: Record<string, unknown>[] }>,
      inventoryApi.kitsCompliance() as Promise<{ items?: Record<string, unknown>[] }>,
      inventoryApi.assets() as Promise<{ items?: Record<string, unknown>[] }>,
      inventoryApi.alerts() as Promise<{ items?: Record<string, unknown>[] }>,
    ]);
    setOverview(ov);
    setStockRows(asPagedItems(stock));
    setKitComplianceRows(asPagedItems(kits));
    setAssets(asPagedItems(assetPayload));
    setAlerts(asPagedItems(alertPayload));
    const chainOk = (ov.chainCheck as { ok?: boolean } | undefined)?.ok;
    if (chainOk === false) {
      setDiscrepancyBanner('Ledger verification failed — review Movements before posting.');
    } else {
      setDiscrepancyBanner(null);
    }
    if (asPagedItems(stock).length === 0 && tab !== 'overview') {
      setModal('first-time-setup');
    }
  }, [tab]);

  const refreshTab = useCallback(async () => {
    setTabLoading(true);
    try {
      const patch = await loadTabPayload(tab);
      if (patch.movements) {
        setMovements(patch.movements);
        setMovementsTotal(patch.movementsTotal ?? patch.movements.length);
      }
      if (patch.kitComplianceRows) setKitComplianceRows(patch.kitComplianceRows);
      if (patch.assets) setAssets(patch.assets);
      if (patch.alerts) setAlerts(patch.alerts);
      if (patch.stockRows) setStockRows(patch.stockRows);
      if (patch.items) setItems(patch.items);
    } catch (e) {
      setErrorBanner(e instanceof Error ? e.message : 'Could not load inventory tab');
    } finally {
      setTabLoading(false);
    }
  }, [tab]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      await refreshOverview();
      await refreshTab();
    } catch (e) {
      setErrorBanner(e instanceof Error ? e.message : 'Could not load inventory');
    } finally {
      setLoading(false);
    }
  }, [refreshOverview, refreshTab]);

  const verifyLedger = useCallback(async () => {
    try {
      await inventoryApi.ledgerVerify();
      await refresh();
    } catch (e) {
      setErrorBanner(e instanceof Error ? e.message : 'Ledger verification failed');
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshTab();
  }, [refreshTab]);

  const closeModal = useCallback(() => setModal('none'), []);

  const openModal = useCallback((next: InventoryModalId) => {
    setModal(next);
  }, []);

  const closeAndGoToTab = useCallback(
    (next: InventoryTabId) => {
      setModal('none');
      setTab(next);
    },
    [setTab],
  );

  const openGap = useCallback((next: InventoryModalId, ctx?: InventoryGapContext) => {
    if (ctx?.itemId !== undefined) setSelectedItemId(ctx.itemId);
    if (ctx?.assetId !== undefined) setSelectedAssetId(ctx.assetId);
    if (ctx?.reportId !== undefined) setSelectedReportId(ctx.reportId);
    setModal(next);
  }, []);

  const value = useMemo<InventoryShellState>(
    () => ({
      tab,
      setTab,
      modal,
      openModal,
      openGap,
      closeModal,
      closeAndGoToTab,
      selectedItemId,
      setSelectedItemId,
      selectedAssetId,
      setSelectedAssetId,
      selectedReportId,
      setSelectedReportId,
      selectedAlertId,
      setSelectedAlertId,
      setErrorBanner,
      readOnly,
      errorBanner,
      discrepancyBanner,
      overview,
      stockRows,
      items,
      movements,
      movementsTotal,
      kitComplianceRows,
      assets,
      alerts,
      tabLoading,
      loading,
      refresh,
      refreshTab,
      verifyLedger,
    }),
    [
      tab,
      setTab,
      modal,
      selectedItemId,
      selectedAssetId,
      selectedReportId,
      selectedAlertId,
      readOnly,
      errorBanner,
      openModal,
      closeModal,
      overview,
      stockRows,
      items,
      movements,
      movementsTotal,
      kitComplianceRows,
      assets,
      alerts,
      tabLoading,
      loading,
      refresh,
      refreshTab,
      verifyLedger,
      openGap,
      closeAndGoToTab,
    ],
  );

  return (
    <InventoryShellContext.Provider value={value}>{children}</InventoryShellContext.Provider>
  );
}

export function useInventoryShell(): InventoryShellState {
  const ctx = useContext(InventoryShellContext);
  if (!ctx) throw new Error('useInventoryShell must be used within InventoryShellProvider');
  return ctx;
}
