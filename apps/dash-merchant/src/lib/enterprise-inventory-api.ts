import { deliveryFetch } from './partner-api';
import type {
  InventoryHubKpis,
  InventoryNode,
  ItemMaster,
  LedgerEntry,
  PurchaseOrder,
  RecipeV2,
  ReceivingLineInput,
  VarianceRow,
} from '../types/enterprise-inventory';

function mapNode(row: Record<string, unknown>): InventoryNode {
  return {
    id: String(row.id),
    name: String(row.name),
    nodeType: String(row.nodeType ?? row.node_type) as InventoryNode['nodeType'],
    merchantId: row.merchantId ? String(row.merchantId) : row.merchant_id ? String(row.merchant_id) : null,
    isActive: Boolean(row.isActive ?? row.is_active ?? true),
  };
}

function mapItem(row: Record<string, unknown>): ItemMaster {
  return {
    id: String(row.id),
    name: String(row.name),
    sku: row.sku ? String(row.sku) : null,
    upc: row.upc ? String(row.upc) : null,
    storageZone: (row.storageZone ?? row.storage_zone) as ItemMaster['storageZone'],
    purchaseUomCode: String(row.purchaseUomCode ?? 'each'),
    storageUomCode: String(row.storageUomCode ?? 'each'),
    recipeUomCode: String(row.recipeUomCode ?? 'each'),
    baseUomCode: String(row.baseUomCode ?? 'each'),
    reorderLevelBase: Number(row.reorderLevelBase ?? row.reorder_level_base ?? 0),
    quantityOnHandBase: Number(row.quantityOnHandBase ?? row.quantity_on_hand_base ?? 0),
    costPerBaseUnit: Number(row.costPerBaseUnit ?? 0),
    isActive: Boolean(row.isActive ?? row.is_active ?? true),
    conversions: (row.conversions as ItemMaster['conversions']) ?? [],
  };
}

export async function fetchNodes(): Promise<InventoryNode[]> {
  const data = await deliveryFetch('/merchant/enterprise-inventory/nodes');
  return ((data.nodes as Record<string, unknown>[]) ?? []).map(mapNode);
}

export async function fetchHubKpis(nodeId: string): Promise<InventoryHubKpis> {
  const data = await deliveryFetch(`/merchant/enterprise-inventory/hub-kpis?nodeId=${encodeURIComponent(nodeId)}`);
  return data.kpis as InventoryHubKpis;
}

export async function fetchItems(nodeId: string): Promise<ItemMaster[]> {
  const data = await deliveryFetch(`/merchant/enterprise-inventory/items?nodeId=${encodeURIComponent(nodeId)}`);
  return ((data.items as Record<string, unknown>[]) ?? []).map(mapItem);
}

export async function fetchItem(itemId: string, nodeId: string): Promise<ItemMaster> {
  const data = await deliveryFetch(
    `/merchant/enterprise-inventory/items/${itemId}?nodeId=${encodeURIComponent(nodeId)}`,
  );
  return mapItem(data.item as Record<string, unknown>);
}

export async function createItem(input: {
  name: string;
  sku?: string;
  unit?: string;
  reorderLevel?: number;
}): Promise<ItemMaster> {
  const data = await deliveryFetch('/merchant/enterprise-inventory/items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mapItem(data.item as Record<string, unknown>);
}

export async function adjustItemStock(
  itemId: string,
  nodeId: string,
  delta: number,
  reason?: string,
): Promise<{ quantityOnHandBase: number }> {
  return deliveryFetch(`/merchant/enterprise-inventory/items/${itemId}/stock`, {
    method: 'PATCH',
    body: JSON.stringify({ nodeId, delta, reason }),
  });
}

export async function fetchPurchaseOrders(nodeId: string): Promise<PurchaseOrder[]> {
  const data = await deliveryFetch(
    `/merchant/enterprise-inventory/purchase-orders?nodeId=${encodeURIComponent(nodeId)}`,
  );
  return (data.orders as PurchaseOrder[]) ?? [];
}

export async function receivePurchaseOrder(
  poId: string,
  lines: ReceivingLineInput[],
): Promise<{ receivingId: string }> {
  return deliveryFetch('/merchant/enterprise-inventory/receiving', {
    method: 'POST',
    body: JSON.stringify({ poId, lines }),
  });
}

export async function fetchLedger(params: {
  nodeId: string;
  itemId?: string;
}): Promise<LedgerEntry[]> {
  const qs = new URLSearchParams({ nodeId: params.nodeId });
  if (params.itemId) qs.set('itemId', params.itemId);
  const data = await deliveryFetch(`/merchant/enterprise-inventory/ledger?${qs}`);
  return ((data.entries as Record<string, unknown>[]) ?? []).map((e) => ({
    id: String(e.id),
    nodeId: String(e.nodeId),
    itemId: String(e.itemId),
    itemName: String(e.itemName),
    quantity: Number(e.quantity),
    uomCode: String(e.uomCode),
    quantityBase: Number(e.quantityBase),
    transactionType: e.transactionType as LedgerEntry['transactionType'],
    referenceType: e.referenceType ? String(e.referenceType) : null,
    referenceId: e.referenceId ? String(e.referenceId) : null,
    createdAt: String(e.createdAt),
  }));
}

export async function fetchVariance(
  nodeId: string,
  start?: string,
  end?: string,
): Promise<VarianceRow[]> {
  const qs = new URLSearchParams({ nodeId });
  if (start) qs.set('start', start);
  if (end) qs.set('end', end);
  const data = await deliveryFetch(`/merchant/enterprise-inventory/variance?${qs}`);
  return (data.rows as VarianceRow[]) ?? [];
}

export async function saveRecipe(menuItemId: string, recipe: RecipeV2): Promise<void> {
  await deliveryFetch(`/merchant/enterprise-inventory/recipes/${menuItemId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: recipe.menuItemName,
      yieldPct: recipe.yieldPct,
      ingredients: recipe.ingredients.map((ing) => ({
        itemId: ing.itemId,
        qtyRequired: ing.qtyRequired,
        uomId: ing.uomCode,
        yieldPct: ing.yieldPct,
      })),
    }),
  });
}

export async function patchInventorySettings(patch: {
  inventoryMode?: 'legacy' | 'enterprise';
  enterpriseInventoryShadow?: boolean;
}) {
  return deliveryFetch('/merchant/enterprise-inventory/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      inventoryMode: patch.inventoryMode,
      enterpriseInventoryShadow: patch.enterpriseInventoryShadow,
    }),
  });
}
