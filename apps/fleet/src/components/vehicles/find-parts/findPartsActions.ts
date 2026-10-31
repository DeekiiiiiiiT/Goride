import { api } from "../../../services/api";

export type ResultsFilterTab = "all" | "stock" | "oem";
export type TrimScopeTab = "all" | "specific";

export function saveCurrentPartsSearch(name: string) {
  return api.savePartsSearch({ name: name || "Saved search", url: window.location.search });
}

export function addPartToPartsList(body: {
  label: string;
  partId?: string;
  componentId?: string;
  qty?: number;
}) {
  return api.addToPartsList(body);
}

export function notifyPartsAdmin(body: { kind?: string; title?: string; body: string }) {
  return api.notifyPartsAdmin(body);
}

export function downloadCurrentFitmentReport() {
  return api.downloadFitmentReport(Object.fromEntries(new URLSearchParams(window.location.search).entries()));
}

export function logBulkConsumableStockOut(partId: string | undefined, qty = 1) {
  if (!partId) return Promise.resolve(undefined);
  return api.setOrgPartStock({ partId, qty: -Math.abs(qty) });
}

export function addPartToOrgStock(partId: string | undefined, qty = 1) {
  if (!partId) return Promise.resolve(undefined);
  return api.setOrgPartStock({ partId, qty: Math.abs(qty) });
}

export function copyTextToClipboard(text: string) {
  if (!text.trim()) return Promise.resolve(undefined);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.resolve(undefined);
}

/** Fleet maintenance hub tabs (same app shell as find-parts). */
export function navigateFleetMaintenanceTab(tab: "vehicles" | "ledger" | "find-parts") {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab === "vehicles" ? "vehicles" : tab === "ledger" ? "service-ledger" : "find-parts");
  if (tab === "find-parts") {
    url.searchParams.delete("view");
  } else {
    url.searchParams.delete("vehicle");
    url.searchParams.delete("part");
    url.searchParams.delete("pos");
  }
  window.location.assign(url.toString());
}

export function clearFleetMaintenanceSearch() {
  const url = new URL(window.location.href);
  url.search = "";
  window.history.replaceState(null, "", url);
  window.location.reload();
}
