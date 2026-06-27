export type InventoryNodeType = 'storefront' | 'commissary' | 'warehouse';
export type StorageZone = 'walk_in' | 'dry' | 'freezer' | 'ambient';
export type PoStatus = 'draft' | 'open' | 'partial' | 'closed' | 'cancelled';
export type TransferStatus = 'pending' | 'in_transit' | 'received' | 'cancelled';
export type CountStatus = 'open' | 'submitted' | 'posted' | 'cancelled';
export type LedgerTransactionType =
  | 'receiving'
  | 'pos_depletion'
  | 'waste'
  | 'transfer_in'
  | 'transfer_out'
  | 'physical_adjustment'
  | 'prep_production'
  | 'prep_consumption';
export type VarianceType = 'short' | 'damage' | 'overage';

export interface InventoryNode {
  id: string;
  name: string;
  nodeType: InventoryNodeType;
  merchantId?: string | null;
  isActive: boolean;
}

export interface UomDefinition {
  id: string;
  code: string;
  name: string;
  dimension: 'count' | 'weight' | 'volume';
}

export interface UomConversion {
  id: string;
  fromUomId: string;
  toUomId: string;
  fromUomCode: string;
  toUomCode: string;
  factor: number;
}

export interface ItemMaster {
  id: string;
  name: string;
  sku?: string | null;
  upc?: string | null;
  storageZone?: StorageZone | null;
  purchaseUomCode: string;
  storageUomCode: string;
  recipeUomCode: string;
  baseUomCode: string;
  reorderLevelBase: number;
  quantityOnHandBase: number;
  costPerBaseUnit: number;
  isActive: boolean;
  conversions: UomConversion[];
}

export interface Vendor {
  id: string;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
}

export interface VendorCatalogEntry {
  id: string;
  vendorId: string;
  vendorName: string;
  itemId: string;
  itemName: string;
  vendorSku: string;
  packSize: number;
  packUomCode: string;
  currentPrice: number;
  contractEndDate?: string | null;
  isPreferred: boolean;
}

export interface PurchaseOrderLine {
  id: string;
  itemId: string;
  itemName: string;
  qtyOrdered: number;
  uomCode: string;
  unitPrice: number;
  qtyReceived?: number;
}

export interface PurchaseOrder {
  id: string;
  nodeId: string;
  vendorId: string;
  vendorName: string;
  status: PoStatus;
  orderedAt: string;
  expectedAt?: string | null;
  lines: PurchaseOrderLine[];
}

export interface ReceivingLineInput {
  poLineId: string;
  qtyReceived: number;
  uomCode: string;
  shortQty?: number;
  damagedQty?: number;
}

export interface InventoryTransfer {
  id: string;
  fromNodeId: string;
  fromNodeName: string;
  toNodeId: string;
  toNodeName: string;
  status: TransferStatus;
  createdAt: string;
  receivedAt?: string | null;
  lines: Array<{ itemId: string; itemName: string; qty: number; uomCode: string }>;
}

export interface PhysicalCountItem {
  id: string;
  itemId: string;
  itemName: string;
  countedQty?: number | null;
  countedUomCode?: string | null;
}

export interface PhysicalCount {
  id: string;
  nodeId: string;
  status: CountStatus;
  blindMode: boolean;
  countDate: string;
  items: PhysicalCountItem[];
}

export interface RecipeIngredientV2 {
  id: string;
  itemId: string;
  itemName: string;
  qtyRequired: number;
  uomCode: string;
  yieldPct: number;
}

export interface RecipeV2 {
  id: string;
  menuItemId: string;
  menuItemName: string;
  yieldPct: number;
  ingredients: RecipeIngredientV2[];
}

export interface LedgerEntry {
  id: string;
  nodeId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  uomCode: string;
  quantityBase: number;
  transactionType: LedgerTransactionType;
  referenceType?: string | null;
  referenceId?: string | null;
  createdAt: string;
}

export interface VarianceRow {
  itemId: string;
  itemName: string;
  startingQtyBase: number;
  receivedQtyBase: number;
  transferInQtyBase: number;
  wastedQtyBase: number;
  transferOutQtyBase: number;
  theoreticalDepletionBase: number;
  theoreticalEndingBase: number;
  actualCountBase?: number | null;
  varianceQtyBase: number;
  varianceCost: number;
}

export interface LocationHierarchyNode {
  id: string;
  name: string;
  kind: 'company' | 'region' | 'group' | 'node';
  nodeType?: InventoryNodeType;
  children?: LocationHierarchyNode[];
}

export interface InventoryHubKpis {
  stockValue: number;
  lowStockCount: number;
  openPoCount: number;
  varianceCost: number;
}

export type EnterpriseInventoryView =
  | 'hub'
  | 'items'
  | 'item-detail'
  | 'vendors'
  | 'vendor-catalog'
  | 'purchase-orders'
  | 'po-edit'
  | 'receiving'
  | 'receiving-variance'
  | 'transfers'
  | 'transfer-receive'
  | 'count'
  | 'count-review'
  | 'recipes'
  | 'variance'
  | 'locations'
  | 'ledger';

export type InventoryMode = 'legacy' | 'enterprise';
