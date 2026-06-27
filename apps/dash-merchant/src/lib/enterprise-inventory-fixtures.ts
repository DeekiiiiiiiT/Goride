import type {
  InventoryHubKpis,
  InventoryNode,
  ItemMaster,
  LedgerEntry,
  LocationHierarchyNode,
  PhysicalCount,
  PurchaseOrder,
  RecipeV2,
  UomDefinition,
  VarianceRow,
  Vendor,
  VendorCatalogEntry,
  InventoryTransfer,
} from '../types/enterprise-inventory';

export const FIXTURE_UOMS: UomDefinition[] = [
  { id: 'uom-case', code: 'case', name: 'Case', dimension: 'count' },
  { id: 'uom-can', code: 'can', name: 'Can', dimension: 'count' },
  { id: 'uom-oz', code: 'oz', name: 'Ounce', dimension: 'weight' },
  { id: 'uom-each', code: 'each', name: 'Each', dimension: 'count' },
  { id: 'uom-lb', code: 'lb', name: 'Pound', dimension: 'weight' },
];

export const FIXTURE_NODES: InventoryNode[] = [
  { id: 'node-store-1', name: 'Kingston Downtown', nodeType: 'storefront', merchantId: null, isActive: true },
  { id: 'node-comm-1', name: 'Central Commissary', nodeType: 'commissary', merchantId: null, isActive: true },
  { id: 'node-wh-1', name: 'Montego Bay Warehouse', nodeType: 'warehouse', merchantId: null, isActive: true },
];

export const FIXTURE_ITEMS: ItemMaster[] = [
  {
    id: 'item-tomato',
    name: '#10 Diced Tomatoes',
    sku: 'TOM-10',
    upc: '012345678901',
    storageZone: 'dry',
    purchaseUomCode: 'case',
    storageUomCode: 'can',
    recipeUomCode: 'oz',
    baseUomCode: 'oz',
    reorderLevelBase: 320,
    quantityOnHandBase: 480,
    costPerBaseUnit: 0.18,
    isActive: true,
    conversions: [
      { id: 'c1', fromUomId: 'uom-case', toUomId: 'uom-can', fromUomCode: 'case', toUomCode: 'can', factor: 6 },
      { id: 'c2', fromUomId: 'uom-can', toUomId: 'uom-oz', fromUomCode: 'can', toUomCode: 'oz', factor: 102 },
    ],
  },
  {
    id: 'item-patty',
    name: 'Beef Patty 4oz',
    sku: 'BF-4OZ',
    upc: null,
    storageZone: 'walk_in',
    purchaseUomCode: 'case',
    storageUomCode: 'each',
    recipeUomCode: 'each',
    baseUomCode: 'each',
    reorderLevelBase: 80,
    quantityOnHandBase: 42,
    costPerBaseUnit: 180,
    isActive: true,
    conversions: [
      { id: 'c3', fromUomId: 'uom-case', toUomId: 'uom-each', fromUomCode: 'case', toUomCode: 'each', factor: 40 },
    ],
  },
  {
    id: 'item-bun',
    name: 'Burger Bun',
    sku: 'BUN-SES',
    upc: null,
    storageZone: 'dry',
    purchaseUomCode: 'case',
    storageUomCode: 'each',
    recipeUomCode: 'each',
    baseUomCode: 'each',
    reorderLevelBase: 120,
    quantityOnHandBase: 8,
    costPerBaseUnit: 45,
    isActive: true,
    conversions: [
      { id: 'c4', fromUomId: 'uom-case', toUomId: 'uom-each', fromUomCode: 'case', toUomCode: 'each', factor: 24 },
    ],
  },
];

export const FIXTURE_KPIS: InventoryHubKpis = {
  stockValue: 284500,
  lowStockCount: 2,
  openPoCount: 1,
  varianceCost: 4200,
};

export const FIXTURE_VENDORS: Vendor[] = [
  { id: 'v-sysco', name: 'Sysco Jamaica', contactEmail: 'orders@sysco.jm', contactPhone: '+18765550100', isActive: true },
  { id: 'v-local', name: 'Portmore Provisions', contactEmail: null, contactPhone: '+18765550200', isActive: true },
];

export const FIXTURE_VENDOR_CATALOG: VendorCatalogEntry[] = [
  {
    id: 'vc-1',
    vendorId: 'v-sysco',
    vendorName: 'Sysco Jamaica',
    itemId: 'item-tomato',
    itemName: '#10 Diced Tomatoes',
    vendorSku: 'SY-TOM10',
    packSize: 1,
    packUomCode: 'case',
    currentPrice: 4200,
    contractEndDate: '2026-12-31',
    isPreferred: true,
  },
  {
    id: 'vc-2',
    vendorId: 'v-local',
    vendorName: 'Portmore Provisions',
    itemId: 'item-patty',
    itemName: 'Beef Patty 4oz',
    vendorSku: 'PP-BF40',
    packSize: 1,
    packUomCode: 'case',
    currentPrice: 6800,
    contractEndDate: null,
    isPreferred: false,
  },
];

