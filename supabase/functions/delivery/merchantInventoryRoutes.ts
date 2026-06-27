import type { Context } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ResolvedMerchantAccess } from "../merchantAuth.ts";
import { requireResolvedMerchantWithPermission } from "../merchantAuth.ts";
import { appendLedgerEntry } from "./inventory/ledgerService.ts";
import { toBaseQty, resolveUomIdByCode } from "./inventory/uomService.ts";

const IN_STORE_CAPABILITY = "in_store_operations";

function getServiceDb(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

function hasInStoreCapability(merchant: Record<string, unknown>): boolean {
  const caps = merchant.capabilities;
  if (Array.isArray(caps)) return caps.map(String).includes(IN_STORE_CAPABILITY);
  return false;
}

async function resolveAccess(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return { ok: false as const, status: 401, message: "Unauthorized" };

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { ok: false as const, status: 401, message: "Unauthorized" };

  const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
  if (!access.ok) return { ok: false as const, status: access.status, message: access.message };

  return { ok: true as const, access: access.resolved };
}

async function companyIdForMerchant(sb: SupabaseClient, merchant: Record<string, unknown>): Promise<string> {
  const existing = merchant.inventory_company_id;
  if (existing) return String(existing);

  const { data: node } = await sb
    .from("inventory_nodes")
    .select("group_id")
    .eq("merchant_id", merchant.id)
    .limit(1)
    .maybeSingle();

  if (!node) throw new Error("Inventory company not configured for merchant");

  const { data: group } = await sb
    .from("inventory_groups")
    .select("region_id")
    .eq("id", (node as Record<string, unknown>).group_id)
    .single();

  const { data: region } = await sb
    .from("inventory_regions")
    .select("company_id")
    .eq("id", (group as Record<string, unknown>).region_id)
    .single();

  return String((region as Record<string, unknown>).company_id);
}

function mapUom(row: Record<string, unknown>) {
  return { id: String(row.id), code: String(row.code), name: String(row.name), dimension: row.dimension };
}

function mapItem(
  row: Record<string, unknown>,
  balance?: number,
  uoms?: Map<string, string>,
) {
  const pu = uoms?.get(String(row.purchase_uom_id)) ?? "each";
  const su = uoms?.get(String(row.storage_uom_id)) ?? "each";
  const ru = uoms?.get(String(row.recipe_uom_id)) ?? "each";
  const bu = uoms?.get(String(row.base_uom_id)) ?? "each";
  return {
    id: String(row.id),
    name: String(row.name),
    sku: row.sku ? String(row.sku) : null,
    upc: row.upc ? String(row.upc) : null,
    storageZone: row.storage_zone ?? null,
    purchaseUomCode: pu,
    storageUomCode: su,
    recipeUomCode: ru,
    baseUomCode: bu,
    reorderLevelBase: Number(row.reorder_level_base ?? 0),
    quantityOnHandBase: balance ?? 0,
    costPerBaseUnit: 0,
    isActive: Boolean(row.is_active ?? true),
    conversions: [],
  };
}

export function registerMerchantInventoryRoutes(app: {
  get: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
  post: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
  put: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
  patch: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
}) {
  const guard = async (c: Context) => {
    const resolved = await resolveAccess(c);
    if (!resolved.ok) return { error: c.json({ error: resolved.message }, resolved.status) };
    if (!hasInStoreCapability(resolved.access.merchant)) {
      return { error: c.json({ error: "Restaurant management not enabled" }, 403) };
    }
    return { access: resolved.access, sb: getServiceDb() };
  };

  app.get("/merchant/enterprise-inventory/nodes", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { access, sb } = g;
    const { data } = await sb
      .from("inventory_nodes")
      .select("id, name, node_type, merchant_id, is_active")
      .eq("merchant_id", access.merchant.id);

    const nodes = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        name: String(r.name),
        nodeType: String(r.node_type),
        merchantId: r.merchant_id ? String(r.merchant_id) : null,
        isActive: Boolean(r.is_active),
      };
    });
    return c.json({ nodes });
  });

  app.get("/merchant/enterprise-inventory/hub-kpis", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const nodeId = c.req.query("nodeId");
    if (!nodeId) return c.json({ error: "nodeId required" }, 400);

    const { data: balances } = await sb
      .from("inventory_balances")
      .select("quantity_base, item_master(reorder_level_base)")
      .eq("node_id", nodeId);

    let stockValue = 0;
    let lowStockCount = 0;
    for (const b of balances ?? []) {
      const row = b as Record<string, unknown>;
      const im = row.item_master as Record<string, unknown> | null;
      const qty = Number(row.quantity_base ?? 0);
      const reorder = Number(im?.reorder_level_base ?? 0);
      if (qty <= reorder) lowStockCount += 1;
      stockValue += qty * 0;
    }

    const { count: openPoCount } = await sb
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("node_id", nodeId)
      .in("status", ["open", "partial"]);

    return c.json({
      kpis: {
        stockValue,
        lowStockCount,
        openPoCount: openPoCount ?? 0,
        varianceCost: 0,
      },
    });
  });

  app.get("/merchant/enterprise-inventory/items", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { access, sb } = g;
    const nodeId = c.req.query("nodeId");
    if (!nodeId) return c.json({ error: "nodeId required" }, 400);

    const companyId = await companyIdForMerchant(sb, access.merchant);
    const { data: uomRows } = await sb.from("uom_definitions").select("id, code").eq("company_id", companyId);
    const uomMap = new Map((uomRows ?? []).map((u) => [String((u as Record<string, unknown>).id), String((u as Record<string, unknown>).code)]));

    const { data: items } = await sb
      .from("item_master")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true);

    const { data: balances } = await sb
      .from("inventory_balances")
      .select("item_id, quantity_base")
      .eq("node_id", nodeId);

    const balanceMap = new Map(
      (balances ?? []).map((b) => [String((b as Record<string, unknown>).item_id), Number((b as Record<string, unknown>).quantity_base)]),
    );

    return c.json({
      items: (items ?? []).map((row) =>
        mapItem(row as Record<string, unknown>, balanceMap.get(String((row as Record<string, unknown>).id)) ?? 0, uomMap)
      ),
    });
  });

  app.get("/merchant/enterprise-inventory/items/:id", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { access, sb } = g;
    const { id } = c.req.param();
    const nodeId = c.req.query("nodeId");

    const companyId = await companyIdForMerchant(sb, access.merchant);
    const { data: item } = await sb.from("item_master").select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
    if (!item) return c.json({ error: "Not found" }, 404);

    const { data: uomRows } = await sb.from("uom_definitions").select("id, code").eq("company_id", companyId);
    const uomMap = new Map((uomRows ?? []).map((u) => [String((u as Record<string, unknown>).id), String((u as Record<string, unknown>).code)]));

    let balance = 0;
    if (nodeId) {
      const { data: bal } = await sb.from("inventory_balances").select("quantity_base").eq("node_id", nodeId).eq("item_id", id).maybeSingle();
      balance = Number((bal as Record<string, unknown> | null)?.quantity_base ?? 0);
    }

    const { data: conversions } = await sb
      .from("uom_conversions")
      .select("id, from_uom_id, to_uom_id, factor")
      .eq("item_id", id);

    const mapped = mapItem(item as Record<string, unknown>, balance, uomMap);
    mapped.conversions = (conversions ?? []).map((cv) => {
      const r = cv as Record<string, unknown>;
      return {
        id: String(r.id),
        fromUomId: String(r.from_uom_id),
        toUomId: String(r.to_uom_id),
        fromUomCode: uomMap.get(String(r.from_uom_id)) ?? "",
        toUomCode: uomMap.get(String(r.to_uom_id)) ?? "",
        factor: Number(r.factor),
      };
    });

    return c.json({ item: mapped });
  });

  app.post("/merchant/enterprise-inventory/items", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { access, sb } = g;
    const body = await c.req.json();
    const companyId = await companyIdForMerchant(sb, access.merchant);

    let uomId = body.baseUomId as string | undefined;
    if (!uomId && body.unit) {
      uomId = await resolveUomIdByCode(sb, companyId, String(body.unit));
    }
    if (!uomId) {
      const { data: each } = await sb.from("uom_definitions").select("id").eq("company_id", companyId).eq("code", "each").maybeSingle();
      uomId = each ? String((each as Record<string, unknown>).id) : undefined;
    }
    if (!uomId) return c.json({ error: "No base UOM" }, 400);

    const { data, error } = await sb.from("item_master").insert({
      company_id: companyId,
      name: body.name,
      sku: body.sku ?? null,
      upc: body.upc ?? null,
      storage_zone: body.storageZone ?? null,
      base_uom_id: uomId,
      purchase_uom_id: uomId,
      storage_uom_id: uomId,
      recipe_uom_id: uomId,
      reorder_level_base: body.reorderLevel ?? 0,
    }).select("*").single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ item: mapItem(data as Record<string, unknown>) });
  });

  app.patch("/merchant/enterprise-inventory/items/:id", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { access, sb } = g;
    const { id } = c.req.param();
    const body = await c.req.json();
    const companyId = await companyIdForMerchant(sb, access.merchant);

    const patch: Record<string, unknown> = {};
    if (body.name != null) patch.name = body.name;
    if (body.sku != null) patch.sku = body.sku;
    if (body.upc != null) patch.upc = body.upc;
    if (body.storageZone != null) patch.storage_zone = body.storageZone;
    if (body.reorderLevel != null) patch.reorder_level_base = body.reorderLevel;

    const { data, error } = await sb
      .from("item_master")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ item: mapItem(data as Record<string, unknown>) });
  });

  app.patch("/merchant/enterprise-inventory/items/:id/stock", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const { id } = c.req.param();
    const body = await c.req.json();
    const nodeId = String(body.nodeId ?? "");
    const delta = Number(body.delta ?? 0);
    if (!nodeId || !delta) return c.json({ error: "nodeId and delta required" }, 400);

    const { data: item } = await sb.from("item_master").select("base_uom_id").eq("id", id).single();
    if (!item) return c.json({ error: "Item not found" }, 404);

    const reason = String(body.reason ?? "manual_adjustment");
    const txType = reason === "waste" ? "waste" : "physical_adjustment";

    await appendLedgerEntry(sb, {
      nodeId,
      itemId: id,
      qty: delta,
      uomId: String((item as Record<string, unknown>).base_uom_id),
      transactionType: txType,
      referenceType: "adjustment",
    });

    const { data: bal } = await sb.from("inventory_balances").select("quantity_base").eq("node_id", nodeId).eq("item_id", id).maybeSingle();
    return c.json({ quantityOnHandBase: Number((bal as Record<string, unknown> | null)?.quantity_base ?? 0) });
  });

  app.get("/merchant/enterprise-inventory/purchase-orders", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const nodeId = c.req.query("nodeId");
    if (!nodeId) return c.json({ error: "nodeId required" }, 400);

    const { data } = await sb
      .from("purchase_orders")
      .select("*, vendors(name), purchase_order_lines(*, item_master(name), uom_definitions(code))")
      .eq("node_id", nodeId)
      .order("ordered_at", { ascending: false });

    const orders = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const vendor = r.vendors as Record<string, unknown> | null;
      const lines = (r.purchase_order_lines as Record<string, unknown>[] | null) ?? [];
      return {
        id: String(r.id),
        nodeId: String(r.node_id),
        vendorId: String(r.vendor_id),
        vendorName: String(vendor?.name ?? ""),
        status: String(r.status),
        orderedAt: String(r.ordered_at),
        expectedAt: r.expected_at ? String(r.expected_at) : null,
        lines: lines.map((l) => {
          const im = l.item_master as Record<string, unknown> | null;
          const uom = l.uom_definitions as Record<string, unknown> | null;
          return {
            id: String(l.id),
            itemId: String(l.item_id),
            itemName: String(im?.name ?? ""),
            qtyOrdered: Number(l.qty_ordered),
            uomCode: String(uom?.code ?? "each"),
            unitPrice: Number(l.unit_price ?? 0),
          };
        }),
      };
    });

    return c.json({ orders });
  });

  app.post("/merchant/enterprise-inventory/receiving", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const body = await c.req.json();
    const poId = String(body.poId ?? "");
    const lines = body.lines ?? [];

    const { data, error } = await sb.rpc("receive_purchase_order_tx", {
      p_po_id: poId,
      p_received_by: body.receivedBy ?? null,
      p_lines: lines.map((l: Record<string, unknown>) => ({
        poLineId: l.poLineId,
        qtyReceived: l.qtyReceived,
        uomId: l.uomId ?? null,
        shortQty: l.shortQty ?? 0,
        damagedQty: l.damagedQty ?? 0,
      })),
    });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ receivingId: data });
  });

  app.get("/merchant/enterprise-inventory/ledger", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const nodeId = c.req.query("nodeId");
    if (!nodeId) return c.json({ error: "nodeId required" }, 400);

    let q = sb
      .from("inventory_ledger")
      .select("*, item_master(name), uom_definitions(code)")
      .eq("node_id", nodeId)
      .order("created_at", { ascending: false })
      .limit(100);

    const itemId = c.req.query("itemId");
    if (itemId) q = q.eq("item_id", itemId);

    const { data } = await q;
    const entries = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const im = r.item_master as Record<string, unknown> | null;
      const uom = r.uom_definitions as Record<string, unknown> | null;
      return {
        id: String(r.id),
        nodeId: String(r.node_id),
        itemId: String(r.item_id),
        itemName: String(im?.name ?? ""),
        quantity: Number(r.quantity),
        uomCode: String(uom?.code ?? ""),
        quantityBase: Number(r.quantity_base),
        transactionType: String(r.transaction_type),
        referenceType: r.reference_type ? String(r.reference_type) : null,
        referenceId: r.reference_id ? String(r.reference_id) : null,
        createdAt: String(r.created_at),
      };
    });

    return c.json({ entries });
  });

  app.get("/merchant/enterprise-inventory/variance", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const nodeId = c.req.query("nodeId");
    const start = c.req.query("start") ?? new Date(Date.now() - 7 * 86400000).toISOString();
    const end = c.req.query("end") ?? new Date().toISOString();
    if (!nodeId) return c.json({ error: "nodeId required" }, 400);

    const { data, error } = await sb.rpc("inventory_variance_report", {
      p_node_id: nodeId,
      p_start: start,
      p_end: end,
    });

    if (error) return c.json({ error: error.message }, 500);

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      itemId: String(row.item_id),
      itemName: String(row.item_name),
      startingQtyBase: Number(row.starting_qty_base),
      receivedQtyBase: Number(row.received_qty_base),
      transferInQtyBase: Number(row.transfer_in_qty_base),
      wastedQtyBase: Number(row.wasted_qty_base),
      transferOutQtyBase: Number(row.transfer_out_qty_base),
      theoreticalDepletionBase: Number(row.theoretical_depletion_base),
      theoreticalEndingBase: Number(row.theoretical_ending_base),
      actualCountBase: row.actual_count_base != null ? Number(row.actual_count_base) : null,
      varianceQtyBase: Number(row.variance_qty_base),
      varianceCost: Number(row.variance_cost),
    }));

    return c.json({ rows });
  });

  app.post("/merchant/enterprise-inventory/transfers", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const body = await c.req.json();

    const { data: transfer, error } = await sb.from("inventory_transfers").insert({
      from_node_id: body.fromNodeId,
      to_node_id: body.toNodeId,
      status: "in_transit",
    }).select("id").single();

    if (error) return c.json({ error: error.message }, 500);
    const transferId = String((transfer as Record<string, unknown>).id);

    for (const line of body.lines ?? []) {
      const itemId = String(line.itemId);
      const qty = Number(line.qty);
      const uomId = String(line.uomId);
      const qtyBase = await toBaseQty(sb, itemId, qty, uomId);

      await sb.from("inventory_transfer_lines").insert({
        transfer_id: transferId,
        item_id: itemId,
        qty,
        uom_id: uomId,
      });

      await appendLedgerEntry(sb, {
        nodeId: String(body.fromNodeId),
        itemId,
        qty: -qty,
        uomId,
        transactionType: "transfer_out",
        referenceType: "transfer",
        referenceId: transferId,
      });
    }

    return c.json({ transferId });
  });

  app.post("/merchant/enterprise-inventory/transfers/:id/receive", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const { id } = c.req.param();

    const { data: transfer } = await sb.from("inventory_transfers").select("*").eq("id", id).single();
    if (!transfer) return c.json({ error: "Not found" }, 404);
    const t = transfer as Record<string, unknown>;
    if (String(t.status) !== "in_transit") return c.json({ error: "Transfer not in transit" }, 400);

    const { data: lines } = await sb.from("inventory_transfer_lines").select("*").eq("transfer_id", id);
    for (const line of lines ?? []) {
      const l = line as Record<string, unknown>;
      await appendLedgerEntry(sb, {
        nodeId: String(t.to_node_id),
        itemId: String(l.item_id),
        qty: Number(l.qty),
        uomId: String(l.uom_id),
        transactionType: "transfer_in",
        referenceType: "transfer",
        referenceId: id,
      });
    }

    await sb.from("inventory_transfers").update({ status: "received", received_at: new Date().toISOString() }).eq("id", id);
    return c.json({ ok: true });
  });

  app.post("/merchant/enterprise-inventory/counts", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { access, sb } = g;
    const body = await c.req.json();
    const nodeId = String(body.nodeId);

    const { data: count, error } = await sb.from("physical_counts").insert({
      node_id: nodeId,
      blind_mode: body.blindMode !== false,
      created_by: null,
    }).select("id").single();

    if (error) return c.json({ error: error.message }, 500);
    const countId = String((count as Record<string, unknown>).id);

    const companyId = await companyIdForMerchant(sb, access.merchant);
    const { data: items } = await sb.from("item_master").select("id").eq("company_id", companyId).eq("is_active", true);

    for (const item of items ?? []) {
      await sb.from("physical_count_items").insert({
        count_id: countId,
        item_id: String((item as Record<string, unknown>).id),
      });
    }

    return c.json({ countId });
  });

  app.patch("/merchant/enterprise-inventory/counts/:id/items/:itemId", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const { id, itemId } = c.req.param();
    const body = await c.req.json();

    const uomId = body.uomId as string;
    const qty = Number(body.countedQty);
    const qtyBase = await toBaseQty(sb, itemId, qty, uomId);

    await sb.from("physical_count_items").update({
      counted_qty: qty,
      counted_uom_id: uomId,
      counted_base: qtyBase,
    }).eq("count_id", id).eq("item_id", itemId);

    return c.json({ ok: true });
  });

  app.post("/merchant/enterprise-inventory/counts/:id/post", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { sb } = g;
    const { id } = c.req.param();

    const { data: count } = await sb.from("physical_counts").select("*").eq("id", id).single();
    if (!count) return c.json({ error: "Not found" }, 404);
    const cnt = count as Record<string, unknown>;

    const { data: items } = await sb.from("physical_count_items").select("*").eq("count_id", id);
    for (const row of items ?? []) {
      const item = row as Record<string, unknown>;
      if (item.counted_base == null) continue;

      const nodeId = String(cnt.node_id);
      const itemId = String(item.item_id);
      const { data: bal } = await sb.from("inventory_balances").select("quantity_base").eq("node_id", nodeId).eq("item_id", itemId).maybeSingle();
      const onHand = Number((bal as Record<string, unknown> | null)?.quantity_base ?? 0);
      const counted = Number(item.counted_base);
      const delta = counted - onHand;
      if (delta === 0) continue;

      const { data: im } = await sb.from("item_master").select("base_uom_id").eq("id", itemId).single();
      await appendLedgerEntry(sb, {
        nodeId,
        itemId,
        qty: delta,
        uomId: String((im as Record<string, unknown>).base_uom_id),
        transactionType: "physical_adjustment",
        referenceType: "count",
        referenceId: id,
      });
    }

    await sb.from("physical_counts").update({ status: "posted", posted_at: new Date().toISOString() }).eq("id", id);
    return c.json({ ok: true });
  });

  app.put("/merchant/enterprise-inventory/recipes/:menuItemId", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { access, sb } = g;
    const { menuItemId } = c.req.param();
    const body = await c.req.json();
    const companyId = await companyIdForMerchant(sb, access.merchant);

    const { data: existing } = await sb.from("recipes").select("id").eq("menu_item_id", menuItemId).maybeSingle();
    let recipeId = existing ? String((existing as Record<string, unknown>).id) : "";

    if (!recipeId) {
      const { data: created, error } = await sb.from("recipes").insert({
        company_id: companyId,
        menu_item_id: menuItemId,
        name: body.name ?? "Recipe",
        yield_pct: body.yieldPct ?? 100,
      }).select("id").single();
      if (error) return c.json({ error: error.message }, 500);
      recipeId = String((created as Record<string, unknown>).id);
    } else {
      await sb.from("recipes").update({ yield_pct: body.yieldPct ?? 100 }).eq("id", recipeId);
      await sb.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    }

    for (const line of body.ingredients ?? []) {
      await sb.from("recipe_ingredients").insert({
        recipe_id: recipeId,
        item_id: line.itemId,
        qty_required: line.qtyRequired,
        uom_id: line.uomId,
        yield_pct: line.yieldPct ?? 100,
      });
    }

    return c.json({ recipeId });
  });

  app.patch("/merchant/enterprise-inventory/settings", async (c) => {
    const g = await guard(c);
    if ("error" in g) return g.error;
    const { access, sb } = g;
    if (!access.membership.is_owner) return c.json({ error: "Owner only" }, 403);

    const body = await c.req.json();
    const patch: Record<string, unknown> = {};
    if (body.inventoryMode != null) patch.inventory_mode = body.inventoryMode;
    if (body.enterpriseInventoryShadow != null) patch.enterprise_inventory_shadow = body.enterpriseInventoryShadow;

    const { data, error } = await sb
      .from("merchants")
      .update(patch)
      .eq("id", access.merchant.id)
      .select("id, inventory_mode, enterprise_inventory_shadow")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ settings: data });
  });
}
