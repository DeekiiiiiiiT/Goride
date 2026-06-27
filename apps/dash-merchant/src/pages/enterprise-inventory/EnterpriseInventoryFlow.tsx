import { useCallback, useEffect, useMemo, useState } from 'react';
import { Merchant } from '../../hooks/useMerchant';
import { CAPABILITY_IN_STORE, hasCapability } from '../../lib/merchant-capabilities';
import { readFlag } from '../../lib/partner-feature-flags';
import {
  FIXTURE_COUNT,
  FIXTURE_ITEMS,
  FIXTURE_KPIS,
  FIXTURE_LEDGER,
  FIXTURE_LOCATION_TREE,
  FIXTURE_MENU_ITEMS,
  FIXTURE_NODES,
  FIXTURE_POS,
  FIXTURE_RECIPES_V2,
  FIXTURE_TRANSFERS,
  FIXTURE_VARIANCE,
  FIXTURE_VENDOR_CATALOG,
  FIXTURE_VENDORS,
} from '../../lib/enterprise-inventory-fixtures';
import type { EnterpriseInventoryView } from '../../types/enterprise-inventory';
import InventoryHubChrome from '../../components/enterprise-inventory/InventoryHubChrome';
import InventoryHubView from '../../components/enterprise-inventory/InventoryHubView';
import {
  ItemMasterDetailView,
  ItemMasterListView,
  UomConversionEditorView,
} from '../../components/enterprise-inventory/ItemMasterViews';
import {
  BlindCountView,
  LedgerAuditView,
  LocationHierarchyView,
  PurchaseOrdersListView,
  ReceivingWorkflowView,
  RecipeEditorV2View,
  TransferListView,
  VarianceReportView,
  VendorCatalogView,
  VendorDirectoryView,
} from '../../components/enterprise-inventory/OperationsViews';

interface EnterpriseInventoryFlowProps {
  merchant: Merchant;
  onBack: () => void;
}

