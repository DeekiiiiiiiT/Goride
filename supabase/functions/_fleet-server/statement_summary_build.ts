/**
 * Statement summary: trip-fact rollup + date-scoped ledger payout rows.
 * Organisation and dates are applied in the query, not after a full-history scan.
 */
import type { Context } from "npm:hono@4.3.11";
import { filterByOrgSafe, getOrgId } from "./org_scope.ts";
import { getServiceClient, getServiceClientWithSchema } from "./service_client.ts";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { listByOrg, shouldReadTable } from "./repos/baseRepo.ts";
import {
  addIsoDays,
  assemblePlatformStatement,
  emptyTripRollup,
  sumTripRollups,
  type StatementLedgerEvent,
  type StatementTripRollup,
} from "../../../packages/finance-core/src/statementCard.ts";

const PLATFORMS = ["Uber", "Roam", "InDrive"] as const;

const PAYOUT_TYPES = [
  "payout_cash",
  "payout_bank",
  "statement_line",
  "prior_period_adjustment",
];

const FALLBACK_TYPES = [
  ...PAYOUT_TYPES,
  "fare_earning",
  "tip",
  "promotion",
  "toll_charge",
  "toll_reimbursement",
  "toll_refund",
  "toll_support_adjustment",
];

export type BuiltStatements = {
  summaries: ReturnType<typeof assemblePlatformStatement>[];
  drivers: ReturnType<typeof assemblePlatformStatement>[];
  rollupSource: "trip_facts" | "ledger";
  weekClosed: boolean;
};

type DriverAlias = { roamId: string; name: string; aliases: string[] };

function missingRpc(error: { message?: string; code?: string; details?: string } | null): boolean {
  const msg = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("does not exist")
    || msg.includes("pgrst202")
    || msg.includes("schema cache")
    || msg.includes("could not find the function");
}

function asRollup(row: Record<string, unknown>): StatementTripRollup {
  const priorityRaw = row.priority;
  return {
    driverId: row.driverId != null ? String(row.driverId) : null,
    platform: String(row.platform || ""),
    totalEarnings: Number(row.totalEarnings) || 0,
    fare: Number(row.fare) || 0,
    cancellation: Number(row.cancellation) || 0,
    timeAtStop: Number(row.timeAtStop) || 0,
    priority: priorityRaw == null || priorityRaw === "" ? null : Number(priorityRaw),
    waitTime: Number(row.waitTime) || 0,
    tips: Number(row.tips) || 0,
    otherFare: Number(row.otherFare) || 0,
    tollRefundTrips: Number(row.tollRefundTrips) || 0,
    cashCollectedTrips: Math.abs(Number(row.cashCollectedTrips) || 0),
    completedTrips: Number(row.completedTrips) || 0,
    distanceKm: Number(row.distanceKm) || 0,
    platformFee: row.platformFee == null || row.platformFee === "" ? null : Number(row.platformFee),
    commissionRecorded: row.commissionRecorded === true || row.commissionRecorded === "true",
  };
}

function asText(value: unknown): string {
  return String(value || "").trim();
}

async function loadDriverAliases(c: { get?: (k: string) => unknown }, orgId: string): Promise<DriverAlias[]> {
  try {
    let raw: Record<string, unknown>[] = [];
    if (shouldReadTable("drivers")) {
      raw = await listByOrg("drivers", orgId, { limit: 5000 }) as Record<string, unknown>[];
    } else {
      const { data, error } = await fromKvStore().select("value").like("key", "driver:%").range(0, 4999);
      if (error) return [];
      raw = (data ?? []).map((row: { value?: Record<string, unknown> }) => row.value || {});
    }
    const scoped = await filterByOrgSafe(raw, c as Context, { endpoint: "/ledger/statement-summary" });
    return scoped.flatMap((driver) => {
      const roamId = asText(driver.id || driver.driverId);
      if (!roamId) return [];
      const aliases = [roamId, asText(driver.uberDriverId), asText(driver.inDriveDriverId)].filter(Boolean);
      return [{
        roamId,
        name: asText(driver.name || driver.driverName),
        aliases: [...new Set(aliases)],
      }];
    });
  } catch {
    return [];
  }
}

async function weekIsClosed(orgId: string, weekStart: string): Promise<boolean> {
  const { data, error } = await getServiceClientWithSchema("fleet")
    .from("finance_period_locks")
    .select("week_start")
    .eq("organization_id", orgId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || "");
    if (/does not exist|schema cache|Could not find/i.test(msg)) return false;
    throw new Error(msg);
  }
  return Boolean(data);
}

async function loadRollup(orgId: string, startDate: string, endDate: string): Promise<StatementTripRollup[] | null> {
  const { data, error } = await getServiceClient().rpc("statement_week_rollup", {
    p_org: orgId,
    p_from: startDate,
    p_to: endDate,
  });
  if (error) {
    if (missingRpc(error)) return null;
    throw new Error(error.message || "statement_week_rollup failed");
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => asRollup(row as Record<string, unknown>));
}

function driverMatches(id: string, variants: string[]): boolean {
  const key = id.trim().toLowerCase();
  return variants.some((v) => v.trim().toLowerCase() === key);
}

