/**
 * Server: load / save / resolve Super Admin Toll Info (date-versioned).
 */
import * as kv from "./kv_store.tsx";
import {
  migrateToVersionedStore,
  publishScheduleVersion,
  resolveOfficialTollRate,
  selectScheduleVersion,
  toIsoDateKey,
} from "../../../utils/officialTollRate.ts";
import type {
  TollPaymentMethodRate,
  TollRateScheduleStore,
  TollRateScheduleVersion,
} from "../../../types/tollRateSchedule.ts";
import { KV_TOLL_RATE_SCHEDULE } from "../../../types/tollRateSchedule.ts";

export {
  migrateToVersionedStore,
  publishScheduleVersion,
  resolveOfficialTollRate,
  selectScheduleVersion,
  toIsoDateKey,
};

export async function loadTollRateStore(): Promise<TollRateScheduleStore> {
  const raw = await kv.get(KV_TOLL_RATE_SCHEDULE);
  const store = migrateToVersionedStore(raw || null);
  // Persist migration once so GET always returns versioned shape
  if (!raw?.versions || !raw?.current) {
    await kv.set(KV_TOLL_RATE_SCHEDULE, store);
  }
  return store;
}

export async function saveTollRateStore(store: TollRateScheduleStore): Promise<void> {
  await kv.set(KV_TOLL_RATE_SCHEDULE, store);
}

/** Publish new version from draft schedule body (Edit Rates). */
export async function publishTollRates(
  draft: Partial<TollRateScheduleVersion> & {
    plazas: TollRateScheduleVersion["plazas"];
    vehicleClasses: TollRateScheduleVersion["vehicleClasses"];
    routeRateGroups: TollRateScheduleVersion["routeRateGroups"];
    effectiveDate?: string;
    effectiveFrom?: string;
    operator?: string;
    currency?: string;
    createdBy?: string;
  },
): Promise<TollRateScheduleStore> {
  const store = await loadTollRateStore();
  const next = publishScheduleVersion(store, {
    effectiveDate: draft.effectiveDate || store.current.effectiveDate,
    effectiveFrom: draft.effectiveFrom || draft.effectiveDate,
    operator: draft.operator || store.current.operator,
    currency: draft.currency || store.current.currency,
    plazas: draft.plazas,
    vehicleClasses: draft.vehicleClasses,
    routeRateGroups: draft.routeRateGroups,
    createdBy: draft.createdBy,
  });
  await saveTollRateStore(next);
  return next;
}

export async function lookupOfficialRate(params: {
  plazaId?: string | null;
  plazaName?: string | null;
  classId: string;
  asOf?: string | null;
  paymentMethod?: TollPaymentMethodRate;
  fromPlazaName?: string | null;
  toPlazaName?: string | null;
}) {
  const store = await loadTollRateStore();
  return resolveOfficialTollRate({
    store,
    asOfDate: params.asOf || new Date().toISOString().slice(0, 10),
    tollClassId: params.classId,
    paymentMethod: params.paymentMethod || "withTag",
    plazaId: params.plazaId,
    plazaName: params.plazaName,
    fromPlazaName: params.fromPlazaName,
    toPlazaName: params.toPlazaName,
  });
}

/** True if amount matches any flat plaza rate (withTag or withoutTag) in the as-of card. */
export async function amountMatchesAnyOfficialRate(
  amount: number,
  asOf?: string | null,
  tolerance = 0.05,
): Promise<boolean> {
  const abs = Math.abs(Number(amount) || 0);
  if (!(abs > 0)) return false;
  const store = await loadTollRateStore();
  const version = selectScheduleVersion(store, asOf || new Date().toISOString().slice(0, 10));
  for (const plaza of version.plazas || []) {
    for (const rate of Object.values(plaza.rates || {})) {
      if (Math.abs(Number(rate.withTag) - abs) <= tolerance) return true;
      if (Math.abs(Number(rate.withoutTag) - abs) <= tolerance) return true;
    }
  }
  return false;
}

/** Fuzzy-match plaza name → plazaId from current schedule + toll_plaza KV. */
export function matchPlazaIdFromText(
  searchText: string,
  plazas: Array<{ plazaId?: string; plazaName: string }>,
): string | null {
  const text = searchText.toLowerCase().trim();
  if (!text) return null;
  for (const p of plazas) {
    const name = p.plazaName.toLowerCase();
    if (text.includes(name) || name.includes(text)) {
      return p.plazaId || null;
    }
  }
  for (const p of plazas) {
    const words = p.plazaName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const hits = words.filter((w) => text.includes(w)).length;
    if (words.length > 0 && hits >= Math.ceil(words.length * 0.6)) {
      return p.plazaId || null;
    }
  }
  return null;
}