export const FIXTURE_POS: PurchaseOrder[] = [
  {
    id: 'po-1001',
    nodeId: 'node-store-1',
    vendorId: 'v-sysco',
    vendorName: 'Sysco Jamaica',
    status: 'open',
    orderedAt: '2026-06-24T10:00:00Z',
    expectedAt: '2026-06-26T14:00:00Z',
    lines: [
      { id: 'pol-1', itemId: 'item-tomato', itemName: '#10 Diced Tomatoes', qtyOrdered: 4, uomCode: 'case', unitPrice: 4200 },
      { id: 'pol-2', itemId: 'item-bun', itemName: 'Burger Bun', qtyOrdered: 2, uomCode: 'case', unitPrice: 1100 },
    ],
  },
  {
    id: 'po-1000',
    nodeId: 'node-store-1',
    vendorId: 'v-local',
    vendorName: 'Portmore Provisions',
    status: 'closed',
    orderedAt: '2026-06-20T09:00:00Z',
    expectedAt: null,
    lines: [
      { id: 'pol-3', itemId: 'item-patty', itemName: 'Beef Patty 4oz', qtyOrdered: 3, uomCode: 'case', unitPrice: 6800, qtyReceived: 3 },
    ],
  },
];

export const FIXTURE_TRANSFERS: InventoryTransfer[] = [
  {
    id: 'tr-1',
    fromNodeId: 'node-comm-1',
    fromNodeName: 'Central Commissary',
    toNodeId: 'node-store-1',
    toNodeName: 'Kingston Downtown',
    status: 'in_transit',
    createdAt: '2026-06-25T08:00:00Z',
    lines: [
      { itemId: 'item-patty', itemName: 'Beef Patty 4oz', qty: 2, uomCode: 'case' },
    ],
  },
];

export const FIXTURE_COUNT: PhysicalCount = {
  id: 'cnt-1',
  nodeId: 'node-store-1',
  status: 'open',
  blindMode: true,
  countDate: '2026-06-25',
  items: [
    { id: 'ci-1', itemId: 'item-patty', itemName: 'Beef Patty 4oz', countedQty: null, countedUomCode: null },
    { id: 'ci-2', itemId: 'item-bun', itemName: 'Burger Bun', countedQty: null, countedUomCode: null },
    { id: 'ci-3', itemId: 'item-tomato', itemName: '#10 Diced Tomatoes', countedQty: null, countedUomCode: null },
  ],
};

export const FIXTURE_RECIPES_V2: RecipeV2[] = [
  {
    id: 'rec-burger',
    menuItemId: 'item-burger',
    menuItemName: 'Classic Burger',
    yieldPct: 100,
    ingredients: [
      { id: 'ri-1', itemId: 'item-patty', itemName: 'Beef Patty 4oz', qtyRequired: 1, uomCode: 'each', yieldPct: 100 },
      { id: 'ri-2', itemId: 'item-bun', itemName: 'Burger Bun', qtyRequired: 1, uomCode: 'each', yieldPct: 95 },
    ],
  },
];

export const FIXTURE_VARIANCE: VarianceRow[] = [
  {
    itemId: 'item-bun',
    itemName: 'Burger Bun',
    startingQtyBase: 32,
    receivedQtyBase: 48,
    transferInQtyBase: 0,
    wastedQtyBase: 2,
    transferOutQtyBase: 0,
    theoreticalDepletionBase: 68,
    theoreticalEndingBase: 10,
    actualCountBase: 8,
    varianceQtyBase: -2,
    varianceCost: 90,
  },
  {
    itemId: 'item-patty',
    itemName: 'Beef Patty 4oz',
    startingQtyBase: 50,
    receivedQtyBase: 80,
    transferInQtyBase: 40,
    wastedQtyBase: 0,
    transferOutQtyBase: 0,
    theoreticalDepletionBase: 120,
    theoreticalEndingBase: 50,
    actualCountBase: 42,
    varianceQtyBase: -8,
    varianceCost: 1440,
  },
];

export const FIXTURE_LEDGER: LedgerEntry[] = [
  {
    id: 'le-1',
    nodeId: 'node-store-1',
    itemId: 'item-patty',
    itemName: 'Beef Patty 4oz',
    quantity: 80,
    uomCode: 'each',
    quantityBase: 80,
    transactionType: 'receiving',
    referenceType: 'po',
    referenceId: 'po-1000',
    createdAt: '2026-06-20T11:00:00Z',
  },
  {
    id: 'le-2',
    nodeId: 'node-store-1',
    itemId: 'item-patty',
    itemName: 'Beef Patty 4oz',
    quantity: -24,
    uomCode: 'each',
    quantityBase: -24,
    transactionType: 'pos_depletion',
    referenceType: 'order',
    referenceId: 'ord-8821',
    createdAt: '2026-06-24T18:30:00Z',
  },
];

export const FIXTURE_LOCATION_TREE: LocationHierarchyNode[] = [
  {
    id: 'co-1',
    name: 'Roam Kitchen Group',
    kind: 'company',
    children: [
      {
        id: 'rg-1',
        name: 'Greater Kingston',
        kind: 'region',
        children: [
          {
            id: 'gr-1',
            name: 'Corporate Stores',
            kind: 'group',
            children: [
              { id: 'node-store-1', name: 'Kingston Downtown', kind: 'node', nodeType: 'storefront' },
            ],
          },
        ],
      },
      {
        id: 'rg-2',
        name: 'Western',
        kind: 'region',
        children: [
          {
            id: 'gr-2',
            name: 'Supply Chain',
            kind: 'group',
            children: [
              { id: 'node-comm-1', name: 'Central Commissary', kind: 'node', nodeType: 'commissary' },
              { id: 'node-wh-1', name: 'Montego Bay Warehouse', kind: 'node', nodeType: 'warehouse' },
            ],
          },
        ],
      },
    ],
  },
];

export const FIXTURE_MENU_ITEMS = [
  { id: 'item-burger', name: 'Classic Burger' },
  { id: 'item-jerk', name: 'Jerk Chicken' },
];
