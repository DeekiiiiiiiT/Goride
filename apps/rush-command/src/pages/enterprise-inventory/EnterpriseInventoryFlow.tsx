import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Merchant } from '../../hooks/useMerchant';
import { CAPABILITY_IN_STORE, hasCapability } from '../../lib/merchant-capabilities';
import { allowMocks } from '../../lib/mocksGate';
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
import type {
  EnterpriseInventoryView,
  InventoryTransfer,
  LocationHierarchyNode,
  PhysicalCount,
  RecipeV2,
  VarianceRow,
  Vendor,
  VendorCatalogEntry,
} from '../../types/enterprise-inventory';
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
  sectionTitle?: string;
}

function nodesToLocationTree(
  nodes: Array<{ id: string; name: string; nodeType: string }>,
  merchantName: string,
): LocationHierarchyNode[] {
  return [
    {
      id: `merchant-root`,
      name: merchantName,
      kind: 'company',
      children: nodes.map((n) => ({
        id: n.id,
        name: n.name,
        kind: 'node' as const,
        nodeType: n.nodeType as LocationHierarchyNode['nodeType'],
      })),
    },
  ];
}

export default function EnterpriseInventoryFlow({
  merchant,
  onBack,
  sectionTitle = 'Enterprise inventory',
}: EnterpriseInventoryFlowProps) {
  const useApi = hasCapability(merchant, CAPABILITY_IN_STORE);
  const mocksOk = allowMocks();
  const [view, setView] = useState<EnterpriseInventoryView>('hub');
  const [selectedNodeId, setSelectedNodeId] = useState(
    mocksOk ? (FIXTURE_NODES[0]?.id ?? '') : '',
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  const [nodes, setNodes] = useState(mocksOk ? FIXTURE_NODES : []);
  const [items, setItems] = useState(mocksOk ? FIXTURE_ITEMS : []);
  const [kpis, setKpis] = useState(
    mocksOk ? FIXTURE_KPIS : { stockValue: 0, lowStockCount: 0, openPoCount: 0, varianceCost: 0 },
  );
  const [orders, setOrders] = useState(mocksOk ? FIXTURE_POS : []);
  const [ledger, setLedger] = useState(mocksOk ? FIXTURE_LEDGER : []);
  const [activeCount, setActiveCount] = useState<PhysicalCount | null>(null);
  const [varianceRows, setVarianceRows] = useState<VarianceRow[]>(mocksOk ? FIXTURE_VARIANCE : []);
  // Vendors/transfers stay empty in production unless allowMocks — never flash fixtures as live data
  const [vendors, setVendors] = useState<Vendor[]>(mocksOk ? FIXTURE_VENDORS : []);
  const [vendorCatalog, setVendorCatalog] = useState<VendorCatalogEntry[]>(
    mocksOk ? FIXTURE_VENDOR_CATALOG : [],
  );
  const [transfers, setTransfers] = useState<InventoryTransfer[]>(
    mocksOk ? FIXTURE_TRANSFERS : [],
  );
  const [recipes, setRecipes] = useState<RecipeV2[]>(mocksOk ? FIXTURE_RECIPES_V2 : []);
  const [menuItems, setMenuItems] = useState(mocksOk ? FIXTURE_MENU_ITEMS : []);
  const [locationTree, setLocationTree] = useState<LocationHierarchyNode[]>(
    mocksOk ? FIXTURE_LOCATION_TREE : [],
  );

  const loadApi = useCallback(async () => {
    if (!useApi) return;
    try {
      const api = await import('../../lib/enterprise-inventory-api');
      const nodeList = await api.fetchNodes();
      const nodeId =
        (nodeList.some((n) => n.id === selectedNodeId) ? selectedNodeId : null) ??
        nodeList[0]?.id ??
        selectedNodeId;

      if (nodeList.length > 0 && nodeId !== selectedNodeId) {
        setSelectedNodeId(nodeId);
      }

      const [
        itemList,
        kpiData,
        poList,
        ledgerList,
        varianceList,
        vendorList,
        transferList,
        recipeList,
        hierarchy,
        menuData,
      ] = await Promise.all([
        api.fetchItems(nodeId),
        api.fetchHubKpis(nodeId),
        api.fetchPurchaseOrders(nodeId),
        api.fetchLedger({ nodeId }),
        api.fetchVariance(nodeId),
        api.fetchVendors(),
        api.fetchTransfers(nodeId),
        api.fetchRecipes(),
        api.fetchHierarchy(),
        import('../../lib/partner-api').then((m) => m.deliveryFetch('/merchant/menu')),
      ]);

      setNodes(nodeList.length > 0 ? nodeList : mocksOk ? FIXTURE_NODES : []);
      setItems(itemList);
      setKpis(kpiData);
      setOrders(poList);
      setLedger(ledgerList);
      setVarianceRows(varianceList);
      setVendors(vendorList);
      setTransfers(transferList);
      setRecipes(recipeList);
      setLocationTree(
        hierarchy.length > 0
          ? hierarchy
          : nodesToLocationTree(nodeList, merchant.name ?? 'Locations'),
      );
      const apiMenu = ((menuData.items as Array<{ id: string; name: string }>) ?? []).map((m) => ({
        id: m.id,
        name: m.name,
      }));
      if (apiMenu.length > 0) setMenuItems(apiMenu);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load inventory');
    }
  }, [useApi, selectedNodeId, merchant.name, mocksOk]);

  useEffect(() => {
    void loadApi();
  }, [loadApi]);

  useEffect(() => {
    if (!useApi || view !== 'count') return;
    let cancelled = false;
    void (async () => {
      try {
        const api = await import('../../lib/enterprise-inventory-api');
        const count = await api.createPhysicalCount(selectedNodeId);
        if (!cancelled) setActiveCount(count);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to start count');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useApi, view, selectedNodeId]);

  useEffect(() => {
    if (!useApi || view !== 'vendor-catalog' || !selectedVendorId) return;
    let cancelled = false;
    void (async () => {
      try {
        const api = await import('../../lib/enterprise-inventory-api');
        const entries = await api.fetchVendorCatalog(selectedVendorId);
        if (!cancelled) setVendorCatalog(entries);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load vendor catalog');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useApi, view, selectedVendorId]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const selectedPo = useMemo(
    () => orders.find((p) => p.id === selectedPoId) ?? null,
    [orders, selectedPoId],
  );

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

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
            onOpenUom={() => setView('uom')}
            useApi={useApi}
            onAdjust={useApi ? async (delta, reason) => {
              const api = await import('../../lib/enterprise-inventory-api');
              await api.adjustItemStock(selectedItem.id, selectedNodeId, delta, reason);
              await loadApi();
            } : undefined}
          />
        ) : null;
      case 'uom':
        return selectedItem ? (
          <UomConversionEditorView
            item={selectedItem}
            onBack={() => setView('item-detail')}
            useApi={useApi}
            onSave={useApi ? async (conversions) => {
              try {
                const api = await import('../../lib/enterprise-inventory-api');
                const saved = await api.saveUomConversions(selectedItem.id, conversions);
                setItems((prev) =>
                  prev.map((row) =>
                    row.id === selectedItem.id ? { ...row, conversions: saved } : row,
                  ),
                );
                toast.success('Conversions saved');
                setView('item-detail');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Failed to save conversions');
              }
            } : undefined}
          />
        ) : null;
      case 'vendors':
        return (
          <VendorDirectoryView
            vendors={vendors}
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
            entries={
              useApi
                ? vendorCatalog
                : FIXTURE_VENDOR_CATALOG.filter((e) => e.vendorId === selectedVendor.id)
            }
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
            transfers={transfers}
            nodes={nodes}
            items={items.map((i) => ({ id: i.id, name: i.name, baseUomCode: i.baseUomCode }))}
            useApi={useApi}
            onBack={goHub}
            onReceive={async (id) => {
              if (useApi) {
                try {
                  const api = await import('../../lib/enterprise-inventory-api');
                  await api.receiveTransfer(id);
                  await loadApi();
                  toast.success('Transfer received');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Receive failed');
                }
              } else {
                setView('transfer-receive');
              }
            }}
            onCreate={
              useApi
                ? async (input) => {
                    try {
                      const api = await import('../../lib/enterprise-inventory-api');
                      await api.createTransfer({
                        fromNodeId: input.fromNodeId,
                        toNodeId: input.toNodeId,
                        lines: [
                          {
                            itemId: input.itemId,
                            qty: input.qty,
                            uomCode: input.uomId,
                          },
                        ],
                      });
                      await loadApi();
                      toast.success('Transfer created');
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Transfer failed');
                    }
                  }
                : undefined
            }
          />
        );
      case 'transfer-receive':
        return (
          <TransferListView
            transfers={transfers.filter((t) => t.status === 'in_transit')}
            onReceive={async (id) => {
              if (useApi) {
                const api = await import('../../lib/enterprise-inventory-api');
                await api.receiveTransfer(id);
                await loadApi();
              }
              goHub();
            }}
            onBack={goHub}
          />
        );
      case 'count':
        return (
          <BlindCountView
            count={
              activeCount ??
              (mocksOk
                ? FIXTURE_COUNT
                : {
                    id: 'count-pending',
                    nodeId: selectedNodeId,
                    status: 'open' as const,
                    blindMode: true,
                    countDate: new Date().toISOString().slice(0, 10),
                    items: [],
                  })
            }
            useApi={useApi}
            onBack={goHub}
            onSubmitItem={async (itemId, qty, uomCode) => {
              if (useApi && activeCount) {
                try {
                  const api = await import('../../lib/enterprise-inventory-api');
                  await api.saveCountItem(activeCount.id, itemId, qty, uomCode);
                  setActiveCount((prev) =>
                    prev
                      ? {
                          ...prev,
                          items: prev.items.map((item) =>
                            item.itemId === itemId
                              ? { ...item, countedQty: qty, countedUomCode: uomCode }
                              : item,
                          ),
                        }
                      : prev,
                  );
                  toast.success('Count saved');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Failed to save count');
                }
              }
            }}
            onReview={async () => {
              if (useApi && activeCount) {
                try {
                  const api = await import('../../lib/enterprise-inventory-api');
                  await api.postPhysicalCount(activeCount.id);
                  const rows = await api.fetchVariance(selectedNodeId);
                  setVarianceRows(rows);
                  toast.success('Count posted');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Failed to post count');
                  return;
                }
              } else {
                setVarianceRows(FIXTURE_VARIANCE.slice(0, 2));
              }
              setView('count-review');
            }}
          />
        );
      case 'count-review':
        return (
          <VarianceReportView
            rows={useApi ? varianceRows : FIXTURE_VARIANCE.slice(0, 2)}
            onBack={() => setView('count')}
          />
        );
      case 'recipes':
        return (
          <RecipeEditorV2View
            recipes={recipes}
            menuItems={menuItems}
            inventoryItems={items.map((i) => ({
              id: i.id,
              name: i.name,
              recipeUomCode: i.recipeUomCode,
            }))}
            useApi={useApi}
            onBack={goHub}
            onSave={useApi ? async (menuItemId, recipe) => {
              try {
                const api = await import('../../lib/enterprise-inventory-api');
                await api.saveRecipe(menuItemId, recipe);
                await loadApi();
                toast.success('Recipe saved');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Failed to save recipe');
              }
            } : undefined}
          />
        );
      case 'variance':
        return (
          <VarianceReportView
            rows={useApi ? varianceRows : FIXTURE_VARIANCE}
            onBack={goHub}
          />
        );
      case 'locations':
        return <LocationHierarchyView tree={locationTree} onBack={goHub} />;
      case 'ledger':
        return <LedgerAuditView entries={ledger} onBack={goHub} />;
      default:
        return null;
    }
  };

  return (
    <InventoryHubChrome
      activeView={view}
      onViewChange={setView}
      onBack={onBack}
      title={sectionTitle}
      parentLabel="Inventory"
    >
      {!useApi && (
        <p className="mx-auto max-w-5xl px-margin-mobile py-inset-sm text-body-sm text-on-surface-variant md:px-margin-tablet">
          Restaurant Management is not enabled for this store.
        </p>
      )}
      {content()}
    </InventoryHubChrome>
  );
}
