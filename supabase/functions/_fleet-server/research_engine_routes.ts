/**
 * Research engine routes (docs/research-engine-audit.md §5 / §6): fill, identity, model, proposals, browser checks,
 * conflicts, recipe tests, trusted sites and recipes. Registered behind withPrivacyGuard (RE-23).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { guardRead, guardWrite } from "./catalog_research_routes.ts";
import { autoResolveFromBatch } from "./catalog_request_autoresolve.ts";
import { closeJobNotFound } from "./catalog_research_not_found.ts";
import {
  answersGate,
  browserCheckGate,
  type CarBuild,
  type CheckAnswers,
  type PositionItem,
  periodTextOnLine,
  versionCodeOnLine,
  versionListLink,
  versionPageUrl,
} from "./research_browser_check.ts";
import { identityTokens } from "./research_part_job.ts";
import { siteDomain } from "./research_page_reader.ts";
import { type LookupRecipe, runRecipe } from "./research_recipes.ts";

const PREFIX = "/make-server-37f42386/admin/catalog-research";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RbacUser = { id?: string; userId?: string; resolvedRole?: string; role?: string };

function actorOf(c: Context): string | null {
  const u = c.get("rbacUser") as RbacUser | undefined;
  return u?.id ?? u?.userId ?? null;
}

/** RE-21: trusted sites and recipes are the owner's alone. */
function guardOwner(c: Context) {
  const denied = guardWrite(c);
  if (denied) return denied;
  const u = c.get("rbacUser") as RbacUser | undefined;
  if ((u?.resolvedRole ?? u?.role) !== "platform_owner") return c.json({ error: "Only the platform owner can change trusted sites" }, 403);
  return null;
}

async function audit(supabase: SupabaseClient, c: Context, action: string, table: string, rowId: string, before: unknown, after: unknown) {
  await supabase.from("dominion_audit_log").insert({
    actor: actorOf(c),
    action,
    table_name: table,
    row_id: rowId,
    before: before ?? null,
    after: after ?? null,
  });
}

