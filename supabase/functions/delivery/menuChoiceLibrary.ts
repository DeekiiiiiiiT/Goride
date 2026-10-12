import { customerPriceFromCost } from "./inHouse/pricing.ts";
import {
  groupFromList,
  groupsFromStored,
  groupsToStored,
  listFromGroup,
  orderChoiceError,
  stampChoiceList,
  validateDishChoices,
  type ChoiceGroup,
  type ChoiceList,
} from "../../../packages/merchant-ops/src/menuChoices.ts";

type Sb = {
  from: (table: string) => any;
};

function asList(row: Record<string, unknown>): ChoiceList {
  const group = listFromGroup({
    id: String(row.id),
    name: String(row.name || ""),
    kind: row.kind === "included" || row.kind === "priced" ? row.kind : "extra",
    maxSelections: Number(row.max_selections) || 0,
    options: Array.isArray(row.options) ? row.options as ChoiceGroup["options"] : [],
  }, String(row.id));
  return group;
}

function withCustomerExtras(options: unknown[], markupBps: number) {
  return options.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const group = entry as { options?: Array<Record<string, unknown>> };
    return {
      ...group,
      options: (group.options || []).map((option) => ({
        ...option,
        marketplaceAdjustment: customerPriceFromCost(Number(option.priceAdjustment) || 0, markupBps),
      })),
    };
  });
}

export async function propagateChoiceList(sb: Sb, merchantId: string, list: ChoiceList) {
  const { data: store } = await sb.from("in_house_stores").select("markup_bps").eq("merchant_id", merchantId).maybeSingle();
  const markupBps = store ? Number(store.markup_bps ?? 1500) : null;
  const { data: items } = await sb.from("menu_items").select("id, options").eq("merchant_id", merchantId);
  for (const item of items || []) {
    const stamped = stampChoiceList(item.options, list);
    if (!stamped.changed) continue;
    const options = markupBps == null ? stamped.options : withCustomerExtras(stamped.options, markupBps);
    await sb.from("menu_items").update({ options }).eq("id", item.id);
  }
}

export async function stampSectionChoiceLists(sb: Sb, merchantId: string, categoryId: string) {
  const { data: category } = await sb.from("menu_categories").select("choice_list_ids").eq("id", categoryId).eq("merchant_id", merchantId).maybeSingle();
  const nextIds = Array.isArray(category?.choice_list_ids) ? category.choice_list_ids.map((id: unknown) => String(id)) : [];
  const { data: listRows } = nextIds.length
    ? await sb.from("menu_choice_lists").select("id, name, kind, max_selections, options").in("id", nextIds).eq("merchant_id", merchantId)
    : { data: [] };
  const lists = (listRows || []).map((row: Record<string, unknown>) => asList(row));
  const { data: store } = await sb.from("in_house_stores").select("markup_bps").eq("merchant_id", merchantId).maybeSingle();
  const markupBps = store ? Number(store.markup_bps ?? 1500) : null;
  const { data: items } = await sb.from("menu_items").select("id, options").eq("merchant_id", merchantId).eq("category_id", categoryId);
  const keep = new Set(nextIds);
  for (const item of items || []) {
    let options = Array.isArray(item.options) ? item.options.filter((entry: unknown) => {
      if (!entry || typeof entry !== "object") return true;
      const row = entry as { kind?: string; libraryGroupId?: string; priceMode?: string };
      const shared = Boolean(row.libraryGroupId);
      const priced = row.kind === "priced" || row.priceMode === "replace";
      if (priced && shared && !keep.has(String(row.libraryGroupId))) return false;
      return true;
    }) : [];
    for (const list of lists) {
      const stamped = stampChoiceList(options, list);
      options = stamped.changed ? stamped.options : options;
      const present = options.some((entry: unknown) => entry && typeof entry === "object" && String((entry as { libraryGroupId?: string }).libraryGroupId || "") === list.id);
      if (!present) options = [...options, groupsToStored([groupFromList(list)])[0]];
    }
    const stored = markupBps == null ? options : withCustomerExtras(options, markupBps);
    await sb.from("menu_items").update({ options: stored }).eq("id", item.id);
  }
}

export async function listChoiceLists(sb: Sb, merchantId: string) {
  const { data, error } = await sb.from("menu_choice_lists").select("id, name, kind, max_selections, options").eq("merchant_id", merchantId).order("name");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, lists: (data || []).map((row: Record<string, unknown>) => asList(row)) };
}

export async function saveChoiceList(sb: Sb, merchantId: string, body: Record<string, unknown>, listId?: string) {
  const parsed = groupsFromStored([{
    id: listId || "draft",
    name: body.name,
    kind: body.kind,
    maxSelections: body.maxSelections ?? body.max_selections,
    options: body.options,
  }])[0];
  const invalid = parsed ? validateDishChoices(0, [parsed]) : "Every choice list needs a name";
  if (!parsed || invalid) return { ok: false as const, error: invalid || "Every choice list needs a name", status: 400 };
  const list = listFromGroup(parsed, listId);
  const row = {
    merchant_id: merchantId,
    name: list.name,
    kind: list.kind,
    max_selections: list.maxSelections,
    options: list.options,
    updated_at: new Date().toISOString(),
  };
  const query = listId
    ? sb.from("menu_choice_lists").update(row).eq("id", listId).eq("merchant_id", merchantId).select("id, name, kind, max_selections, options").single()
    : sb.from("menu_choice_lists").insert(row).select("id, name, kind, max_selections, options").single();
  const { data, error } = await query;
  if (error || !data) return { ok: false as const, error: error?.message || "Could not save that list", status: 500 };
  const saved = asList(data as Record<string, unknown>);
  await propagateChoiceList(sb, merchantId, saved);
  return { ok: true as const, list: saved };
}

export function registerMerchantChoiceRoutes(
  app: { get: any; post: any; patch: any },
  deps: {
    getServiceSupabase: () => Sb;
    requireMerchant: (authHeader: string, merchantId: string, permission: "menu") => Promise<{ ok: true } | { ok: false; message: string; status: number }>;
  },
) {
  app.get("/merchants/:merchantId/choice-lists", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { merchantId } = c.req.param();
    const access = await deps.requireMerchant(authHeader, merchantId, "menu");
    if (!access.ok) return c.json({ error: access.message }, access.status);
    const result = await listChoiceLists(deps.getServiceSupabase(), merchantId);
    if (!result.ok) return c.json({ error: result.error }, 500);
    return c.json({ lists: result.lists });
  });

  app.post("/merchants/:merchantId/choice-lists", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { merchantId } = c.req.param();
    const access = await deps.requireMerchant(authHeader, merchantId, "menu");
    if (!access.ok) return c.json({ error: access.message }, access.status);
    const body = await c.req.json().catch(() => ({}));
    const saved = await saveChoiceList(deps.getServiceSupabase(), merchantId, body);
    if (!saved.ok) return c.json({ error: saved.error }, saved.status);
    return c.json({ list: saved.list });
  });

  app.patch("/merchants/:merchantId/choice-lists/:listId", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const { merchantId, listId } = c.req.param();
    const access = await deps.requireMerchant(authHeader, merchantId, "menu");
    if (!access.ok) return c.json({ error: access.message }, access.status);
    const body = await c.req.json().catch(() => ({}));
    const saved = await saveChoiceList(deps.getServiceSupabase(), merchantId, body, listId);
    if (!saved.ok) return c.json({ error: saved.error }, saved.status);
    return c.json({ list: saved.list });
  });
}

export { orderChoiceError };
