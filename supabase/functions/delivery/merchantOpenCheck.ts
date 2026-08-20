/**
 * Server-side merchant open/accepting check for place-order.
 * Browse already filters is_accepting_orders; POST /orders must enforce too.
 */

export type MerchantOpenCheckResult =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const JAMAICA_TZ = "America/Jamaica";

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function isWithinDayHours(
  openTime: string | null | undefined,
  closeTime: string | null | undefined,
  isClosed: boolean,
  now: Date,
): boolean {
  if (isClosed || !openTime || !closeTime) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = parseTimeToMinutes(String(openTime).slice(0, 5));
  const closeMinutes = parseTimeToMinutes(String(closeTime).slice(0, 5));
  if (closeMinutes > openMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

function todayDateString(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Calendar YYYY-MM-DD in America/Jamaica. */
function jamaicaDateString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAMAICA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Start of Jamaica calendar day as ISO (Jamaica has no DST; UTC-5 year-round). */
function jamaicaDayStartIso(now: Date): string {
  return `${jamaicaDateString(now)}T00:00:00-05:00`;
}

async function assertDailyCapacity(
  serviceSb: { from: (t: string) => any },
  merchantId: string,
  now: Date,
): Promise<MerchantOpenCheckResult> {
  const { data: settings, error: settingsErr } = await serviceSb
    .from("merchant_settings")
    .select("max_daily_capacity")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (settingsErr) {
    return { ok: false, status: 400, error: settingsErr.message };
  }

  const raw = settings?.max_daily_capacity;
  const cap = raw == null || raw === "" ? null : Number(raw);
  if (cap == null || !Number.isFinite(cap) || cap <= 0) {
    return { ok: true };
  }

  const dayStart = jamaicaDayStartIso(now);
  // Count non-cancelled orders placed (or created) since Jamaica midnight
  const { count, error: countErr } = await serviceSb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .neq("status", "cancelled")
    .or(`placed_at.gte.${dayStart},and(placed_at.is.null,created_at.gte.${dayStart})`);

  if (countErr) {
    return { ok: false, status: 400, error: countErr.message };
  }

  if ((count ?? 0) >= Math.floor(cap)) {
    return {
      ok: false,
      status: 409,
      error: "This store has reached its order capacity for today",
    };
  }

  return { ok: true };
}

/**
 * Rejects orders when merchant inactive, not accepting, on special closed day, outside hours,
 * or at max daily order capacity.
 * If no merchant_hours rows exist, hours check is skipped (legacy merchants) but accepting/active still enforced.
 */
export async function assertMerchantAcceptingOrders(
  serviceSb: {
    from: (t: string) => any;
  },
  merchantId: string,
  now = new Date(),
): Promise<MerchantOpenCheckResult> {
  const { data: merchant, error: merchantErr } = await serviceSb
    .from("merchants")
    .select("id, is_active, is_accepting_orders")
    .eq("id", merchantId)
    .maybeSingle();

  if (merchantErr) {
    return { ok: false, status: 400, error: merchantErr.message };
  }
  if (!merchant) {
    return { ok: false, status: 404, error: "Merchant not found" };
  }
  if (merchant.is_active === false) {
    return { ok: false, status: 409, error: "This store is not available" };
  }
  if (merchant.is_accepting_orders === false) {
    return { ok: false, status: 409, error: "This store is not accepting orders right now" };
  }

  const today = todayDateString(now);
  const { data: specialRows } = await serviceSb
    .from("merchant_special_hours")
    .select("special_date, is_closed, open_time, close_time, label")
    .eq("merchant_id", merchantId)
    .eq("special_date", today);

  const special = Array.isArray(specialRows) ? specialRows[0] : specialRows;
  if (special) {
    if (special.is_closed) {
      return {
        ok: false,
        status: 409,
        error: special.label
          ? `This store is closed today (${special.label})`
          : "This store is closed today",
      };
    }
    if (
      !isWithinDayHours(
        special.open_time as string,
        special.close_time as string,
        false,
        now,
      )
    ) {
      return { ok: false, status: 409, error: "This store is currently closed" };
    }
    return assertDailyCapacity(serviceSb, merchantId, now);
  }

  const { data: hours } = await serviceSb
    .from("merchant_hours")
    .select("day_of_week, open_time, close_time, is_closed")
    .eq("merchant_id", merchantId);

  const hoursList = (hours || []) as Array<{
    day_of_week: number;
    open_time?: string | null;
    close_time?: string | null;
    is_closed?: boolean;
  }>;

  if (hoursList.length === 0) {
    return assertDailyCapacity(serviceSb, merchantId, now);
  }

  const day = now.getDay();
  const dayHours = hoursList.find((h) => Number(h.day_of_week) === day);
  if (
    !dayHours ||
    !isWithinDayHours(dayHours.open_time, dayHours.close_time, Boolean(dayHours.is_closed), now)
  ) {
    return { ok: false, status: 409, error: "This store is currently closed" };
  }

  return assertDailyCapacity(serviceSb, merchantId, now);
}
