/**
 * Rush Ops console feeds: what needs a person, search, today's picture, system switches.
 * Each queue records its age limit next to the query. A failed queue is omitted, never shown as zero.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { getSetting } from "../../_shared/rushSettings/getSetting.ts";
import { getDb } from "./merchantAdminShared.ts";
import { canSee, canSeePeople, personHref, sanitizeSearchToken } from "./consoleAccess.ts";

const LIVE = ["placed", "accepted", "preparing", "ready", "picked_up", "in_transit"];

type Queue = {
  id: string;
  label: string;
  count: number;
  oldestAt: string | null;
  breached: boolean;
  href: string;
  capability: string;
};

function ageBreached(oldest: string | null, limitMs: number): boolean {
  if (!oldest) return false;
  const at = Date.parse(oldest);
  if (Number.isNaN(at)) return false;
  return Date.now() - at > limitMs;
}

function hours(n: number) {
  return n * 60 * 60 * 1000;
}

async function countOldest(
  run: () => Promise<{ count: number; oldest: string | null }>,
): Promise<{ count: number; oldest: string | null } | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

function platformDb() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "platform" },
  });
}

function jamYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addJamDays(ymd: string, days: number): string {
  const start = new Date(`${ymd}T05:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + days);
  return jamYmd(start);
}

function jamRange(fromYmd: string, toYmd: string): { start: string; end: string } {
  const start = `${fromYmd}T05:00:00.000Z`;
  const endDay = addJamDays(toYmd, 1);
  return { start, end: `${endDay}T05:00:00.000Z` };
}

type DayStats = {
  orders: number;
  gmv: number;
  avg_eta_min: number | null;
  by_hour: Array<{ hour: number; orders: number }>;
  by_market: Array<{ name: string; orders: number; gmv: number }>;
};

async function dayStats(start: string, end: string): Promise<DayStats | null> {
  const db = getDb();
  const { data, error } = await db.rpc("admin_console_day_stats", { p_start: start, p_end: end });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Partial<DayStats>;
  return {
    orders: Number(row.orders ?? 0),
    gmv: Number(row.gmv ?? 0),
    avg_eta_min: row.avg_eta_min == null ? null : Number(row.avg_eta_min),
    by_hour: Array.isArray(row.by_hour) ? row.by_hour : [],
    by_market: Array.isArray(row.by_market) ? row.by_market : [],
  };
}

export function registerConsoleAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const dash = await requireProductAdmin(c, "dash");
    const adminUser = dash instanceof Response ? await requireProductAdmin(c, "courier") : dash;
    if (adminUser instanceof Response) return adminUser;
    c.set("adminUser", adminUser);
    await next();
  });

  admin.get("/attention", async (c) => {
    const user = c.get("adminUser") as ProductAdminUser;
    const db = getDb();
    const payments = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      db: { schema: "payments" },
    });
    const publicDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const built: Array<Queue | null> = await Promise.all([
      countOldest(async () => {
        const { count, data, error } = await db.from("merchants")
          .select("submitted_at", { count: "exact" })
          .neq("onboarding_status", "draft")
          .in("verification_status", ["pending", "in_review", "docs_requested"])
          .order("submitted_at", { ascending: true })
          .limit(1);
        if (error) throw new Error(error.message);
        const oldest = (data?.[0] as { submitted_at?: string } | undefined)?.submitted_at ?? null;
        return { count: count ?? 0, oldest };
      }).then((row) => row && {
        id: "applications",
        label: "Merchant applications",
        count: row.count,
        oldestAt: row.oldest,
        breached: ageBreached(row.oldest, hours(48)),
        href: "/merchants?tab=applications&status=pending",
        capability: "merchants",
      }),
      countOldest(async () => {
        const { count, data, error } = await db.from("courier_profiles")
          .select("updated_at", { count: "exact" })
          .in("status", ["pending", "submitted", "in_review"])
          .order("updated_at", { ascending: true })
          .limit(1);
        if (error) throw new Error(error.message);
        const oldest = (data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null;
        return { count: count ?? 0, oldest };
      }).then((row) => row && {
        id: "compliance",
        label: "Courier compliance",
        count: row.count,
        oldestAt: row.oldest,
        breached: ageBreached(row.oldest, hours(24)),
        href: "/couriers?tab=compliance",
        capability: "couriers",
      }),
      countOldest(async () => {
        const { count, data, error } = await db.from("support_cases")
          .select("created_at", { count: "exact" })
          .eq("status", "open")
          .order("created_at", { ascending: true })
          .limit(1);
        if (error) throw new Error(error.message);
        const oldest = (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
        return { count: count ?? 0, oldest };
      }).then((row) => row && {
        id: "cases",
        label: "Support cases open",
        count: row.count,
        oldestAt: row.oldest,
        breached: ageBreached(row.oldest, hours(4)),
        href: "/support?tab=cases",
        capability: "support",
      }),
      countOldest(async () => {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { count, data, error } = await db.from("orders")
          .select("placed_at", { count: "exact" })
          .in("status", LIVE)
          .is("courier_id", null)
          .lt("placed_at", cutoff)
          .order("placed_at", { ascending: true })
          .limit(1);
        if (error) throw new Error(error.message);
        const oldest = (data?.[0] as { placed_at?: string } | undefined)?.placed_at ?? null;
        return { count: count ?? 0, oldest };
      }).then((row) => row && {
        id: "unassigned",
        label: "Orders unassigned over 5 min",
        count: row.count,
        oldestAt: row.oldest,
        breached: (row.count ?? 0) > 0,
        href: "/orders?view=attention",
        capability: "dispatch",
      }),
      countOldest(async () => {
        const { count, data, error } = await db.from("order_disputes")
          .select("created_at", { count: "exact" })
          .in("status", ["open", "pending"])
          .order("created_at", { ascending: true })
          .limit(1);
        if (error) throw new Error(error.message);
        const oldest = (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
        return { count: count ?? 0, oldest };
      }).then((row) => row && {
        id: "disputes",
        label: "Disputes and chargebacks",
        count: row.count,
        oldestAt: row.oldest,
        breached: ageBreached(row.oldest, hours(24)),
        href: "/finance?tab=disputes",
        capability: "finance",
      }),
      countOldest(async () => {
        const { count, data, error } = await publicDb.from("courier_remittance_settlements")
          .select("created_at", { count: "exact" })
          .eq("status", "pending_confirmation")
          .order("created_at", { ascending: true })
          .limit(1);
        if (error) throw new Error(error.message);
        const oldest = (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
        return { count: count ?? 0, oldest };
      }).then((row) => row && {
        id: "cash",
        label: "Courier cash reports",
        count: row.count,
        oldestAt: row.oldest,
        breached: ageBreached(row.oldest, hours(24)),
        href: "/courier-cash",
        capability: "courier-cash",
      }),
      countOldest(async () => {
        const { data, error } = await db.from("procurement_tasks")
          .select("id, state, sla_due_at, created_at")
          .not("state", "in", "(closed,abandoned)")
          .limit(200);
        if (error) throw new Error(error.message);
        const now = Date.now();
        const problems = (data ?? []).filter((row) => {
          const state = String((row as { state?: string }).state || "");
          const due = (row as { sla_due_at?: string | null }).sla_due_at;
          return state.startsWith("exception") || (due != null && Date.parse(due) < now);
        });
        const oldest = problems
          .map((row) => String((row as { created_at?: string }).created_at || ""))
          .filter(Boolean)
          .sort()[0] ?? null;
        return { count: problems.length, oldest };
      }).then((row) => row && {
        id: "in-house",
        label: "In-House problems",
        count: row.count,
        oldestAt: row.oldest,
        breached: ageBreached(row.oldest, hours(1)),
        href: "/in-house?tab=ops",
        capability: "in-house",
      }),
      countOldest(async () => {
        const [merchants, couriers] = await Promise.all([
          payments.from("merchant_bank_accounts").select("id", { count: "exact", head: true }).eq("is_default", true).eq("is_verified", false),
          payments.from("courier_bank_accounts").select("id", { count: "exact", head: true }).eq("is_default", true).eq("is_verified", false),
        ]);
        if (merchants.error) throw new Error(merchants.error.message);
        if (couriers.error) throw new Error(couriers.error.message);
        return { count: (merchants.count ?? 0) + (couriers.count ?? 0), oldest: null };
      }).then((row) => row && {
        id: "banks",
        label: "Bank accounts waiting",
        count: row.count,
        oldestAt: null,
        breached: false,
        href: "/finance?tab=payouts",
        capability: "finance",
      }),
      countOldest(async () => {
        const { count, data, error } = await db.from("menu_price_change_requests")
          .select("created_at", { count: "exact" })
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1);
        if (error) throw new Error(error.message);
        const oldest = (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
        return { count: count ?? 0, oldest };
      }).then((row) => row && {
        id: "menu-price-reviews",
        label: "Menu price reviews",
        count: row.count,
        oldestAt: row.oldest,
        breached: ageBreached(row.oldest, hours(48)),
        href: "/merchants?tab=price-reviews",
        capability: "merchants",
      }),
    ]);

    const queues = built
      .filter((row): row is Queue => !!row && row.count > 0 && canSee(user.roles ?? [user.role], row.capability))
      .map(({ capability: _capability, ...queue }) => queue);

    return c.json({ queues });
  });

  admin.get("/search", async (c) => {
    const user = c.get("adminUser") as ProductAdminUser;
    const roles = user.roles ?? [user.role];
    const q = sanitizeSearchToken(c.req.query("q") || "");
    if (q.length < 2) return c.json({ results: [] });
    const db = getDb();
    const pattern = `%${q}%`;
    const pdb = platformDb();
    const [orders, merchants, couriers, people] = await Promise.all([
      canSee(roles, "orders")
        ? db.from("orders").select("id, order_number, status").ilike("order_number", pattern).limit(6)
        : Promise.resolve({ data: [] }),
      canSee(roles, "merchants")
        ? db.from("merchants").select("id, name, verification_status").ilike("name", pattern).limit(6)
        : Promise.resolve({ data: [] }),
      canSee(roles, "couriers")
        ? db.from("courier_profiles").select("user_id, display_name, status").ilike("display_name", pattern).limit(6)
        : Promise.resolve({ data: [] }),
      canSeePeople(roles)
        ? pdb.from("identities").select("user_id, display_name, primary_email").or(`display_name.ilike.${pattern},primary_email.ilike.${pattern}`).limit(6)
        : Promise.resolve({ data: [] }),
    ]);
    const peopleRows = (people.data ?? []) as Array<{ user_id: string; display_name?: string; primary_email?: string }>;
    const peopleIds = peopleRows.map((row) => row.user_id).filter(Boolean);
    const { data: personaRows } = peopleIds.length
      ? await pdb.from("identity_personas").select("user_id, persona, ref_id").in("user_id", peopleIds)
      : { data: [] as Array<{ user_id: string; persona: string; ref_id: string | null }> };
    const personasByUser = new Map<string, Array<{ persona: string; ref_id: string | null }>>();
    for (const row of personaRows ?? []) {
      const id = String((row as { user_id: string }).user_id);
      const list = personasByUser.get(id) ?? [];
      list.push({ persona: String((row as { persona: string }).persona), ref_id: (row as { ref_id?: string | null }).ref_id ?? null });
      personasByUser.set(id, list);
    }
    const results = [
      ...((orders.data ?? []) as Array<{ id: string; order_number?: string; status?: string }>).map((row) => ({
        kind: "order",
        id: row.id,
        title: row.order_number || "Order",
        subtitle: row.status || "Order",
        href: `/orders/${row.id}`,
      })),
      ...((merchants.data ?? []) as Array<{ id: string; name?: string; verification_status?: string }>).map((row) => ({
        kind: "merchant",
        id: row.id,
        title: row.name || "Store",
        subtitle: row.verification_status || "Merchant",
        href: `/merchants/${row.id}`,
      })),
      ...((couriers.data ?? []) as Array<{ user_id: string; display_name?: string; status?: string }>).map((row) => ({
        kind: "courier",
        id: row.user_id,
        title: row.display_name || "Courier",
        subtitle: row.status || "Courier",
        href: `/couriers/${row.user_id}`,
      })),
      ...peopleRows.flatMap((row) => {
        const href = personHref(roles, row.user_id, personasByUser.get(row.user_id) ?? []);
        if (!href) return [];
        return [{
          kind: "person",
          id: row.user_id,
          title: row.display_name || row.primary_email || "Person",
          subtitle: row.primary_email || "Person",
          href,
        }];
      }),
    ];
    return c.json({ results });
  });

  admin.get("/summary", async (c) => {
    const user = c.get("adminUser") as ProductAdminUser;
    const roles = user.roles ?? [user.role];
    const db = getDb();
    const today = jamYmd();
    const fromQuery = c.req.query("from") || "";
    const toQuery = c.req.query("to") || "";
    const hasRange = /^\d{4}-\d{2}-\d{2}$/.test(fromQuery) && /^\d{4}-\d{2}-\d{2}$/.test(toQuery);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    let from = today;
    let to = today;
    let current: { start: string; end: string };
    let previous: { start: string; end: string };
    if (!hasRange) {
      const now = new Date();
      current = { start: jamRange(today, today).start, end: now.toISOString() };
      previous = {
        start: new Date(Date.parse(current.start) - weekMs).toISOString(),
        end: new Date(now.getTime() - weekMs).toISOString(),
      };
    } else {
      from = fromQuery <= toQuery ? fromQuery : toQuery;
      to = fromQuery <= toQuery ? toQuery : fromQuery;
      current = jamRange(from, to);
      const lengthMs = Date.parse(current.end) - Date.parse(current.start);
      previous = {
        start: new Date(Date.parse(current.start) - lengthMs).toISOString(),
        end: current.start,
      };
    }
    const sales = canSee(roles, "finance");
    let currentStats: DayStats | null = null;
    let previousStats: DayStats | null = null;
    if (sales) {
      try {
        [currentStats, previousStats] = await Promise.all([
          dayStats(current.start, current.end),
          dayStats(previous.start, previous.end),
        ]);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "summary failed" }, 500);
      }
    }
    const hourToday = new Map((currentStats?.by_hour ?? []).map((row) => [Number(row.hour), Number(row.orders)]));
    const hourPrev = new Map((previousStats?.by_hour ?? []).map((row) => [Number(row.hour), Number(row.orders)]));
    const singleDay = from === to;
    const prevMarkets = new Map((previousStats?.by_market ?? []).map((row) => [row.name, row]));
    const { count: liveNow } = await db.from("orders").select("id", { count: "exact", head: true }).in("status", LIVE);
    const { data: availability } = await db.from("courier_availability").select("is_online, active_order_id, last_location_update");
    let couriersOnline = 0;
    let couriersBusy = 0;
    const nowMs = Date.now();
    for (const row of availability ?? []) {
      if ((row as { active_order_id?: string }).active_order_id) {
        couriersBusy += 1;
        continue;
      }
      const stamp = (row as { last_location_update?: string; is_online?: boolean });
      if (stamp.is_online && stamp.last_location_update && nowMs - Date.parse(stamp.last_location_update) < 5 * 60 * 1000) {
        couriersOnline += 1;
      }
    }
    return c.json({
      salesVisible: sales,
      from,
      to,
      ordersToday: sales ? currentStats?.orders ?? 0 : null,
      ordersPrevious: sales ? previousStats?.orders ?? 0 : null,
      gmvToday: sales ? currentStats?.gmv ?? 0 : null,
      gmvPrevious: sales ? previousStats?.gmv ?? 0 : null,
      liveNow: liveNow ?? 0,
      couriersOnline,
      couriersBusy,
      avgEtaMin: sales ? currentStats?.avg_eta_min ?? null : null,
      byHour: sales && singleDay
        ? Array.from({ length: 24 }, (_, hour) => ({
          hour,
          today: hourToday.get(hour) ?? 0,
          lastWeek: hourPrev.get(hour) ?? 0,
        }))
        : [],
      byMarket: sales
        ? (currentStats?.by_market ?? []).map((row) => ({
          name: row.name,
          orders: Number(row.orders),
          gmv: Number(row.gmv),
          ordersPrevious: Number(prevMarkets.get(row.name)?.orders ?? 0),
          gmvPrevious: Number(prevMarkets.get(row.name)?.gmv ?? 0),
        }))
        : [],
    });
  });

  admin.get("/merchant-health", async (c) => {
    const user = c.get("adminUser") as ProductAdminUser;
    if (!canSee(user.roles ?? [user.role], "merchants")) return c.json({ error: "forbidden" }, 403);
    const ids = (c.req.query("ids") || "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100);
    if (ids.length === 0) return c.json({ health: {} });
    const db = getDb();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db.rpc("admin_merchant_order_counts", { p_ids: ids, p_since: since });
    if (error) return c.json({ error: error.message }, 500);
    const health: Record<string, { orders7d: number }> = {};
    for (const id of ids) health[id] = { orders7d: 0 };
    for (const row of data ?? []) {
      const id = String((row as { merchant_id?: string }).merchant_id || "");
      if (health[id]) health[id].orders7d = Number((row as { orders_7d?: number }).orders_7d || 0);
    }
    return c.json({ health });
  });

  admin.get("/merchant-audit", async (c) => {
    const user = c.get("adminUser") as ProductAdminUser;
    const roles = user.roles ?? [user.role];
    if (!canSee(roles, "merchants")) return c.json({ error: "forbidden" }, 403);
    const db = getDb();
    const from = c.req.query("from");
    const to = c.req.query("to");
    const q = sanitizeSearchToken(c.req.query("q") || "");
    let query = db.from("merchant_audit_log")
      .select("id, merchant_id, actor_id, actor_email, action, from_status, to_status, notes, created_at, merchant:merchants(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    const fromDay = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "";
    const toDay = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "";
    if (fromDay) query = query.gte("created_at", jamRange(fromDay, fromDay).start);
    if (toDay) query = query.lt("created_at", jamRange(toDay, toDay).end);
    if (q) query = query.or(`action.ilike.%${q}%,actor_email.ilike.%${q}%,notes.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      entries: (data ?? []).map((row) => {
        const merchant = (row as { merchant?: { name?: string } | { name?: string }[] | null }).merchant;
        const name = Array.isArray(merchant) ? merchant[0]?.name : merchant?.name;
        return { ...row, store_name: name || null };
      }),
    });
  });

  admin.get("/system", async (c) => {
    const user = c.get("adminUser") as ProductAdminUser;
    const allowed = (user.roles ?? []).some((role) => role === "platform_owner" || role === "superadmin" || role === "dash_admin");
    if (!allowed) return c.json({ error: "forbidden" }, 403);
    const [inHouse, payments, cash] = await Promise.all([
      getSetting<boolean>("customer.in_house.enabled"),
      getSetting<boolean>("customer.payment.card"),
      getSetting<boolean>("customer.payment.cash_on_delivery"),
    ]);
    return c.json({
      flags: [
        { name: "In-House desk", on: inHouse },
        { name: "Cash orders", on: cash },
        { name: "Card payments", on: payments },
      ],
      integrations: [
        { name: "Payments", state: payments ? "switch on" : "switch off" },
        { name: "SMS", state: "not recorded" },
        { name: "Maps", state: "not recorded" },
      ],
    });
  });

  app.route("/admin/console", admin);
}