async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function registerResearchEngineRoutes(
  app: { get: Function; post: Function; patch: Function; delete?: Function },
  supabase: SupabaseClient,
) {
  // ---------------------------------------------------------------- fill (RE-09 / RE-08 / RE-04)
  app.post(`${PREFIX}/fill/car`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const b = await body(c);
    const id = str(b.vehicleCatalogId, 40);
    if (!UUID.test(id)) return c.json({ error: "vehicleCatalogId required" }, 400);
    const { data, error } = await supabase.rpc("catalog_research_fill_car", { p_vehicle_catalog_id: id, p_origin: "owner_fill" });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ result: data });
  });

  app.post(`${PREFIX}/fill/model`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const b = await body(c);
    const make = str(b.make, 80);
    const model = str(b.model, 120);
    if (!make || !model) return c.json({ error: "make and model required" }, 400);
    const { data, error } = await supabase.rpc("catalog_research_fill_model", { p_make: make, p_model: model });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ result: data });
  });

  app.post(`${PREFIX}/fill/item`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const b = await body(c);
    const id = str(b.vehicleCatalogId, 40);
    const componentId = str(b.componentId, 40) || null;
    const specKey = str(b.specKey, 80) || null;
    if (!UUID.test(id) || (!componentId && !specKey) || (componentId && !UUID.test(componentId))) {
      return c.json({ error: "vehicleCatalogId and componentId or specKey required" }, 400);
    }
    const { data, error } = await supabase.rpc("catalog_research_queue_item", {
      p_vehicle_catalog_id: id,
      p_component_id: componentId,
      p_spec_key: specKey,
      p_fit_descriptor: str(b.fitDescriptor, 40) || null,
      p_origin: "owner_fill",
    });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ result: data });
  });

  app.post(`${PREFIX}/identity`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const id = str((await body(c)).vehicleCatalogId, 40);
    if (!UUID.test(id)) return c.json({ error: "vehicleCatalogId required" }, 400);
    const { data, error } = await supabase.rpc("catalog_research_queue_identity", { p_vehicle_catalog_id: id });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ result: data });
  });

  app.post(`${PREFIX}/model`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const b = await body(c);
    const { data, error } = await supabase.rpc("catalog_research_queue_model", { p_make: str(b.make, 80), p_model: str(b.model, 120) });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ result: data });
  });

  // ---------------------------------------------------------------- screen reads (layer 3, §4)
  // S1 cards, S4 cost + progress, S5 "Cars being filled first". No demand, no request fields (RE-23).
  app.get(`${PREFIX}/summary`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data, error } = await supabase.rpc("catalog_research_screen_summary");
    if (error) return c.json({ error: error.message }, 500);
    return c.json(data ?? {});
  });

  // S8: open system notices (engine paused, site blocked, spend cap, Google's daily limit, evidence changed).
  app.get(`${PREFIX}/notices`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data, error } = await supabase.from("dominion_system_notice")
      .select("id, kind, subject, detail, opened_at").is("closed_at", null).order("opened_at", { ascending: false }).limit(20);
    if (error) return c.json({ error: error.message }, 500);
    const items = (data ?? []).map((n) => {
      const row = n as { id: string; kind: string; subject: string; detail: Record<string, unknown> | null; opened_at: string };
      return {
        id: row.id,
        kind: row.kind,
        subject: row.subject,
        reason: typeof row.detail?.reason === "string" ? row.detail.reason : null,
        resumeAt: typeof row.detail?.resumeAt === "string" ? row.detail.resumeAt : null,
        openedAt: row.opened_at,
      };
    });
    return c.json({ items });
  });

  // S6 / S7: the car's coverage grid — core part types and core specs with their state and latest job.
  app.get(`${PREFIX}/coverage/:vehicleCatalogId`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const id = c.req.param("vehicleCatalogId");
    if (!UUID.test(id)) return c.json({ error: "Bad car id" }, 400);
    const { data, error } = await supabase.rpc("catalog_research_coverage", { p_vehicle_catalog_id: id });
    if (error) return c.json({ error: error.message }, error.message.includes("car_not_found") ? 404 : 500);
    return c.json(data ?? {});
  });

  // ---------------------------------------------------------------- vehicle + spec proposals (RE-06 / RE-07)
  app.post(`${PREFIX}/vehicle-proposals/:id/approve`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const { data, error } = await supabase.rpc("approve_vehicle_proposal", { p_proposal_id: c.req.param("id"), p_actor: actorOf(c) });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ result: data });
  });

  for (const kind of ["vehicle", "spec"] as const) {
    app.post(`${PREFIX}/${kind}-proposals/:id/reject`, async (c: Context) => {
      const denied = guardWrite(c);
      if (denied) return denied;
      const table = kind === "vehicle" ? "catalog_vehicle_proposal" : "catalog_spec_proposal";
      const reason = str((await body(c)).reason, 500);
      if (!reason) return c.json({ error: "A reason is required" }, 400);
      const { data: row, error } = await supabase.from(table).update({ status: "rejected", rejected_reason: reason })
        .eq("id", c.req.param("id")).eq("status", "open").select("job_id").maybeSingle();
      if (error) return c.json({ error: error.message }, 400);
      if (!row) return c.json({ error: "Not open" }, 409);
      const jobId = String((row as { job_id: string }).job_id);
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("job_id", jobId).eq("status", "open");
      if ((count ?? 0) === 0) await closeJobNotFound(supabase, jobId, `${kind}_all_rejected`, actorOf(c));
      await supabase.rpc("catalog_research_log_event", { p_job_id: jobId, p_step: "review", p_outcome: `${kind}_rejected`, p_detail: { reason }, p_actor: actorOf(c) });
      return c.json({ ok: true });
    });
  }

  app.post(`${PREFIX}/spec-proposals/:id/approve`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const { data, error } = await supabase.rpc("promote_spec_proposal", { p_proposal_id: c.req.param("id"), p_actor: actorOf(c) });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ result: data });
  });

  // ---------------------------------------------------------------- browser checks (RE-01 / RE-28 / RE-29)
  app.get(`${PREFIX}/browser-checks/summary`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const [{ count: open }, { count: waiting }, { data: settings }] = await Promise.all([
      supabase.from("catalog_research_job").select("id", { count: "exact", head: true }).eq("state", "browser_check"),
      supabase.from("catalog_research_job").select("id", { count: "exact", head: true }).eq("state", "browser_check_queued"),
      supabase.from("catalog_research_settings").select("max_open_browser_checks").eq("id", 1).single(),
    ]);
    return c.json({ open: open ?? 0, waiting: waiting ?? 0, max: Number(settings?.max_open_browser_checks ?? 25) });
  });

  app.post(`${PREFIX}/browser-checks/:jobId/preview`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const ctx = await browserCheckContext(supabase, c.req.param("jobId"));
    if ("error" in ctx) return c.json({ error: ctx.error }, ctx.status);
    const b = await body(c);
    const pasted = str(b.pasted, 2000);
    return c.json({ gate: browserCheckGate({ ...ctx.gateInput, pasted, typedNumber: str(b.number, 40) || null }) });
  });

  app.post(`${PREFIX}/browser-checks/:jobId/confirm`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    const ctx = await browserCheckContext(supabase, jobId);
    if ("error" in ctx) return c.json({ error: ctx.error }, ctx.status);
    const b = await body(c);
    const pasted = str(b.pasted, 2000);
    const url = str(b.url, 2000);
    let host = "";
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") throw new Error("https");
      host = siteDomain(u.hostname);
    } catch {
      return c.json({ error: "The catalogue page link is required (https)" }, 400);
    }
    // Review #4: the page must be a trusted catalogue — the car maker's for this car's make, or a part maker's.
    const { data: trusted } = await supabase.from("trusted_source").select("kind, maker_norm").eq("domain", host);
    const make = String(ctx.car.make ?? "").trim().toLowerCase();
    const allowed = (trusted ?? []).some((t) => {
      const row = t as { kind: string; maker_norm: string | null };
      return row.kind === "part_maker" || (row.kind === "car_maker" && String(row.maker_norm ?? "").toLowerCase() === make);
    });
    if (!allowed) return c.json({ error: "That page isn't on a trusted catalogue for this car. Use the Open page button." }, 400);

    // RE-68: the owner answers the check's questions (new screen); pasted text (older screen) still works.
    let detected = "";
    let evidenceText = pasted;
    let answeredVersion: string | null = null;
    let positionItems: PositionItem[] | null = null;
    if (b.answers && typeof b.answers === "object") {
      const fit = String(ctx.job.fit_descriptor ?? "").toLowerCase();
      const side = fit.includes("rear") ? "rear" : fit.includes("front") ? "front" : null;
      const ans = answersGate({
        jobType: ctx.gateInput.jobType,
        answers: b.answers as CheckAnswers,
        identity: ctx.gateInput.identity,
        frame: ctx.car.chassis_code,
        specKey: ctx.gateInput.specKey,
        needsSide: side,
        site: host,
        rowName: str(b.rowName, 120) || null,
        buildText: ctx.buildText,
        knownCode: ctx.knownCode,
        suggestions: ctx.gateInput.jobType === "part" ? ctx.gateInput.candidates : ctx.specSuggestions,
        positionScheme: ctx.positionScheme,
        jobAxle: side as "front" | "rear" | null,
        build: ctx.gateInput.build ?? null,
      });
      if (!ans.ok) {
        const msg: Record<string, string> = {
          version_no: "Answer the first question: is the page for this car?",
          part_not_found: "If the part isn't on the page, press Not on this page.",
          dates_no: "The dates don't cover this car's build. Add the missing number, or press Not on this page.",
          side_no: "If it isn't for that side, press Not on this page.",
          no_value: ctx.gateInput.jobType === "part" ? "Type the part number shown." : "That value doesn't look right for this item.",
          bad_number: "That isn't a part number (it looks like a car code or a year).",
          bad_version: "Type the full Model shown at the top, like M900A-AGBVE.",
          retype_mismatch: "The two numbers you typed don't match.",
          bad_position: "Those places don't fit this part. Refresh the page and answer again.",
          needs_positions: "This part comes in left and right: give the number for each place.",
          bad_change_date: "Pick a change month inside this car's build dates.",
          bad_dates: "Check the dates: each needs a year, and the end can't be before the start.",
        };
        return c.json({ error: msg[ans.reason] ?? "Check your answers.", gate: ans }, 422);
      }
      detected = ans.detected;
      evidenceText = ans.evidence;
      answeredVersion = ans.versionCode;
      positionItems = ans.items ?? null;
    } else {
      if (ctx.gateInput.jobType === "part" && (ctx.positionScheme === "four_corners" || ctx.positionScheme === "axle_left_right")) {
        return c.json({ error: "This part comes in left and right: refresh the page to give the number for each place." }, 422);
      }
      const gate = browserCheckGate({ ...ctx.gateInput, pasted, typedNumber: str(b.number, 40) || null });
      if (!gate.ok) return c.json({ error: "Confirm needs the car and a value on the pasted line", gate }, 422);
      detected = gate.detected;
    }

    const actor = actorOf(c);
    const { data: read, error: readErr } = await supabase.from("research_page_read").insert({
      job_id: jobId,
      purpose: "job",
      path: "owner_browser",
      domain: host,
      url,
      final_url: url,
      block_text: evidenceText,
      block_hash: await sha256(evidenceText),
      checked_by: actor,
    }).select("id").single();
    if (readErr) return c.json({ error: readErr.message }, 400);
    const readId = String((read as { id: string }).id);

    // RE-63: once Confirm has fully worked, remember the catalogue's name and page for this car's version
    // (only when the paste names exactly one version), so the next check says "click it".
    const rememberVersion = async () => {
      const versionCode = answeredVersion ?? versionCodeOnLine(pasted, ctx.car.chassis_code);
      if (!versionCode || !ctx.job.vehicle_catalog_id) return;
      // RE-67: the version's dates as the catalogue writes them, from the pasted title line (when there).
      const period = periodTextOnLine(pasted);
      const { error: vErr } = await supabase.from("research_car_site_version").upsert({
        vehicle_catalog_id: ctx.job.vehicle_catalog_id,
        domain: host,
        version_code: versionCode,
        version_url: versionPageUrl(url),
        ...(period ? { prod_period: period } : {}),
        confirmed_by: actor,
        confirmed_at: new Date().toISOString(),
      }, { onConflict: "vehicle_catalog_id,domain" });
      if (vErr) console.warn("research_car_site_version upsert failed", vErr.message);
    };

    if (ctx.job.job_type === "spec") {
      const { data: prop, error } = await supabase.from("catalog_spec_proposal").upsert({
        job_id: jobId,
        vehicle_catalog_id: ctx.job.vehicle_catalog_id,
        spec_key: ctx.job.spec_key,
        value: detected,
        evidence_read_ids: [readId],
        trust_route: "owner_browser",
        route: "review",
        status: "open",
      }, { onConflict: "job_id,spec_key" }).select("id").single();
      if (error) return c.json({ error: error.message }, 400);
      const { data, error: pErr } = await supabase.rpc("promote_spec_proposal", { p_proposal_id: (prop as { id: string }).id, p_actor: actor });
      if (pErr) return c.json({ error: pErr.message }, 400);
      await supabase.rpc("catalog_research_expire_browser_checks");
      await rememberVersion();
      return c.json({ result: data, detected: detected });
    }

    // Part: the number(s) the owner saw on the car maker's catalogue (owner-checked, RE-29). RE-69: parts that come in
    // positions save one entry per number, listing each position it was confirmed for.
    const { data: comp } = await supabase.from("maintenance_service_categories").select("name").eq("id", ctx.job.maintenance_component_id).maybeSingle();
    const fit = String(ctx.job.fit_descriptor ?? "").toLowerCase();
    const jobAxle = fit.includes("rear") ? "rear" : fit.includes("front") ? "front" : "";
    // RE-70: a number that changed during the build carries the build years it is for.
    type Place = { axle: string; side: string | null; yearFrom: number | null; yearTo: number | null; periodText: string | null };
    type Group = { number: string; places: Place[] };
    const groups = new Map<string, Group>();
    if (positionItems && positionItems.length) {
      for (const it of positionItems) {
        const k = it.detected.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const g = groups.get(k) ?? { number: it.detected, places: [] };
        g.places.push({
          axle: it.axle ?? jobAxle,
          side: it.side,
          yearFrom: it.yearFrom ?? null,
          yearTo: it.yearTo ?? null,
          periodText: it.periodText ?? null,
        });
        groups.set(k, g);
      }
    } else {
      groups.set(detected.toUpperCase().replace(/[^A-Z0-9]/g, ""), {
        number: detected,
        places: [{ axle: jobAxle, side: null, yearFrom: null, yearTo: null, periodText: null }],
      });
    }
    const results: Array<{ number: string; places: string[]; result: unknown }> = [];
    const placeText = (g: Group) =>
      g.places.map((p) => [`${p.axle}${p.side ? ` ${p.side}` : ""}`.trim() || "this car", p.periodText ?? ""].filter(Boolean).join(" "));
    const partial = (g: Group, why: string) => {
      const saved = results.map((r) => `${r.places.join(", ")} ${r.number}`).join("; ");
      return c.json({
        error: saved
          ? `Saved ${saved}. Couldn't save ${placeText(g).join(", ")} ${g.number}: ${why}`
          : why,
        saved: results,
      }, 400);
    };
    for (const [norm, g] of groups) {
      // Listings: one per axle (and build years, RE-70); both sides of an axle on the same number → side "both".
      const byAxle = new Map<string, { axle: string; yearFrom: number | null; yearTo: number | null; sides: Set<string> }>();
      for (const p of g.places) {
        const key = `${p.axle}|${p.yearFrom ?? ""}|${p.yearTo ?? ""}`;
        const e = byAxle.get(key) ?? { axle: p.axle, yearFrom: p.yearFrom, yearTo: p.yearTo, sides: new Set<string>() };
        if (p.side) e.sides.add(p.side);
        byAxle.set(key, e);
      }
      const listings = [...byAxle.values()].map(({ axle, yearFrom, yearTo, sides }) => {
        const side = sides.size === 2 ? "both" : sides.size === 1 ? [...sides][0] : undefined;
        return {
          vehicleId: ctx.job.vehicle_catalog_id,
          position: axle || undefined,
          ...(side ? { side } : {}),
          ...(yearFrom != null ? { yearFrom } : {}),
          ...(yearTo != null ? { yearTo } : {}),
        };
      });
      // The proposal keeps the lookup's own axle as its key (the worker's suggestion row is updated, not duplicated);
      // the exact places live in its listings.
      const positionKey = jobAxle;
      // The suggestion the owner confirmed keeps its own brand and kind (a part maker's number stays aftermarket).
      const { data: existingRows } = await supabase.from("catalog_part_proposal").select("id, brand, part_name, match_kind")
        .eq("job_id", jobId).eq("part_number_norm", norm).order("created_at").limit(1);
      const existing = (existingRows ?? [])[0] as { brand?: string; part_name?: string; match_kind?: string } | undefined;
      const { data: prop, error } = await supabase.from("catalog_part_proposal").upsert({
        job_id: jobId,
        brand: existing?.brand ?? ctx.car.make ?? "OEM",
        part_number: g.number,
        part_number_norm: norm,
        part_name: existing?.part_name ?? comp?.name ?? "Part",
        position_key: positionKey,
        match_kind: existing?.match_kind ?? "oem",
        trust_route: "owner_browser",
        evidence_read_ids: [readId],
        fits: { listings },
        sources: [{ url, domain: host, readId, block: evidenceText }],
        route: "review",
        status: "open",
      }, { onConflict: "job_id,part_number_norm,position_key" }).select("id").single();
      if (error) return partial(g, error.message);
      const { data: done, error: pErr } = await supabase.rpc("promote_part_proposal", { p_proposal_id: (prop as { id: string }).id, p_actor: actor });
      if (pErr) return partial(g, pErr.message);
      results.push({ number: g.number, places: placeText(g), result: done });
      const batchId = (done as { batchId?: string } | null)?.batchId;
      if (batchId) await autoResolveFromBatch(supabase, batchId, actor);
    }
    await supabase.rpc("catalog_research_expire_browser_checks");
    await rememberVersion();
    return c.json({ result: results[results.length - 1]?.result ?? null, results, detected: detected });
  });

  app.post(`${PREFIX}/browser-checks/:jobId/not-on-page`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    const { data: open, error } = await supabase.from("catalog_research_job").select("id")
      .eq("id", jobId).eq("state", "browser_check").maybeSingle();
    if (error) return c.json({ error: error.message }, 400);
    if (!open) return c.json({ error: "Not an open browser check" }, 409);
    await closeJobNotFound(supabase, jobId, "not_on_page", actorOf(c), "not on the catalogue page (owner)");
    await supabase.rpc("catalog_research_expire_browser_checks");
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- conflicts (RE-19)
  app.get(`${PREFIX}/conflicts`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    let q = supabase.from("research_number_conflict")
      .select("id, job_id, vehicle_catalog_id, platform_component_id, position, proposal_ids, opened_at, closed_at, resolution")
      .order("opened_at", { ascending: false }).limit(200);
    const jobId = c.req.query("jobId");
    if (jobId && UUID.test(jobId)) q = q.eq("job_id", jobId);
    if (c.req.query("open") === "1") q = q.is("closed_at", null);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data ?? [] });
  });

  app.post(`${PREFIX}/conflicts/:id/resolve`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const id = c.req.param("id");
    const b = await body(c);
    const resolution = str(b.resolution, 20);
    const picked = str(b.proposalId, 40);
    if (resolution !== "picked" && resolution !== "both_wrong") return c.json({ error: "resolution must be picked or both_wrong" }, 400);
    const { data: conflict } = await supabase.from("research_number_conflict").select("id, job_id, proposal_ids, closed_at").eq("id", id).maybeSingle();
    if (!conflict) return c.json({ error: "Not found" }, 404);
    const cf = conflict as { id: string; job_id: string; proposal_ids: string[]; closed_at: string | null };
    if (cf.closed_at) return c.json({ error: "Already resolved" }, 409);
    if (resolution === "picked" && !cf.proposal_ids.includes(picked)) return c.json({ error: "Pick one of the conflict's numbers" }, 400);
    const actor = actorOf(c);

    // Review #6: add the chosen number first; the others are set aside only once that worked, so a failed add leaves
    // the conflict open with every choice still available.
    let promoted: unknown = null;
    if (resolution === "picked") {
      const { data, error } = await supabase.rpc("promote_part_proposal", { p_proposal_id: picked, p_actor: actor });
      if (error) return c.json({ error: error.message }, 400);
      promoted = data;
      const batchId = (data as { batchId?: string } | null)?.batchId;
      if (batchId) await autoResolveFromBatch(supabase, batchId, actor);
    }
    const others = cf.proposal_ids.filter((p) => resolution === "both_wrong" || p !== picked);
    await supabase.from("catalog_part_proposal").update({
      status: "rejected",
      rejected_reason: resolution === "picked" ? "owner chose the other number" : "owner: neither number is right",
    }).in("id", others).eq("status", "open");
    if (resolution === "both_wrong") {
      await closeJobNotFound(supabase, cf.job_id, "both_numbers_wrong", actor);
    }
    const { data: closed } = await supabase.from("research_number_conflict")
      .update({ closed_at: new Date().toISOString(), resolution, resolved_by: actor })
      .eq("id", id).is("closed_at", null).select("id").maybeSingle();
    if (!closed) return c.json({ error: "Already resolved" }, 409);
    await audit(supabase, c, `conflict_${resolution}`, "research_number_conflict", id, null, { picked: picked || null });
    return c.json({ ok: true, result: promoted });
  });

  // ---------------------------------------------------------------- trusted sites + recipes (RE-11 / RE-21)
  app.get(`${PREFIX}/trusted-sites`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const [{ data: sites, error }, { data: makers }, { data: recipes }] = await Promise.all([
      supabase.from("trusted_site").select("domain, automated_read, automated_read_checked_at, automated_read_note, blocked_at, backoff_until, pages_confirmed").order("domain"),
      supabase.from("trusted_source").select("domain, kind, maker"),
      supabase.from("research_lookup_recipe").select("id, domain, active"),
    ]);
    if (error) return c.json({ error: error.message }, 500);
    const items = (sites ?? []).map((s) => {
      const site = s as { domain: string };
      return {
        ...site,
        makers: (makers ?? []).filter((m) => (m as { domain: string }).domain === site.domain)
          .map((m) => ({ kind: (m as { kind: string }).kind, maker: (m as { maker: string }).maker })),
        recipeCount: (recipes ?? []).filter((r) => (r as { domain: string }).domain === site.domain).length,
      };
    }).filter((s) => !(s.makers.length === 0 && (s as { automated_read_note?: string | null }).automated_read_note === "removed by owner"));
    return c.json({ items });
  });

  app.post(`${PREFIX}/trusted-sites`, async (c: Context) => {
    const denied = guardOwner(c);
    if (denied) return denied;
    const b = await body(c);
    const domain = siteDomain(str(b.domain, 200).replace(/^https?:\/\//, "").split("/")[0]);
    const kind = str(b.kind, 20);
    const read = str(b.automatedRead, 20) || "not_checked";
    const makers = Array.isArray(b.makers) ? (b.makers as unknown[]).map((m) => str(m, 80)).filter(Boolean) : [];
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return c.json({ error: "A website address like sbparts.jp is required" }, 400);
    if (!["car_maker", "part_maker", "reference"].includes(kind)) return c.json({ error: "Choose the kind of site" }, 400);
    if (!["allowed", "blocked", "not_checked"].includes(read)) return c.json({ error: "Choose whether it allows automatic reading" }, 400);
    if (kind !== "reference" && makers.length === 0) return c.json({ error: "Choose at least one maker" }, 400);
    const { error } = await supabase.from("trusted_site").upsert({
      domain,
      automated_read: read,
      automated_read_checked_at: read === "not_checked" ? null : (str(b.checkedAt, 10) || new Date().toISOString().slice(0, 10)),
      updated_at: new Date().toISOString(),
    }, { onConflict: "domain" });
    if (error) return c.json({ error: error.message }, 400);
    const rows = (kind === "reference" ? ["All makers"] : makers).map((maker) => ({ kind, maker, domain, added_by: actorOf(c) }));
    const { error: mErr } = await supabase.from("trusted_source").upsert(rows, { onConflict: "kind,maker_norm,domain", ignoreDuplicates: true });
    if (mErr) return c.json({ error: mErr.message }, 400);
    await audit(supabase, c, "add_site", "trusted_site", domain, null, { kind, makers, automatedRead: read });
    return c.json({ ok: true, domain });
  });

  app.patch(`${PREFIX}/trusted-sites/:domain`, async (c: Context) => {
    const denied = guardOwner(c);
    if (denied) return denied;
    const domain = c.req.param("domain");
    const b = await body(c);
    const read = str(b.automatedRead, 20);
    if (!["allowed", "blocked"].includes(read)) return c.json({ error: "automatedRead must be allowed or blocked" }, 400);
    const { data: before } = await supabase.from("trusted_site").select("*").eq("domain", domain).maybeSingle();
    if (!before) return c.json({ error: "Not found" }, 404);
    const now = new Date().toISOString();
    const { error } = await supabase.from("trusted_site").update({
      automated_read: read,
      automated_read_checked_at: now.slice(0, 10),
      blocked_at: read === "blocked" ? now : null,
      backoff_until: null,
      updated_at: now,
    }).eq("domain", domain);
    if (error) return c.json({ error: error.message }, 400);
    await audit(supabase, c, read === "allowed" ? "mark_readable" : "mark_browser_check", "trusted_site", domain, before, { automatedRead: read });
    return c.json({ ok: true });
  });

  app.post(`${PREFIX}/trusted-sites/:domain/remove`, async (c: Context) => {
    const denied = guardOwner(c);
    if (denied) return denied;
    const domain = c.req.param("domain");
    const { data: before } = await supabase.from("trusted_source").select("kind, maker").eq("domain", domain);
    await supabase.from("research_lookup_recipe").update({ active: false }).eq("domain", domain);
    const { error } = await supabase.from("trusted_source").delete().eq("domain", domain);
    if (error) return c.json({ error: error.message }, 400);
    await supabase.from("trusted_site").update({ automated_read: "blocked", blocked_at: null, automated_read_note: "removed by owner" /* removal is not a block: no notice */ }).eq("domain", domain);
    await audit(supabase, c, "remove_site", "trusted_site", domain, before, null);
    return c.json({ ok: true });
  });

  // S5 "last reads (expand to see the read log)": the site's latest page reads. No page text, no job or request ids.
  app.get(`${PREFIX}/trusted-sites/:domain/reads`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data, error } = await supabase.from("research_page_read")
      .select("id, purpose, path, url, final_url, http_status, block_text, read_at")
      .eq("domain", c.req.param("domain")).order("read_at", { ascending: false }).limit(20);
    if (error) return c.json({ error: error.message }, 500);
    const items = (data ?? []).map((r) => {
      const row = r as { id: string; purpose: string; path: string; url: string; final_url: string | null; http_status: number | null; block_text: string | null; read_at: string };
      return {
        id: row.id,
        purpose: row.purpose,
        path: row.path,
        url: row.final_url || row.url,
        httpStatus: row.http_status,
        foundRow: Boolean(row.block_text),
        readAt: row.read_at,
      };
    });
    return c.json({ items });
  });

  app.get(`${PREFIX}/trusted-sites/:domain/recipes`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const domain = c.req.param("domain");
    const { data, error } = await supabase.from("research_lookup_recipe")
      .select("id, domain, maker_norm, name, kind, search_url_template, form_body_template, result_link_rule, block_rule, active, notes, updated_at")
      .eq("domain", domain).order("name");
    if (error) return c.json({ error: error.message }, 500);
    const ids = (data ?? []).map((r) => (r as { id: string }).id);
    // "Worked N times · last on <date>" = job reads with a block found, by recipe (round 2).
    const { data: reads } = ids.length
      ? await supabase.from("research_page_read").select("recipe_id, read_at").in("recipe_id", ids).eq("purpose", "job").not("block_text", "is", null)
      : { data: [] };
    const items = (data ?? []).map((r) => {
      const mine = (reads ?? []).filter((x) => (x as { recipe_id: string }).recipe_id === (r as { id: string }).id);
      const last = mine.map((x) => String((x as { read_at: string }).read_at)).sort().pop() ?? null;
      return { ...(r as Record<string, unknown>), worked: mine.length, lastWorkedAt: last };
    });
    return c.json({ items });
  });

  app.post(`${PREFIX}/trusted-sites/:domain/recipes`, async (c: Context) => {
    const denied = guardOwner(c);
    if (denied) return denied;
    const domain = c.req.param("domain");
    const b = await body(c);
    const row = recipeRow(b);
    if ("error" in row) return c.json({ error: row.error }, 400);
    const { data, error } = await supabase.from("research_lookup_recipe").insert({ ...row, domain, created_by: actorOf(c) }).select("id").single();
    if (error) return c.json({ error: error.message }, 400);
    await audit(supabase, c, "add_recipe", "research_lookup_recipe", String((data as { id: string }).id), null, row);
    return c.json({ ok: true, id: (data as { id: string }).id });
  });

  app.patch(`${PREFIX}/recipes/:id`, async (c: Context) => {
    const denied = guardOwner(c);
    if (denied) return denied;
    const id = c.req.param("id");
    const b = await body(c);
    const { data: before } = await supabase.from("research_lookup_recipe").select("*").eq("id", id).maybeSingle();
    if (!before) return c.json({ error: "Not found" }, 404);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof b.active === "boolean") patch.active = b.active;
    if (b.name !== undefined || b.searchUrlTemplate !== undefined || b.kind !== undefined || b.formBodyTemplate !== undefined) {
      const row = recipeRow({ ...recipeToBody(before as Record<string, unknown>), ...b });
      if ("error" in row) return c.json({ error: row.error }, 400);
      Object.assign(patch, row);
    }
    const { error } = await supabase.from("research_lookup_recipe").update(patch).eq("id", id);
    if (error) return c.json({ error: error.message }, 400);
    await audit(supabase, c, patch.active === false ? "turn_off_recipe" : "edit_recipe", "research_lookup_recipe", id, before, patch);
    return c.json({ ok: true });
  });

  // Round 2: "Test on a car" — one run, nothing saved but the read row (purpose recipe_test), never blocks a site.
  app.post(`${PREFIX}/recipes/:id/test`, async (c: Context) => {
    const denied = guardOwner(c);
    if (denied) return denied;
    const b = await body(c);
    const carId = str(b.vehicleCatalogId, 40);
    if (!UUID.test(carId)) return c.json({ error: "Choose a car" }, 400);
    const [{ data: recipe }, { data: car }] = await Promise.all([
      supabase.from("research_lookup_recipe").select("id, domain, kind, search_url_template, form_body_template, result_link_rule, block_rule").eq("id", c.req.param("id")).maybeSingle(),
      supabase.from("vehicle_catalog").select("make, model, chassis_code, engine_code").eq("id", carId).maybeSingle(),
    ]);
    if (!recipe || !car) return c.json({ error: "Not found" }, 404);
    const number = str(b.number, 40) || null;
    const result = await runRecipe(recipe as LookupRecipe, {
      number,
      chassis: (car as { chassis_code?: string }).chassis_code,
      model: (car as { model?: string }).model,
      make: (car as { make?: string }).make,
      engine: (car as { engine_code?: string }).engine_code,
    }, {
      number: number ?? undefined,
      identity: identityTokens(car as Record<string, string>),
      frame: (car as { chassis_code?: string | null }).chassis_code ?? null,
      valuePattern: number ? undefined : /\S+/,
    }, { purpose: "recipe_test" });
    if (result.kind === "found") return c.json({ found: true, block: result.block, url: result.pageRead.finalUrl });
    if (result.kind === "browser_check") return c.json({ found: false, browserCheckUrl: versionListLink(result.url) });
    return c.json({ found: false, reason: result.kind === "unreadable" ? result.outcome.kind : result.reason });
  });
}

