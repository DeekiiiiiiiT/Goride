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
import { inventoryApi, InventoryPhaseOffError } from './inventoryApi';
import type { InventoryTabId } from './InventoryTabs';
import { isModalAllowed, INVENTORY_PHASE_OFF_MESSAGE, type InventoryPhaseFlags } from './inventoryPhaseUi';
import { useAuth } from '../auth/AuthContext';
import { useInventoryPhaseFlags } from '../../hooks/useInventoryPhase2Flag';

export type InventoryModalId =
  | 'none'
  | 'receive'
  | 'issue'
  | 'custody'
  | 'item-drawer'
  | 'asset-page'
  | 'kit-editor'
  | 'first-time-setup'
  | 'inventory-settings'
  | 'opening-balances'
  | 'item-editor'
  | 'import-items'
  | 'locations-bins'
  | 'register-asset'
  | 'purchase-order'
  | 'vendor-editor'
  | 'count-session'
  | 'requisition'
  | 'approval-drawer'
  | 'scanner-pair'
  | 'snooze-settings'
  | 'kit-compare'
  | 'driver-report-update';

export type InventoryGapContext = {
  itemId?: string | null;
  assetId?: string | null;
  approvalId?: string | null;
  reportId?: string | null;
  vendorId?: string | null;
  poId?: string | null;
  countSessionId?: string | null;
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
  selectedApprovalId: string | null;
  setSelectedApprovalId: (id: string | null) => void;
  selectedReportId: string | null;
  setSelectedReportId: (id: string | null) => void;
  selectedVendorId: string | null;
  setSelectedVendorId: (id: string | null) => void;
  selectedPoId: string | null;
  setSelectedPoId: (id: string | null) => void;
  selectedAlertId: string | null;
  setSelectedAlertId: (id: string | null) => void;
  selectedCountSessionId: string | null;
  setSelectedCountSessionId: (id: string | null) => void;
  setErrorBanner: (message: string | null) => void;
  phaseNotice: string | null;
  setPhaseNotice: (message: string | null) => void;
  phaseFlags: InventoryPhaseFlags;
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
  purchaseOrders: Record<string, unknown>[];
  reorderSuggestions?: Record<string, unknown>[];
  vendors: Record<string, unknown>[];
  countSessions: Record<string, unknown>[];
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
    case 'purchasing': {
      const [pos, vendors] = await Promise.all([
        inventoryApi.purchaseOrders(),
        inventoryApi.vendors(),
      ]);
      return {
        purchaseOrders: asPagedItems(pos),
        vendors: asPagedItems(vendors),
      };
    }
    case 'counts': {
      const data = await inventoryApi.countSessions();
      return { countSessions: asPagedItems(data) };
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
  const phaseFlags = useInventoryPhaseFlags();
  const { resolvedRole } = useAuth();
  const readOnly = resolvedRole === 'fleet_viewer';
  const [modal, setModal] = useState<InventoryModalId>('none');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedCountSessionId, setSelectedCountSessionId] = useState<string | null>(null);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [stockRows, setStockRows] = useState<Record<string, unknown>[]>([]);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [movements, setMovements] = useState<Record<string, unknown>[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [kitComplianceRows, setKitComplianceRows] = useState<Record<string, unknown>[]>([]);
  const [assets, setAssets] = useState<Record<string, unknown>[]>([]);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<Record<string, unknown>[]>([]);
  const [vendors, setVendors] = useState<Record<string, unknown>[]>([]);
  const [countSessions, setCountSessions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [phaseNotice, setPhaseNotice] = useState<string | null>(null);
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
      if (patch.purchaseOrders) setPurchaseOrders(patch.purchaseOrders);
      if (patch.vendors) setVendors(patch.vendors);
      if (patch.countSessions) setCountSessions(patch.countSessions);
      if (patch.stockRows) setStockRows(patch.stockRows);
      if (patch.items) setItems(patch.items);
    } catch (e) {
      if (e instanceof InventoryPhaseOffError) {
        setPhaseNotice(e.message);
      } else {
        setErrorBanner(e instanceof Error ? e.message : 'Could not load inventory tab');
      }
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
      if (e instanceof InventoryPhaseOffError) {
        setPhaseNotice(e.message);
      } else {
        setErrorBanner(e instanceof Error ? e.message : 'Could not load inventory');
      }
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

  const openModal = useCallback(
    (next: InventoryModalId) => {
      if (next !== 'none' && !isModalAllowed(next, phaseFlags)) {
        setPhaseNotice(INVENTORY_PHASE_OFF_MESSAGE);
        return;
      }
      setModal(next);
    },
    [phaseFlags],
  );

  const closeAndGoToTab = useCallback(
    (next: InventoryTabId) => {
      setModal('none');
      setTab(next);
    },
    [setTab],
  );

  const openGap = useCallback(
    (next: InventoryModalId, ctx?: InventoryGapContext) => {
      if (!isModalAllowed(next, phaseFlags)) {
        setPhaseNotice(INVENTORY_PHASE_OFF_MESSAGE);
        return;
      }
      if (ctx?.itemId !== undefined) setSelectedItemId(ctx.itemId);
      if (ctx?.assetId !== undefined) setSelectedAssetId(ctx.assetId);
      if (ctx?.approvalId !== undefined) setSelectedApprovalId(ctx.approvalId);
      if (ctx?.reportId !== undefined) setSelectedReportId(ctx.reportId);
      if (ctx?.vendorId !== undefined) setSelectedVendorId(ctx.vendorId);
      if (ctx?.poId !== undefined) setSelectedPoId(ctx.poId);
      if (ctx?.countSessionId !== undefined) setSelectedCountSessionId(ctx.countSessionId);
      setModal(next);
    },
    [phaseFlags],
  );

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
      selectedApprovalId,
      setSelectedApprovalId,
      selectedReportId,
      setSelectedReportId,
      selectedVendorId,
      setSelectedVendorId,
      selectedPoId,
      setSelectedPoId,
      selectedAlertId,
      setSelectedAlertId,
      selectedCountSessionId,
      setSelectedCountSessionId,
      setErrorBanner,
      phaseNotice,
      setPhaseNotice,
      phaseFlags,
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
      purchaseOrders,
      vendors,
      countSessions,
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
      selectedApprovalId,
      selectedReportId,
      selectedVendorId,
      selectedPoId,
      selectedAlertId,
      selectedCountSessionId,
      readOnly,
      errorBanner,
      phaseNotice,
      setPhaseNotice,
      phaseFlags,
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
      purchaseOrders,
      vendors,
      countSessions,
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
