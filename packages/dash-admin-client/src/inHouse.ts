import { API_ENDPOINTS } from '@roam/api-client';
import { dashAdminFetch, dashAdminHeaders, parseDashAdminJson } from './fetch';

export type InHouseTaskCard = {
  id: string;
  order_id: string;
  merchant_id: string;
  state: string;
  claimed_by: string | null;
  pickup_code: string;
  expected_cost_minor: number;
  actual_total_minor: number | null;
  exception_code: string | null;
  sla_due_at: string;
  created_at: string;
  storeName: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  moneyState: string;
  customerTotal: number;
  itemCount: number;
  unreadCount?: number;
  needsApproval?: boolean;
  second_approved_at?: string | null;
  sla_warned_at?: string | null;
  sla_paged_at?: string | null;
  buyerName?: string | null;
};

export function listInHouseQueue(token: string) {
  return dashAdminFetch<{ tasks: InHouseTaskCard[]; desk?: { staffed: boolean; people: number } }>(token, '/in-house/queue');
}

export function inHouseHeartbeat(token: string) {
  return dashAdminFetch<{ ok: boolean }>(token, '/in-house/heartbeat', { method: 'POST', body: '{}' });
}

export function claimInHouseTask(token: string, id: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/tasks/${id}/claim`, { method: 'POST', body: '{}' });
}

export function releaseInHouseTask(token: string, id: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/tasks/${id}/release`, { method: 'POST', body: '{}' });
}

export function touchInHouseTask(token: string, id: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/tasks/${id}/touch`, { method: 'POST', body: '{}' });
}

export type InHouseChecklistStep = {
  id: string;
  label: string;
  copyText?: string;
  children?: InHouseChecklistStep[];
};

export type InHouseTaskDetail = {
  task: Record<string, unknown>;
  order: Record<string, unknown> | null;
  store: Record<string, unknown> | null;
  merchant: { id?: string; name?: string; phone?: string; address?: string } | null;
  cards: Array<{ id: string; label: string; last4: string; daily_limit_minor: number }>;
  checklist: InHouseChecklistStep[];
  cart: Array<{ name: string; quantity: number; sku: string | null; options: string[] }>;
};

export function getInHouseTask(token: string, id: string) {
  return dashAdminFetch<InHouseTaskDetail>(token, `/in-house/tasks/${id}`);
}

export function uploadInHouseReceipt(token: string, id: string, fileBase64: string) {
  return dashAdminFetch<{ path: string }>(token, `/in-house/tasks/${id}/receipt`, {
    method: 'POST',
    body: JSON.stringify({ fileBase64 }),
  });
}

export function placeInHouseTask(token: string, id: string, body: {
  externalOrderRef: string;
  actualTotalMinor: number;
  cardId: string;
  readyEta: string;
  receiptGctMinor?: number | null;
}) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/tasks/${id}/placed`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function raiseInHouseException(token: string, id: string, code: string, note?: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/tasks/${id}/exception`, {
    method: 'POST',
    body: JSON.stringify({ code, note }),
  });
}

export function resolveInHouseTask(
  token: string,
  id: string,
  action: string,
  extra?: { confirmedNothingBought?: boolean },
) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/tasks/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ action, ...extra }),
  });
}

export function getInHouseAudience(token: string) {
  return dashAdminFetch<{ customers: Array<{ customer_id: string; email: string }>; phones: string[] }>(token, '/in-house/audience');
}

export function saveInHouseAudience(token: string, body: { email?: string; customerId?: string; remove?: boolean; phones?: string[] }) {
  return dashAdminFetch<{ ok: boolean }>(token, '/in-house/audience', { method: 'POST', body: JSON.stringify(body) });
}

export function approveInHousePurchase(token: string, id: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/tasks/${id}/approve`, { method: 'POST', body: '{}' });
}

export function listInHouseStores(token: string) {
  return dashAdminFetch<{
    enabled: boolean;
    hasCard?: boolean;
    deskGoLiveBlockers?: string[];
    stores: Array<Record<string, unknown>>;
  }>(token, '/in-house/stores');
}