// ---------------------------------------------------------------- helpers

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

type JobRow = {
  id: string;
  job_type: string;
  state: string;
  vehicle_catalog_id: string | null;
  maintenance_component_id: string | null;
  spec_key: string | null;
  fit_descriptor: string | null;
};

async function browserCheckContext(supabase: SupabaseClient, jobId: string): Promise<
  | {
    job: JobRow;
    car: Record<string, string | null>;
    /** RE-68: the version Roam remembers for this car, the build dates and suggested spec values (server's own records). */
    knownCode: string | null;
    buildText: string | null;
    specSuggestions: string[];
    /** RE-69: the part type's position scheme (shocks = four_corners…). */
    positionScheme: string | null;
    gateInput: {
      jobType: "part" | "spec";
      identity: string[];
      specKey?: string | null;
      expectedNumber?: string | null;
      candidates: string[];
      build: CarBuild | null;
      engineCode: string | null;
      otherEngines: string[];
    };
  }
  | { error: string; status: 400 | 404 | 409 }
> {
  if (!UUID.test(jobId)) return { error: "Bad job id", status: 400 };
  const { data: job } = await supabase.from("catalog_research_job")
    .select("id, job_type, state, vehicle_catalog_id, maintenance_component_id, spec_key, fit_descriptor").eq("id", jobId).maybeSingle();
  if (!job) return { error: "Not found", status: 404 };
  const j = job as JobRow;
  if (j.state !== "browser_check") return { error: "Not an open browser check", status: 409 };
  if (j.job_type !== "part" && j.job_type !== "spec") return { error: "Browser checks are for parts and specs", status: 409 };
  const { data: car } = await supabase.from("vehicle_catalog")
    .select("make, model, chassis_code, engine_code, production_start_year, production_start_month, production_end_year, production_end_month")
    .eq("id", j.vehicle_catalog_id).maybeSingle();
  const c0 = (car ?? {}) as Record<string, string | number | null>;
  // RE-60: the same model's other engines (e.g. the turbo) — a pasted line naming only one of those is the wrong version.
  const { data: siblings } = c0.make && c0.model
    ? await supabase.from("vehicle_catalog").select("engine_code, production_start_year, production_end_year")
      .eq("make", String(c0.make)).eq("model", String(c0.model)).not("engine_code", "is", null).limit(60)
    : { data: [] };
  // Only versions built in overlapping years count as sisters (another generation's engines are not this page's).
  const y1 = Number(c0.production_start_year ?? 0) || 0;
  const y2 = Number(c0.production_end_year ?? 0) || 9999;
  type Sib = { engine_code: string | null; production_start_year: number | null; production_end_year: number | null };
  const otherEngines = [
    ...new Set(
      ((siblings ?? []) as Sib[])
        .filter((s) => (s.production_start_year ?? 0) <= y2 && (s.production_end_year ?? 9999) >= y1)
        .map((s) => String(s.engine_code ?? "").trim())
        .filter(Boolean),
    ),
  ].filter((e) => e.toUpperCase().replace(/[^A-Z0-9]/g, "") !== String(c0.engine_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const [{ data: kv }, { data: specProps }, { data: compRow }] = await Promise.all([
    supabase.from("research_car_site_version").select("version_code").eq("vehicle_catalog_id", j.vehicle_catalog_id)
      .order("confirmed_at", { ascending: false }).limit(1),
    j.job_type === "spec"
      ? supabase.from("catalog_spec_proposal").select("value").eq("job_id", jobId).eq("status", "open")
      : Promise.resolve({ data: [] }),
    j.maintenance_component_id
      ? supabase.from("maintenance_service_categories").select("position_scheme").eq("id", j.maintenance_component_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const positionScheme = (compRow as { position_scheme?: string | null } | null)?.position_scheme ?? null;
  const knownCode = ((kv ?? []) as Array<{ version_code: string }>)[0]?.version_code ?? null;
  const specSuggestions = ((specProps ?? []) as Array<{ value: string | null }>).map((p) => String(p.value ?? "").trim()).filter(Boolean);
  const p2 = (n: number | null) => (n == null ? "" : String(n).padStart(2, "0"));
  const sy = num(c0.production_start_year);
  const sm = num(c0.production_start_month);
  const ey = num(c0.production_end_year);
  const em = num(c0.production_end_month);
  const buildText = sy ? `${sm ? `${p2(sm)}.` : ""}${sy} – ${ey ? `${em ? `${p2(em)}.` : ""}${ey}` : "now"}` : null;
  // Every open number Roam suggested, first suggestion first (RE-57: the line must hold one of them, or a typed one).
  const { data: open } = j.job_type === "part"
    ? await supabase.from("catalog_part_proposal").select("part_number").eq("job_id", jobId).eq("status", "open").order("created_at")
    : { data: [] };
  const candidates = ((open ?? []) as Array<{ part_number: string | null }>).map((p) => String(p.part_number ?? "").trim()).filter(Boolean);
  return {
    job: j,
    car: (car ?? {}) as Record<string, string | null>,
    knownCode,
    buildText,
    specSuggestions,
    positionScheme,
    gateInput: {
      jobType: j.job_type as "part" | "spec",
      identity: identityTokens((car ?? {}) as Record<string, string>),
      specKey: j.spec_key,
      expectedNumber: candidates[0] ?? null,
      candidates,
      build: {
        startYear: num(c0.production_start_year),
        startMonth: num(c0.production_start_month),
        endYear: num(c0.production_end_year),
        endMonth: num(c0.production_end_month),
      },
      engineCode: c0.engine_code ? String(c0.engine_code) : null,
      otherEngines,
    },
  };
}

function recipeRow(b: Record<string, unknown>):
  | { name: string; kind: string; search_url_template: string | null; form_body_template: string | null; result_link_rule: string | null; block_rule: string | null; maker_norm: string | null; notes: string | null }
  | { error: string } {
  const name = str(b.name, 120);
  const kind = str(b.kind, 30);
  const url = str(b.searchUrlTemplate, 1000);
  if (!name) return { error: "Name the recipe" };
  if (!["by_part_number", "search_then_page", "browser_check_link", "form_then_page"].includes(kind)) return { error: "Choose the recipe kind" };
  if (!/^https:\/\//.test(url)) return { error: "The lookup address must start with https://" };
  // RE-30: a form recipe says which fields it posts; other kinds never post.
  const formBody = kind === "form_then_page" ? str(b.formBodyTemplate, 1001) : "";
  if (formBody.length > 1000) return { error: "The form fields are too long (1,000 characters at most)" };
  if (kind === "form_then_page" && !/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(formBody)) {
    return { error: "Add the form fields, like txtPartNo={number}&txtClass=1" };
  }
  const blockRule = b.blockRule == null ? null : typeof b.blockRule === "string" ? b.blockRule : JSON.stringify(b.blockRule);
  if (blockRule) {
    try {
      JSON.parse(blockRule);
    } catch {
      return { error: "The row rule is not valid" };
    }
  }
  return {
    name,
    kind,
    search_url_template: url,
    form_body_template: formBody || null,
    // Only the kinds that open a result link keep a link rule; clearing the box clears it.
    result_link_rule: kind === "search_then_page" || kind === "form_then_page" ? str(b.resultLinkRule, 300) || null : null,
    block_rule: blockRule,
    maker_norm: str(b.maker, 80).toLowerCase() || null,
    notes: str(b.notes, 1000) || null,
  };
}

function recipeToBody(r: Record<string, unknown>): Record<string, unknown> {
  return {
    name: r.name,
    kind: r.kind,
    searchUrlTemplate: r.search_url_template,
    formBodyTemplate: r.form_body_template,
    resultLinkRule: r.result_link_rule,
    blockRule: r.block_rule,
    maker: r.maker_norm,
    notes: r.notes,
  };
}
