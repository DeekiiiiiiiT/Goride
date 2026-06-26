export type MerchantCapability = 'roam_delivery' | 'in_store_operations';

export type OrderChannel = 'roam_app' | 'in_store' | 'phone';

export type InStoreFulfillmentType = 'pickup' | 'dine_in' | 'counter';

export type PosPaymentMethod = 'card' | 'cash';

export interface PosCartModifier {
  name: string;
  priceAdjustment: number;
}

export interface PosCartLine {
  id: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifiers?: PosCartModifier[];
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
  costPerUnit: number;
}

export interface RecipeLine {
  id: string;
  menuItemId: string;
  menuItemName: string;
  ingredientId: string;
  ingredientName: string;
  quantityPerServing: number;
  unit: string;
}

export interface StockMovement {
  id: string;
  ingredientId: string;
  delta: number;
  reason: string;
  orderId?: string | null;
  createdAt: string;
}

export type PrintJobStatus = 'queued' | 'sent' | 'printed' | 'failed';

export interface PrintJobFixture {
  id: string;
  orderId: string;
  jobType: 'customer_receipt';
  status: PrintJobStatus;
  printerId?: string | null;
  createdAt: string;
}

export interface InStoreOrderFixture {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  fulfillmentType: InStoreFulfillmentType;
  status: string;
  total: number;
  items: PosCartLine[];
  placedAt: string;
  tableLabel?: string | null;
  guestName?: string | null;
}

export interface PosPricingResult {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

export interface RestaurantMgmtSetupDraft {
  taxRatePercent: number;
  printerName: string;
  receiptFooter: string;
}