export function setInHouseStoreLive(token: string, merchantId: string, body: { live: boolean; reason?: string }) {
  return dashAdminFetch<{ ok: boolean; blockers?: string[] }>(token, `/in-house/stores/${merchantId}/live`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function setInHouseStoreAudience(token: string, merchantId: string, audience: 'public' | 'beta') {
  return dashAdminFetch<{ ok: boolean; audience: string }>(token, `/in-house/stores/${merchantId}/audience`, {
    method: 'POST',
    body: JSON.stringify({ audience }),
  });
}

export function archiveInHouseStore(token: string, merchantId: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/stores/${merchantId}/archive`, {
    method: 'POST',
    body: '{}',
  });
}

export function archiveInHouseDish(token: string, merchantId: string, itemId: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/stores/${merchantId}/menu/${itemId}/archive`, {
    method: 'POST',
    body: '{}',
  });
}

export function listInHouseMarkets(token: string) {
  return dashAdminFetch<{ markets: Array<{ id: string; name: string; slug: string }> }>(token, '/in-house/markets');
}

export function listInHouseChat(token: string, orderId: string) {
  return fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}/messages?pair=customer_merchant`, {
    headers: dashAdminHeaders(token),
  }).then((res) => parseDashAdminJson<{ messages: Array<{ id: string; body: string; sender_role: string; created_at: string }>; chat_open?: boolean }>(res));
}

export function sendInHouseChat(token: string, orderId: string, body: string) {
  return fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}/messages`, {
    method: 'POST',
    headers: dashAdminHeaders(token, 'application/json'),
    body: JSON.stringify({ pair: 'customer_merchant', body }),
  }).then((res) => parseDashAdminJson<{ message: { id: string } }>(res));
}

export function saveInHouseStore(token: string, body: Record<string, unknown>) {
  return dashAdminFetch<{ ok: boolean; merchantId?: string }>(token, '/in-house/stores', { method: 'POST', body: JSON.stringify(body) });
}

export function listInHouseChoiceLists(token: string, merchantId: string) {
  return dashAdminFetch<{ lists: Array<{ id: string; name: string; kind: 'included' | 'extra'; maxSelections: number; options: Array<{ id: string; name: string; priceModifier: number; isAvailable: boolean }> }> }>(token, `/in-house/stores/${merchantId}/choice-lists`);
}

export function saveInHouseChoiceList(token: string, merchantId: string, list: Record<string, unknown>) {
  return dashAdminFetch<{ list: { id: string } }>(token, `/in-house/stores/${merchantId}/choice-lists`, {
    method: 'POST',
    body: JSON.stringify(list),
  });
}

export function listInHouseMenu(token: string, merchantId: string) {
  return dashAdminFetch<{
    items: Array<Record<string, unknown>>;
    categories: Array<{ id: string; name: string; choice_list_ids?: string[]; pizza_menu?: unknown; section_kind?: string; sort_order?: number }>;
  }>(token, `/in-house/stores/${merchantId}/menu`);
}

export type InHouseEngineOverride = {
  id?: string;
  targetKind: string;
  targetId: string;
  price?: number | null;
  isAvailable?: boolean | null;
};

export function getInHouseEngineMenu(token: string, merchantId: string) {
  return dashAdminFetch<{
    menuId: string;
    menu: { status?: string; version?: number; published_at?: string } | null;
    snapshot: import('@roam/menu-engine').MenuSnapshot | null;
    kits: import('@roam/menu-engine').MenuKitDef[];
    brands: Array<{ id: string; name: string; evidence_urls?: unknown }>;
    brandId: string | null;
    overrides: InHouseEngineOverride[];
  }>(token, `/in-house/stores/${merchantId}/engine-menu`);
}

