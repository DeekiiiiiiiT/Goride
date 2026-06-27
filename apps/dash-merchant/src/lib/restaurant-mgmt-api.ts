import { deliveryFetch } from './partner-api';
import type {
  InStoreFulfillmentType,
  PosCartLine,
  PosPaymentMethod,
  PrintJobFixture,
  RestaurantMgmtSetupDraft,
} from '../types/restaurant-mgmt';

export interface RestaurantSettings {
  capabilities: string[];
  taxRatePercent: number;
  printerId: string | null;
  receiptFooter: string;
  showInStoreOnCounter: boolean;
  showInStoreOnKitchen: boolean;
}

export interface InStoreSalesReport {
  range: string;
  total: number;
  orderCount: number;
  avgTicket: number;
}

function mapPrintJob(row: Record<string, unknown>): PrintJobFixture {
  return {
    id: String(row.id),
    orderId: String(row.order_id ?? ''),
    jobType: 'customer_receipt',
    status: String(row.status ?? 'queued') as PrintJobFixture['status'],
    printerId: row.printer_id ? String(row.printer_id) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function fetchSettings(): Promise<RestaurantSettings> {
  const data = await deliveryFetch('/merchant/restaurant/settings');
  const s = data.settings as Record<string, unknown>;
  return {
    capabilities: (s.capabilities as string[]) ?? [],
    taxRatePercent: Number(s.taxRatePercent ?? 0),
    printerId: s.printerId ? String(s.printerId) : null,
    receiptFooter: String(s.receiptFooter ?? ''),
    showInStoreOnCounter: Boolean(s.showInStoreOnCounter),
    showInStoreOnKitchen: Boolean(s.showInStoreOnKitchen),
  };
}

export async function patchSettings(
  patch: Partial<RestaurantMgmtSetupDraft> & {
    printerId?: string | null;
    showInStoreOnCounter?: boolean;
    showInStoreOnKitchen?: boolean;
  },
): Promise<RestaurantSettings> {
  const data = await deliveryFetch('/merchant/restaurant/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const row = data.settings as Record<string, unknown>;
  return {
    capabilities: [],
    taxRatePercent: Number(row.pos_tax_rate_percent ?? patch.taxRatePercent ?? 0),
    printerId: row.pos_printer_id ? String(row.pos_printer_id) : null,
    receiptFooter: String(row.pos_receipt_footer ?? patch.receiptFooter ?? ''),
    showInStoreOnCounter: Boolean(
      row.pos_show_in_store_on_counter ?? patch.showInStoreOnCounter ?? false,
    ),
    showInStoreOnKitchen: Boolean(
      row.pos_show_in_store_on_kitchen ?? patch.showInStoreOnKitchen ?? false,
    ),
  };
}

export interface CreatePosOrderInput {
  lines: PosCartLine[];
  fulfillmentType?: InStoreFulfillmentType;
  paymentMethod?: PosPaymentMethod;
  markPaid?: boolean;
  tableLabel?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  discount?: number;
}

export async function createPosOrder(input: CreatePosOrderInput) {
  return deliveryFetch('/merchant/pos/orders', {
    method: 'POST',
    body: JSON.stringify({
      lines: input.lines.map((line) => ({
        menuItemId: line.menuItemId,
        name: line.name,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        modifiers: line.modifiers,
      })),
      fulfillmentType: input.fulfillmentType,
      paymentMethod: input.paymentMethod,
      markPaid: input.markPaid,
      tableLabel: input.tableLabel,
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      discount: input.discount,
    }),
  });
}

export async function payPosOrder(
  orderId: string,
  paymentMethod: PosPaymentMethod,
  cashierMemberId?: string | null,
) {
  return deliveryFetch(`/merchant/pos/orders/${orderId}/pay`, {
    method: 'POST',
    body: JSON.stringify({ paymentMethod, cashierMemberId }),
  });
}

export interface PosPaymentIntentResult {
  clientSecret: string | null;
  mockMode: boolean;
  orderId: string;
}

export async function createPosPaymentIntent(orderId: string): Promise<PosPaymentIntentResult> {
  return deliveryFetch(`/merchant/pos/orders/${orderId}/payment-intent`, { method: 'POST' });
}

export async function fetchPrintJobs(): Promise<PrintJobFixture[]> {
  const data = await deliveryFetch('/merchant/print-jobs');
  return ((data.printJobs as Record<string, unknown>[]) ?? []).map(mapPrintJob);
}

export async function testPrint(): Promise<PrintJobFixture> {
  const data = await deliveryFetch('/merchant/print-jobs/test', { method: 'POST' });
  return mapPrintJob(data.printJob as Record<string, unknown>);
}

export async function fetchInStoreSales(range: 'today' | 'week' = 'today'): Promise<InStoreSalesReport> {
  return deliveryFetch(`/merchant/reports/in-store-sales?range=${range}`);
}
