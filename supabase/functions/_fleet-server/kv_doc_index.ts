/**
 * Thin index over finalized-report and dispute-refund KV docs.
 * List and rebuild paths ask for keys (driver / week / vehicle), then load
 * those documents by primary key. A missing RPC falls back to the prefix scan
 * so a screen still loads before the migration is applied.
 */
import { getServiceClient } from "./service_client.ts";
import * as kv from "./kv_store.tsx";

export type KvDocKind = "finalized_report" | "dispute_refund";

export async function loadIndexedDocs(opts: {
  kind: KvDocKind;
  driverIds?: string[];
  weekKey?: string;
  vehicleId?: string;
}): Promise<any[]> {
  const driverIds = (opts.driverIds || []).map(String).filter(Boolean);
  try {
    const { data, error } = await getServiceClient().rpc("kv_doc_index_keys", {
      p_kind: opts.kind,
      p_driver_ids: driverIds.length > 0 ? driverIds : null,
      p_week_key: opts.weekKey ?? null,
      p_vehicle_id: opts.vehicleId ?? null,
    });
    if (error) throw new Error(error.message);
    const keys = ((data || []) as Array<{ kv_key?: string } | string>)
      .map((row) => (typeof row === "string" ? row : String(row?.kv_key || "")))
      .filter(Boolean);
    if (keys.length === 0) return [];
    const values = await kv.mget(keys);
    return values.filter((v) => v && typeof v === "object");
  } catch (e) {
    console.warn("[kv_doc_index] falling back to prefix scan:", opts.kind, e);
    const prefix = opts.kind === "finalized_report" ? "finalized_report:" : "dispute-refund:";
    const all = (await kv.getByPrefix(prefix)) || [];
    return all.filter((row: any) => {
      if (!row || typeof row !== "object") return false;
      if (opts.kind === "dispute_refund" && !(row.id && row.supportCaseId)) return false;
      if (driverIds.length > 0 && !driverIds.includes(String(row.driverId || row.driver_id || ""))) {
        return false;
      }
      if (opts.weekKey) {
        const week = String(row.weekStart || row.weekKey || "").split("T")[0];
        if (week && week !== opts.weekKey) return false;
      }
      if (opts.vehicleId && String(row.vehicleId || "") !== opts.vehicleId) return false;
      return true;
    });
  }
}
