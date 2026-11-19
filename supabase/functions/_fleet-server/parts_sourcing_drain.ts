/**
 * Drain pending parts_sourcing_outbox rows into Dominion intake (LS-12, LS-13).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { verifiedCatalogIdForVehicle } from "./fleet_parts_access.ts";
import { buildPartsSourcingInsert } from "./parts_sourcing_request_build.ts";

export type PartsSourcingDrainSummary = {
  claimed: number;
  sent: number;
  merged: number;
  cancelled: number;
  notCompleted: number;
  dailyLimit: number;
  carNotLinked: number;
  /** A row already closed as not sent (the send returns its final state). */
  notSent: number;
  /** Any other answer from the send (a state added later): counted so claimed always adds up (code review #6). */
  other: number;
  errors: number;
  /** Claimed rows handed back unprocessed when the run ran out of time. */
  released: number;
};

type SendResult =
  | "sent"
  | "merged"
  | "cancelled"
  | "not_completed"
  | "daily_limit"
  | "car_not_linked"
  | "not_sent";

const DRAIN_WALL_MS = 45_000;

function positionCodesFromLine(line: Record<string, unknown>): string[] {
  const raw = line.positions;
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map((p) => String(p));
}

export async function runPartsSourcingDrain(
  supabase: SupabaseClient,
  opts?: {
    limit?: number;
    now?: () => Date;
    catalogIdForVehicle?: (
      supabase: SupabaseClient,
      orgId: string,
      vehicleId: string,
    ) => Promise<string | null>;
  },
): Promise<PartsSourcingDrainSummary> {
  const limit = opts?.limit ?? 25;
  const now = opts?.now ?? (() => new Date());
  const started = now().getTime();

  const summary: PartsSourcingDrainSummary = {
    claimed: 0,
    sent: 0,
    merged: 0,
    cancelled: 0,
    notCompleted: 0,
    dailyLimit: 0,
    carNotLinked: 0,
    notSent: 0,
    other: 0,
    errors: 0,
    released: 0,
  };

  const { data: rows, error: claimErr } = await supabase.rpc("parts_sourcing_outbox_claim", {
    p_limit: limit,
  });
  if (claimErr) throw claimErr;
  const claimed = (rows ?? []) as Array<Record<string, unknown>>;
  summary.claimed = claimed.length;

  for (let i = 0; i < claimed.length; i += 1) {
    const ob = claimed[i];
    if (now().getTime() - started >= DRAIN_WALL_MS) {
      // Out of time: hand the rows not reached back now, so the next minute's drain takes them instead of waiting
      // out the 10-minute claim (code review #6).
      const rest = claimed.slice(i).map((r) => String(r.id ?? "")).filter(Boolean);
      if (rest.length) {
        const { error: releaseErr } = await supabase
          .from("parts_sourcing_outbox")
          .update({ claimed_at: null, updated_at: now().toISOString() })
          .in("id", rest)
          .eq("state", "pending");
        if (releaseErr) console.error("[parts_sourcing_drain] release failed:", releaseErr.message);
      }
      summary.released = rest.length;
      break;
    }
    const outboxId = String(ob.id ?? "");

    try {
      const lineItemId = String(ob.line_item_id ?? "");
      const { data: item, error: itemErr } = await supabase
        .from("maintenance_work_order_line_item")
        .select("*")
        .eq("id", lineItemId)
        .maybeSingle();
      if (itemErr) throw itemErr;
      if (!item) throw new Error("line_item_missing");

      const itemRow = item as Record<string, unknown>;
      const { data: line, error: lineErr } = await supabase
        .from("maintenance_work_order_lines")
        .select("*")
        .eq("id", itemRow.work_order_line_id)
        .maybeSingle();
      if (lineErr) throw lineErr;
      if (!line) throw new Error("line_missing");

      const lineRow = line as Record<string, unknown>;
      const { data: wo, error: woErr } = await supabase
        .from("maintenance_work_orders")
        .select("*")
        .eq("id", itemRow.work_order_id)
        .maybeSingle();
      if (woErr) throw woErr;
      if (!wo) throw new Error("work_order_missing");

      const woRow = wo as Record<string, unknown>;
      const orgId = String(woRow.organization_id ?? "");
      const vehicleId = woRow.vehicle_id != null ? String(woRow.vehicle_id) : null;

      let jobMeta: { is_part?: boolean; position_scheme?: string | null } | null = null;
      const componentId = lineRow.component_id ? String(lineRow.component_id) : "";
      if (componentId) {
        const { data: jobRow, error: jobErr } = await supabase
          .from("maintenance_service_categories")
          .select("is_part, position_scheme")
          .eq("id", componentId)
          .maybeSingle();
        if (jobErr) throw jobErr;
        jobMeta = (jobRow as typeof jobMeta) ?? null;
      }

      const resolveCatalog = opts?.catalogIdForVehicle ?? verifiedCatalogIdForVehicle;
      // No link → the row still goes to send with a blank catalogue car: send first checks a deleted or
      // unfinished service (cancelled / not_completed) and only then books car_not_linked, so a deleted
      // service is never left waiting 30 days as "car not linked".
      const catalogId = vehicleId
        ? await resolveCatalog(supabase, orgId, vehicleId)
        : null;

      const itemKind = String(itemRow.item_kind ?? "");
      let needComponentId: string | null = null;
      if (itemKind === "part_type" && itemRow.part_type_id) {
        needComponentId = String(itemRow.part_type_id);
      } else if (itemKind === "other" && jobMeta?.is_part === true && componentId) {
        needComponentId = componentId;
      }

      const positionCodes = positionCodesFromLine(lineRow);
      const positionScheme = positionCodes.length
        ? (jobMeta?.position_scheme ? String(jobMeta.position_scheme) : null)
        : null;

      // Never an empty title in Dominion (code review #7): the item's name, else its part number, else the job's name.
      const itemName = String(itemRow.item_name ?? "").trim()
        || (itemRow.part_number != null ? String(itemRow.part_number).trim() : "")
        || String(lineRow.component_name ?? "").trim()
        || "Part";

      const sentAt = now().toISOString();
      const insertRow = await buildPartsSourcingInsert(supabase, {
        orgId,
        vehicleId,
        needText: itemName,
        componentId: needComponentId,
        engineFamilyId: null,
        vehicleCatalogId: catalogId,
        matchType: null,
        fit: {},
        kind: "add_part_info",
        urgency: null,
        qty: null,
        userId: woRow.updated_by != null ? String(woRow.updated_by) : null,
        photoUrl: null,
        sentAt,
        replyDueAt: null,
        oldPartNumber: itemRow.part_number != null ? String(itemRow.part_number) : null,
        positionScheme,
        positionCodes: positionCodes.length ? positionCodes : null,
      });

      const { data: sendRaw, error: sendErr } = await supabase.rpc("parts_sourcing_outbox_send", {
        p_outbox_id: outboxId,
        p_row: {
          ...insertRow,
          item_name: itemName,
        },
      });
      if (sendErr) throw sendErr;

      const result = String((sendRaw as Record<string, unknown>)?.result ?? "") as SendResult;
      if (result === "sent") summary.sent += 1;
      else if (result === "merged") summary.merged += 1;
      else if (result === "cancelled") summary.cancelled += 1;
      else if (result === "not_completed") summary.notCompleted += 1;
      else if (result === "daily_limit") summary.dailyLimit += 1;
      else if (result === "car_not_linked") summary.carNotLinked += 1;
      else if (result === "not_sent") summary.notSent += 1;
      else {
        summary.other += 1;
        console.warn("[parts_sourcing_drain] unexpected send result:", outboxId, result);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[parts_sourcing_drain] row failed:", outboxId, msg);
      try {
        const { error: retryErr } = await supabase.rpc("parts_sourcing_outbox_retry", {
          p_outbox_id: outboxId,
          p_reason: "error",
        });
        if (retryErr) console.error("[parts_sourcing_drain] retry failed:", outboxId, retryErr.message);
      } catch (retryFail: unknown) {
        const rmsg = retryFail instanceof Error ? retryFail.message : String(retryFail);
        console.error("[parts_sourcing_drain] retry threw:", outboxId, rmsg);
      }
      summary.errors += 1;
    }
  }

  return summary;
}