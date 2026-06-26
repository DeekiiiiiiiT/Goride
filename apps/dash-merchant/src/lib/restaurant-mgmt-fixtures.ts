import type {
  Ingredient,
  InStoreOrderFixture,
  PosCartLine,
  PrintJobFixture,
  RecipeLine,
  RestaurantMgmtSetupDraft,
} from '../types/restaurant-mgmt';

export const FIXTURE_POS_CATEGORIES = [
  { id: 'mains', name: 'Mains' },
  { id: 'sides', name: 'Sides' },
  { id: 'drinks', name: 'Drinks' },
];

export const FIXTURE_POS_MENU = [
  { id: 'item-burger', categoryId: 'mains', name: 'Classic Burger', price: 1200 },
  { id: 'item-jerk', categoryId: 'mains', name: 'Jerk Chicken', price: 1500 },
  { id: 'item-fries', categoryId: 'sides', name: 'Fries', price: 400 },
  { id: 'item-soda', categoryId: 'drinks', name: 'Soda', price: 250 },
];

export const FIXTURE_CART_LINES: PosCartLine[] = [
  {
    id: 'line-1',
    menuItemId: 'item-burger',
    name: 'Classic Burger',
    unitPrice: 1200,
    quantity: 2,
    modifiers: [{ name: 'Extra cheese', priceAdjustment: 150 }],
  },
  { id: 'line-2', menuItemId: 'item-fries', name: 'Fries', unitPrice: 400, quantity: 1 },
];

export const FIXTURE_INGREDIENTS: Ingredient[] = [
  {
    id: 'ing-patty',
    name: 'Beef patty',
    unit: 'each',
    quantityOnHand: 42,
    reorderLevel: 20,
    costPerUnit: 180,
  },
  {
    id: 'ing-bun',
    name: 'Burger bun',
    unit: 'each',
    quantityOnHand: 8,
    reorderLevel: 24,
    costPerUnit: 45,
  },
  {
    id: 'ing-lettuce',
    name: 'Lettuce',
    unit: 'oz',
    quantityOnHand: 120,
    reorderLevel: 40,
    costPerUnit: 12,
  },
];

export const FIXTURE_RECIPES: RecipeLine[] = [
  {
    id: 'rec-1',
    menuItemId: 'item-burger',
    menuItemName: 'Classic Burger',
    ingredientId: 'ing-patty',
    ingredientName: 'Beef patty',
    quantityPerServing: 1,
    unit: 'each',
  },
  {
    id: 'rec-2',
    menuItemId: 'item-burger',
    menuItemName: 'Classic Burger',
    ingredientId: 'ing-bun',
    ingredientName: 'Burger bun',
    quantityPerServing: 1,
    unit: 'each',
  },
];

export const FIXTURE_IN_STORE_ORDERS: InStoreOrderFixture[] = [
  {
    id: 'ord-in-1',
    orderNumber: '1042',
    channel: 'in_store',
    fulfillmentType: 'counter',
    status: 'preparing',
    total: 2950,
    items: FIXTURE_CART_LINES,
    placedAt: new Date().toISOString(),
    guestName: 'Walk-in',
  },
  {
    id: 'ord-roam-1',
    orderNumber: '1041',
    channel: 'roam_app',
    fulfillmentType: 'pickup',
    status: 'ready',
    total: 1800,
    items: [{ id: 'l1', menuItemId: 'item-jerk', name: 'Jerk Chicken', unitPrice: 1500, quantity: 1 }],
    placedAt: new Date(Date.now() - 600_000).toISOString(),
  },
];

export const FIXTURE_PRINT_JOBS: PrintJobFixture[] = [
  {
    id: 'pj-1',
    orderId: 'ord-in-1',
    jobType: 'customer_receipt',
    status: 'queued',
    printerId: 'counter-star-mc',
    createdAt: new Date().toISOString(),
  },
];

export const FIXTURE_SETUP_DRAFT: RestaurantMgmtSetupDraft = {
  taxRatePercent: 15,
  printerName: 'Counter Star MC',
  receiptFooter: 'Thank you for dining with us!',
};

export const FIXTURE_IN_STORE_SALES = {
  todayTotal: 48200,
  weekTotal: 214500,
  orderCountToday: 37,
  avgTicket: 1303,
};
