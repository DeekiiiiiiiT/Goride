import { getServiceClient } from "./service_client.ts";
import { periodKeyFor } from "../../../packages/finance-core/src/periodKey.ts";

/** True when the week containing this date is locked. A missing table does not block. */
export async function financeWeekIsLocked(orgId: string, dateYmd: string): Promise<boolean> {
  const week = periodKeyFor(dateYmd);
  if (!orgId || !week) return false;
  const { data, error } = await getServiceClient().rpc("svc_finance_week_locked", {
    p_org: orgId,
    p_week: week,
  });
  if (error) return false;
  return Boolean(data);
}