export default function EnterpriseInventoryFlow({ merchant, onBack }: EnterpriseInventoryFlowProps) {
  const useApi = hasCapability(merchant, CAPABILITY_IN_STORE) && readFlag(merchant.id, 'enterpriseInventoryV1');
  const [view, setView] = useState<EnterpriseInventoryView>('hub');
  const [selectedNodeId, setSelectedNodeId] = useState(FIXTURE_NODES[0]?.id ?? '');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  const [nodes, setNodes] = useState(FIXTURE_NODES);
  const [items, setItems] = useState(FIXTURE_ITEMS);
  const [kpis, setKpis] = useState(FIXTURE_KPIS);
  const [orders, setOrders] = useState(FIXTURE_POS);
  const [ledger, setLedger] = useState(FIXTURE_LEDGER);

  const loadApi = useCallback(async () => {
    if (!useApi) return;
    try {
      const api = await import('../../lib/enterprise-inventory-api');
      const [nodeList, itemList, kpiData, poList, ledgerList] = await Promise.all([
        api.fetchNodes(),
        api.fetchItems(selectedNodeId),
        api.fetchHubKpis(selectedNodeId),
        api.fetchPurchaseOrders(selectedNodeId),
        api.fetchLedger({ nodeId: selectedNodeId }),
      ]);
      setNodes(nodeList);
      setItems(itemList);
      setKpis(kpiData);
      setOrders(poList);
      setLedger(ledgerList);
    } catch {
      // Keep fixtures on error
    }
  }, [useApi, selectedNodeId]);

  useEffect(() => {
    void loadApi();
  }, [loadApi]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const selectedPo = useMemo(
    () => orders.find((p) => p.id === selectedPoId) ?? null,
    [orders, selectedPoId],
  );

  const selectedVendor = FIXTURE_VENDORS.find((v) => v.id === selectedVendorId);

  const goHub = () => {
    setView('hub');
    setSelectedItemId(null);
    setSelectedVendorId(null);
    setSelectedPoId(null);
  };

  const content = () => {
    switch (view) {
      case 'hub':
        return (
          <InventoryHubView
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onNodeChange={setSelectedNodeId}
            kpis={kpis}
            onNavigate={setView}
          />
        );
      case 'items':
        return (
          <ItemMasterListView
            items={items}
            onSelect={(id) => {
              setSelectedItemId(id);
              setView('item-detail');
            }}
            onBack={goHub}
          />
        );
      case 'item-detail':
        return selectedItem ? (
          <ItemMasterDetailView
            item={selectedItem}
            onBack={() => setView('items')}
            onOpenUom={() => setView('items')}
            useApi={useApi}
            onAdjust={useApi ? async (delta, reason) => {
              const api = await import('../../lib/enterprise-inventory-api');
              await api.adjustItemStock(selectedItem.id, selectedNodeId, delta, reason);
              await loadApi();
            } : undefined}
          />
        ) : null;
      case 'vendors':
        return (
          <VendorDirectoryView
            vendors={FIXTURE_VENDORS}
            onOpenCatalog={(id) => {
              setSelectedVendorId(id);
              setView('vendor-catalog');
            }}
            onBack={goHub}
          />
        );
      case 'vendor-catalog':
        return selectedVendor ? (
          <VendorCatalogView
            vendorName={selectedVendor.name}
            entries={FIXTURE_VENDOR_CATALOG.filter((e) => e.vendorId === selectedVendor.id)}
            onBack={() => setView('vendors')}
          />
        ) : null;
      case 'purchase-orders':
        return (
          <PurchaseOrdersListView
            orders={orders}
            onSelect={setSelectedPoId}
            onStartReceive={(id) => {
              setSelectedPoId(id);
              setView('receiving');
            }}
            onBack={goHub}
          />
        );
      case 'receiving':
        return selectedPo ? (
          <ReceivingWorkflowView
            po={selectedPo}
            useApi={useApi}
            onBack={() => setView('purchase-orders')}
            onSubmit={async (lines) => {
              if (useApi) {
                const api = await import('../../lib/enterprise-inventory-api');
                await api.receivePurchaseOrder(selectedPo.id, lines);
                await loadApi();
              }
              setView('purchase-orders');
            }}
          />
        ) : null;
      case 'transfers':
        return (
          <TransferListView
            transfers={FIXTURE_TRANSFERS}
            onReceive={() => setView('transfer-receive')}
            onBack={goHub}
          />
        );
      case 'transfer-receive':
        return (
          <TransferListView transfers={FIXTURE_TRANSFERS.filter((t) => t.status === 'in_transit')} onReceive={goHub} />
        );
      case 'count':
        return (
          <BlindCountView
            count={FIXTURE_COUNT}
            useApi={useApi}
            onBack={goHub}
            onSubmitItem={async () => {
              setView('count-review');
            }}
          />
        );
      case 'count-review':
        return (
          <VarianceReportView rows={FIXTURE_VARIANCE.slice(0, 2)} onBack={() => setView('count')} />
        );
      case 'recipes':
        return (
          <RecipeEditorV2View
            recipes={FIXTURE_RECIPES_V2}
            menuItems={FIXTURE_MENU_ITEMS}
            useApi={useApi}
            onBack={goHub}
            onSave={useApi ? async (menuItemId, recipe) => {
              const api = await import('../../lib/enterprise-inventory-api');
              await api.saveRecipe(menuItemId, recipe);
            } : undefined}
          />
        );
      case 'variance':
        return <VarianceReportView rows={FIXTURE_VARIANCE} onBack={goHub} />;
      case 'locations':
        return <LocationHierarchyView tree={FIXTURE_LOCATION_TREE} onBack={goHub} />;
      case 'ledger':
        return <LedgerAuditView entries={ledger} onBack={goHub} />;
      default:
        return null;
    }
  };

  return (
    <InventoryHubChrome activeView={view} onViewChange={setView} onBack={onBack}>
      {!useApi && (
        <p className="mx-auto max-w-5xl px-margin-mobile py-inset-sm text-body-sm text-on-surface-variant md:px-margin-tablet">
          Preview mode — enable in-store operations and enterprise inventory flag for live data.
        </p>
      )}
      {content()}
    </InventoryHubChrome>
  );
}