export async function buildStatementCards(
  c: { get?: (k: string) => unknown },
  opts: {
    startDate: string;
    endDate: string;
    platforms?: string[];
    driverId?: string | null;
    driverIdVariants?: string[];
    organizationId?: string | null;
  },
): Promise<BuiltStatements> {
  const startDate = opts.startDate;
  const endDate = opts.endDate;
  const platforms = (opts.platforms && opts.platforms.length > 0 ? opts.platforms : [...PLATFORMS])
    .filter((p) => (PLATFORMS as readonly string[]).includes(p));
  const orgId = opts.organizationId || getOrgId(c as Context);
  if (!orgId) throw new Error("Organization is required");
  const variants = opts.driverIdVariants ?? [];
  const scopedDriver = variants.length > 0;

  const rollups = orgId ? await loadRollup(orgId, startDate, endDate) : null;
  const useFacts = rollups != null;

  const {
    listAllUnifiedCanonicalEvents,
    filterCanonicalEventsByPlatform,
  } = await import("../_shared/unifiedLedger/queries.ts");

  const lateTo = addIsoDays(endDate, 7);
  const [weekEvents, lateDeposits] = await Promise.all([
    listAllUnifiedCanonicalEvents({
      organizationId: orgId,
      products: ["roam_driver", "roam_fleet"],
      entryTypes: useFacts ? PAYOUT_TYPES : FALLBACK_TYPES,
      from: `${startDate}T00:00:00.000Z`,
      to: `${endDate}T23:59:59.999Z`,
      maxRows: 5000,
    }),
    listAllUnifiedCanonicalEvents({
      organizationId: orgId,
      products: ["roam_driver", "roam_fleet"],
      entryTypes: ["payout_bank"],
      from: `${addIsoDays(endDate, 1)}T00:00:00.000Z`,
      to: `${lateTo}T23:59:59.999Z`,
      maxRows: 500,
    }),
  ]);
  const events = [...weekEvents, ...lateDeposits] as StatementLedgerEvent[];

  if (weekEvents.length >= 5000) {
    throw new Error("Statement week is larger than 5000 ledger rows. Narrow the dates.");
  }

  const inWindow = events.filter((e) => {
    const d = String(e.date || "").slice(0, 10);
    const ps = String(e.periodStart || "").slice(0, 10);
    const pe = String(e.periodEnd || "").slice(0, 10);
    const inDate = !!(d && d >= startDate && d <= endDate);
    const overlap = !!(ps && pe && ps <= endDate && pe >= startDate);
    const lateDeposit = String(e.eventType || "") === "payout_bank" && !!d && d > endDate && d <= lateTo;
    return inDate || overlap || lateDeposit;
  });

  const visible = scopedDriver
    ? inWindow.filter((e) => driverMatches(String(e.driverId || ""), variants))
    : inWindow;

  const facts = (rollups ?? []).filter((row) => {
    if (!platforms.includes(row.platform)) return false;
    if (!scopedDriver) return true;
    return driverMatches(String(row.driverId || ""), variants);
  });

  const summaries = platforms.map((plat) => {
    const platFacts = facts.filter((row) => row.platform === plat);
    const platEvents = filterCanonicalEventsByPlatform(visible as Record<string, unknown>[], plat) as StatementLedgerEvent[];
    const rollup = useFacts
      ? (scopedDriver && platFacts.length === 1
        ? platFacts[0]
        : sumTripRollups(platFacts, plat, scopedDriver ? (opts.driverId ?? null) : null))
      : null;
    return assemblePlatformStatement({
      platform: plat,
      periodStart: startDate,
      periodEnd: endDate,
      rollup: rollup ?? (useFacts ? emptyTripRollup(plat, scopedDriver ? (opts.driverId ?? null) : null) : null),
      events: platEvents,
      scope: scopedDriver ? "driver" : "fleet",
      driverIds: scopedDriver ? variants : null,
    });
  });

  const aliasList = scopedDriver ? [] : await loadDriverAliases(c, orgId);
  const aliasById = new Map<string, DriverAlias>();
  for (const driver of aliasList) {
    for (const id of driver.aliases) aliasById.set(id.toLowerCase(), driver);
  }
  const groups = new Map<string, { roamId: string; name: string | null; aliases: string[]; rows: StatementTripRollup[] }>();
  for (const row of facts) {
    const factId = String(row.driverId || "");
    if (!factId) continue;
    const known = aliasById.get(factId.toLowerCase());
    const roamId = known?.roamId || factId;
    let group = groups.get(roamId);
    if (!group) {
      group = {
        roamId,
        name: known?.name || null,
        aliases: known?.aliases ? [...known.aliases] : [factId],
        rows: [],
      };
      groups.set(roamId, group);
    }
    if (!group.aliases.some((id) => id.toLowerCase() === factId.toLowerCase())) group.aliases.push(factId);
    group.rows.push({ ...row, driverId: roamId });
  }

  const drivers = scopedDriver
    ? []
    : [...groups.values()].flatMap((group) =>
      platforms.map((plat) => {
        const platRows = group.rows.filter((row) => row.platform === plat);
        if (platRows.length === 0) return null;
        const platEvents = filterCanonicalEventsByPlatform(visible as Record<string, unknown>[], plat) as StatementLedgerEvent[];
        return assemblePlatformStatement({
          platform: plat,
          periodStart: startDate,
          periodEnd: endDate,
          rollup: sumTripRollups(platRows, plat, group.roamId),
          events: platEvents,
          scope: "driver",
          driverIds: group.aliases,
          driverName: group.name,
        });
      }).filter((row): row is NonNullable<typeof row> => row != null),
    );

  return {
    summaries,
    drivers,
    rollupSource: useFacts ? "trip_facts" : "ledger",
    weekClosed: await weekIsClosed(orgId, startDate),
  };
}
