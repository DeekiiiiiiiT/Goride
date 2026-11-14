/**
 * I24: block pay / write-off / batch pay / settle-from-balance when toll week not sealed.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { FEATURE_FLAGS, isFeatureEnabled } from "./feature_flags.ts";
import { getServiceClient } from "./service_client.ts";
import { SettlementCommandError } from "./settlement_commands.ts";

export type TollSealBeforePayInput = {
  organizationId: string;
  weekAnchor: string;
  serviceLine?: string | null;
  authHeader: string | null;
};

export type DecideTollSealedForPayInput = {
  flagOn: boolean;
  isV2: boolean;
  latestTollWeekStatus: string | null;
  /** When true, v2 company check failed — fail closed. */
  v2EnabledRpcFailed?: boolean;
};

export type TollSealBeforePayDeps = {
  isFeatureEnabled?: typeof isFeatureEnabled;
  fetchV2Enabled?: (
    organizationId: string,
    authHeader: string | null,
  ) => Promise<boolean | "rpc_failed">;
  fetchLatestTollWeekStatus?: (
    organizationId: string,
    weekAnchor: string,
  ) => Promise<string | null>;
};

/** Log Cash / collect — never gated. */
export function shouldCheckTollSeal(
  kind: string,
  isCashReceipt: boolean,
): boolean {
  if (isCashReceipt || kind === "collect") return false;
  return kind === "pay" || kind === "write_off";
}

export function decideTollSealedForPay(input: DecideTollSealedForPayInput): boolean {
  if (!input.flagOn) return true;
  if (input.v2EnabledRpcFailed) return false;
  // The new toll system is the only one: pay waits for the week's sealed (closed) toll statement.
  return input.isV2 && input.latestTollWeekStatus === "closed";
}

export function serviceLineFromPeriodRow(
  row: Record<string, unknown> | null | undefined,
): string | null {
  if (!row) return null;
  const meta = (row.metadata && typeof row.metadata === "object"
    ? row.metadata
    : {}) as Record<string, unknown>;
  const sl = meta.serviceLine ?? meta.service_line ?? row.service_line ??
    row.serviceLine;
  const s = sl != null ? String(sl).trim() : "";
  return s || null;
}

async function defaultFetchV2Enabled(
  _organizationId: string,
  authHeader: string | null,
): Promise<boolean | "rpc_failed"> {
  if (!authHeader?.trim()) return "rpc_failed";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  // One retry for a passing network blip; still fails closed if the second try fails too.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await supabase.rpc("toll_v2_enabled");
    if (!error) return data === true;
    if (attempt === 1) await new Promise((r) => setTimeout(r, 200));
  }
  return "rpc_failed";
}

async function defaultFetchLatestTollWeekStatus(
  organizationId: string,
  weekAnchor: string,
): Promise<string | null> {
  const wk = String(weekAnchor).slice(0, 10);
  const { data, error } = await getServiceClient()
    .from("week_statements")
    .select("status, version")
    .eq("organization_id", organizationId)
    .eq("kind", "toll_week")
    .eq("driver_id", "*")
    .eq("week_key", wk)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data.status != null ? String(data.status) : null;
}

function refuseNotSealed(weekKey: string): never {
  throw new SettlementCommandError(
    "TOLL_WEEK_NOT_SEALED",
    "Tolls for this week aren't sealed yet. Seal the week's tolls before paying the driver.",
    409,
    { weekKey },
  );
}

export async function assertTollWeekSealedForPay(
  input: TollSealBeforePayInput,
  deps?: TollSealBeforePayDeps,
): Promise<void> {
  const flagOn = await (deps?.isFeatureEnabled ?? isFeatureEnabled)(
    FEATURE_FLAGS.TOLL_SEAL_BEFORE_PAY,
    input.organizationId,
  );
  if (!flagOn) return;

  const weekKey = String(input.weekAnchor).slice(0, 10);
  const v2Result = await (deps?.fetchV2Enabled ?? defaultFetchV2Enabled)(
    input.organizationId,
    input.authHeader,
  );
  const v2EnabledRpcFailed = v2Result === "rpc_failed";
  const isV2 = v2Result === true;

  let latestTollWeekStatus: string | null = null;
  if (!v2EnabledRpcFailed && isV2) {
    latestTollWeekStatus = await (deps?.fetchLatestTollWeekStatus ??
      defaultFetchLatestTollWeekStatus)(
        input.organizationId,
        weekKey,
      );
  }

  const allowed = decideTollSealedForPay({
    flagOn: true,
    isV2,
    latestTollWeekStatus,
    v2EnabledRpcFailed,
  });
  if (!allowed) refuseNotSealed(weekKey);
}