export function saveInHouseEngineMenuDraft(
  token: string,
  merchantId: string,
  snapshot: unknown,
  brandId?: string | null,
) {
  return dashAdminFetch<{ ok: boolean; menuId: string }>(token, `/in-house/stores/${merchantId}/engine-menu`, {
    method: 'PUT',
    body: JSON.stringify({ snapshot, brandId }),
  });
}

export function publishInHouseEngineMenu(token: string, merchantId: string, snapshot?: unknown) {
  return dashAdminFetch<{ ok: boolean; version: number }>(token, `/in-house/stores/${merchantId}/engine-menu/publish`, {
    method: 'POST',
    body: JSON.stringify(snapshot ? { snapshot } : {}),
  });
}

export function createInHouseMenuBrand(token: string, name: string, evidenceUrls: string[] = []) {
  return dashAdminFetch<{ brand: { id: string; name: string } }>(token, '/in-house/menu-brands', {
    method: 'POST',
    body: JSON.stringify({ name, evidenceUrls }),
  });
}

export function saveInHouseLocationOverrides(token: string, merchantId: string, overrides: InHouseEngineOverride[]) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/stores/${merchantId}/location-overrides`, {
    method: 'PUT',
    body: JSON.stringify({ overrides }),
  });
}

export function saveInHouseMenu(
  token: string,
  merchantId: string,
  items: Array<Record<string, unknown>>,
  confirm: boolean,
  create?: Array<Record<string, unknown>>,
  categories?: Array<{ id?: string; name: string; remove?: boolean; choiceListIds?: string[]; pizzaMenu?: unknown; sectionKind?: string; sortOrder?: number }>,
) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/stores/${merchantId}/menu`, {
    method: 'POST',
    body: JSON.stringify({ items, confirm, create, categories }),
  });
}

export function uploadDeskImage(token: string, file: File, folder: string) {
  const body = new FormData();
  body.append('file', file);
  body.append('folder', folder);
  return fetch(`${API_ENDPOINTS.delivery}/merchant-assets/upload`, {
    method: 'POST',
    headers: dashAdminHeaders(token),
    body,
  }).then((res) => parseDashAdminJson<{ publicUrl: string; path: string }>(res));
}

export function listInHouseCards(token: string) {
  return dashAdminFetch<{ cards: Array<Record<string, unknown>> }>(token, '/in-house/cards');
}

export function createInHouseCard(token: string, body: { label: string; last4: string; dailyLimitMinor: number }) {
  return dashAdminFetch<{ card: Record<string, unknown> }>(token, '/in-house/cards', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateInHouseCard(token: string, id: string, body: { label?: string; last4?: string; dailyLimitMinor?: number; active?: boolean }) {
  return dashAdminFetch<{ card: Record<string, unknown> }>(token, `/in-house/cards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function archiveInHouseCard(token: string, id: string) {
  return updateInHouseCard(token, id, { active: false });
}

export function deleteInHouseCard(token: string, id: string) {
  return dashAdminFetch<{ ok: boolean }>(token, `/in-house/cards/${id}`, { method: 'DELETE' });
}

export type InHouseCardTransaction = {
  taskId: string;
  orderNumber: string;
  paidAt: string;
  customerTotal: number;
  bank: { postedOn: string; amountMinor: number; merchantText: string } | null;
};

export function listInHouseCardTransactions(token: string) {
  return dashAdminFetch<{
    orders: InHouseCardTransaction[];
    unmatched: Array<{ id: string; postedOn: string; amountMinor: number; merchantText: string }>;
  }>(token, '/in-house/cards/transactions');
}

export function importInHouseStatement(token: string, lines: Array<Record<string, unknown>>) {
  return dashAdminFetch<{ imported: number; matched: number }>(token, '/in-house/cards/statement-import', {
    method: 'POST',
    body: JSON.stringify({ lines }),
  });
}

export function getInHouseReports(token: string) {
  return dashAdminFetch<Record<string, number>>(token, '/in-house/reports');
}

export function getInHouseRecon(token: string) {
  return dashAdminFetch<{ counts: Record<string, number> }>(token, '/in-house/recon');
}
