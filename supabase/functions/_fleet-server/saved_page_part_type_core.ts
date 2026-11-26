/**
 * R3 / AS-23 (docs/part-type-auto-sort-audit.md §3, §4 R3): the part of "Add part type" that creates the type, writes
 * the saved answer, proves the rows again, saves each axle and queues pictures — shared by the Add route and the
 * upload's auto-sort, so both take exactly one path.
 *
 * `strict` is the only behavioural switch: the Add button keeps today's save path (`false`); the auto-sort uses the
 * upload's side-coverage check (`true`), so a partial axle is held where an upload would hold it.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { answersGate, type CarBuild, type CheckAnswers } from "./research_browser_check.ts";
import { identityTokens } from "./research_part_job.ts";
import { savePartAnswers, type SaveJob } from "./research_part_save.ts";
import { PLACE_AXLE_REASON, PLACE_SIDE_REASON, type PartType, placeGap, rowNamesType } from "./saved_page_proof.ts";
import { existingTypeFor } from "./saved_page_suggest.ts";
import { normalisePhrase, parseGroupPhrase } from "./saved_page_phrases.ts";
import { loadPageDrawings, type SavedPageDiagramStore } from "./saved_page_diagrams.ts";
import {
  type PartPictureQueueDeps,
  type PartPictureQueueRow,
  type PicturesResult,
  queuePartPictures,
} from "./part_pictures_queue.ts";
import { type OnFile, overlaps, parseOnFile, placeMatches, POSITION_SCHEMES } from "./saved_page_on_file.ts";
import { savedPageBuildText } from "./saved_page_build_text.ts";
import type { ResultRow } from "./research_saved_page_routes.ts";

const SIDED = new Set(["four_corners", "axle_left_right"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const norm = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const plainError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message && message.length <= 200 ? message : "That didn't work. Try again.";
};

export const NO_TYPE_WORDS_REASON = "The page doesn't name this part type on that row";

export type CoreAnswer = {
  /** Who set the answer. */
  setBy: "owner" | "roam";
  /** The owner's login for a skip; null for Roam. */
  actor: string | null;
  /** A few plain words. */
  reason: string | null;
  /** False when the answer was already written (R4 re-save); true for Add and the upload's sort. */
  write?: boolean;
};

export type CoreInput = {
  page: { id: string; vehicle_catalog_id: string; domain: string | null; source_url: string | null };
  /** The type's name (the plain name; Add's edited name when the owner changed it). */
  name: string;
  /** The part group the type is created under. */
  groupId: string;
  positionScheme: "none" | "axle" | "axle_left_right";
  /** The page's own phrase (the answer key; the synonym's phrase_key). */
  phrase: string;
  rows: ResultRow[];
  /** Continue from a previous press / an existing type. */
  typeId?: string | null;
  strict: boolean;
  answer: CoreAnswer;
  /** Pictures: undefined = none, null = none, a deps object = queue them. */
  pictures?: PartPictureQueueDeps | null;
};

export type CoreDecision = {
  row: ResultRow;
  state: "saved" | "already" | "held";
  reason: string | null;
  jobId: string | null;
};

export type CoreType = { id: string; name: string; scheme: string | null };

export type CoreOutcome =
  | {
    ok: true;
    type: CoreType;
    decisions: CoreDecision[];
    everyRowFinal: boolean;
    lastReason: string | null;
    pictures?: PicturesResult;
  }
  | { ok: false; error: string; type?: CoreType };

type LiveType = PartType & { part_type_status?: string | null; kind?: string | null; is_part?: boolean | null };

export function uniqueOpCode(name: string, taken: ReadonlySet<string>): string {
  const base = String(name ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
    "PART_TYPE";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate.toUpperCase()) || taken.has(candidate.toLowerCase())) {
    candidate = `${base}_${n}`;
    n += 1;
  }
  return candidate;
}

/** P4 at Add: the type's own words, or the page phrase when the card was renamed. */
function rowNamesSuggestedPart(
  type: PartType,
  make: string | null,
  row: ResultRow,
  pagePhrase: string,
): boolean {
  if (rowNamesType(type, make, row.groupLine, row.lineText)) return true;
  const words = String(pagePhrase ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 3);
  const text = String(row.groupLine ?? "").toUpperCase();
  return words.some((word) => new RegExp(`(^|[^A-Z0-9])${word}([^A-Z0-9]|$)`).test(text));
}

/** A held reason a second press can never change, because it is a fact about the page (S1b fix 2). */
export function isPageHeldReason(reason: string | null): boolean {
  if (!reason) return false;
  if (reason === NO_TYPE_WORDS_REASON) return true;
  if (reason === PLACE_AXLE_REASON || reason === PLACE_SIDE_REASON) return true;
  if (reason === "No part number on that row") return true;
  return /^Roam already has .+ for these years$/.test(reason);
}

function monthIndexFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear() * 12 + d.getUTCMonth() + 1;
}

function placeOf(row: ResultRow): { axle: "front" | "rear" | null; side: "left" | "right" | "both" | null } {
  const words = String(row.place ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const axle = words.includes("front") ? "front" : words.includes("rear") ? "rear" : null;
  const side = words.includes("left") ? "left" : words.includes("right") ? "right" : words.includes("both") ? "both" : null;
  return { axle, side };
}

async function readLiveTypes(supabase: SupabaseClient): Promise<LiveType[]> {
  const { data, error } = await supabase.from("maintenance_service_categories")
    .select("id, name, position_scheme, part_type_status, kind, is_part")
    .eq("kind", "component").eq("is_part", true).eq("part_type_status", "active")
    .order("name").limit(500);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    scheme: row.position_scheme != null ? String(row.position_scheme) : null,
  }));
}

/** The active part types, for the auto-sort's duplicate check and the saved-answer re-check. */
export async function readActiveTypes(supabase: SupabaseClient): Promise<PartType[]> {
  return (await readLiveTypes(supabase)).map((t) => ({ id: t.id, name: t.name, scheme: t.scheme ?? null }));
}

async function readTypeById(supabase: SupabaseClient, id: string): Promise<LiveType | null> {
  const { data, error } = await supabase.from("maintenance_service_categories")
    .select("id, name, position_scheme").eq("id", id).maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  return row
    ? { id: String(row.id), name: String(row.name), scheme: row.position_scheme != null ? String(row.position_scheme) : null }
    : null;
}

async function readTakenCodes(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("maintenance_service_categories").select("op_code, code").limit(2000);
  if (error) throw error;
  const taken = new Set<string>();
  for (const row of (data ?? []) as Array<{ op_code: string | null; code: string | null }>) {
    if (row.op_code) taken.add(String(row.op_code).toUpperCase());
    if (row.code) taken.add(String(row.code));
  }
  return taken;
}

async function readCar(supabase: SupabaseClient, id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from("vehicle_catalog")
    .select("id, make, model, chassis_code, engine_code, trim_series, catalog_trim, transmission, production_start_year, production_start_month, production_end_year, production_end_month")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

async function rememberedVersion(supabase: SupabaseClient, carId: string, domain: string | null): Promise<string | null> {
  let query = supabase.from("research_car_site_version").select("version_code").eq("vehicle_catalog_id", carId);
  if (domain) query = query.eq("domain", domain);
  const { data, error } = await query.order("confirmed_at", { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as Array<{ version_code: string | null }>)[0]?.version_code ?? null;
}

async function carMakerPage(supabase: SupabaseClient, domain: string | null, make: string | null): Promise<boolean> {
  if (!domain) return false;
  const { data, error } = await supabase.from("trusted_source").select("kind, maker_norm").eq("domain", domain);
  if (error) throw error;
  const wanted = String(make ?? "").trim().toLowerCase();
  return ((data ?? []) as Array<{ kind: string; maker_norm: string | null }>)
    .some((t) => t.kind === "car_maker" && String(t.maker_norm ?? "").toLowerCase() === wanted);
}

async function confirmedOnFile(supabase: SupabaseClient, carId: string): Promise<OnFile[]> {
  const { data, error } = await supabase.from("part_listing")
    .select("position, side, year_from, year_to, part_interchange_group ( part_master ( oem_part_number, maintenance_component_id ) )")
    .eq("vehicle_catalog_id", carId).eq("trust", "confirmed").limit(2000);
  if (error) throw error;
  return parseOnFile(data);
}

/**
 * The answer row written through part_name_answer_set. A seed word that already finds another type makes the RPC
 * raise; the caller keeps the name open with that reason instead of crashing (R3).
 */
async function writeAnswer(
  supabase: SupabaseClient,
  input: CoreInput,
  type: CoreType,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.answer.write === false) return { ok: true };
  const key = normalisePhrase(input.phrase);
  if (!key) return { ok: false, error: "The page has no name for this part" };
  const { data, error } = await supabase.rpc("part_name_answer_set", {
    p_phrase_key: key,
    p_phrase: input.name,
    p_verdict: "track",
    p_type_id: type.id,
    p_set_by: input.answer.setBy,
    p_reason: input.answer.reason,
    p_actor: input.answer.actor,
  });
  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("already finds another part type")) {
      return { ok: false, error: "That word already finds another part type" };
    }
    return { ok: false, error: plainError(error) };
  }
  const set = (data as { set?: string } | null)?.set;
  if (set === "owner_wins") return { ok: false, error: "That name was set by the owner" };
  return { ok: true };
}

/** Resolve or create the part type: by the continued id, the exact name, the duplicate check, then the RPC. */
async function resolveType(
  supabase: SupabaseClient,
  input: CoreInput,
): Promise<CoreType> {
  const live = await readLiveTypes(supabase);
  let type: LiveType | null = input.typeId ? live.find((t) => t.id === input.typeId) ?? await readTypeById(supabase, input.typeId) : null;
  if (!type) {
    type = live.find((t) => t.name.trim().toLowerCase() === input.name.trim().toLowerCase()) ?? null;
  }
  if (!type) {
    const parsed = parseGroupPhrase(input.phrase);
    type = (parsed ? existingTypeFor(parsed.baseName, live) : null) ?? existingTypeFor(input.name, live);
  }
  if (type) return { id: type.id, name: type.name, scheme: type.scheme ?? null };

  const taken = await readTakenCodes(supabase);
  // Roam never appends _2 to dodge an op-code collision (G1): it re-reads and uses the winner.
  const opCode = input.answer.setBy === "roam"
    ? (String(input.name ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "PART_TYPE")
    : uniqueOpCode(input.name, taken);
  const { data, error } = await supabase.rpc("upsert_self_serve_part_type", {
    p_input: {
      areaId: input.groupId,
      name: input.name,
      opCode,
      defaultFitMode: "specific",
      positionScheme: input.positionScheme,
      status: "active",
    },
  });
  if (error) {
    const message = String(error.message ?? "");
    if (input.answer.setBy === "roam" && message.includes("Op code already in use")) {
      const again = await readLiveTypes(supabase);
      const winner = again.find((t) => t.name.trim().toLowerCase() === input.name.trim().toLowerCase())
        ?? existingTypeFor(input.name, again);
      if (winner) return { id: winner.id, name: winner.name, scheme: winner.scheme ?? null };
      throw new Error("That name is already in use. Try another name.");
    }
    throw new Error(message || "The part type wasn't saved. Try again.");
  }
  const createdId = String((data as { id?: string } | null)?.id ?? "");
  if (!createdId) throw new Error("The part type wasn't saved. Try again.");
  const made = await readTypeById(supabase, createdId);
  if (!made) throw new Error("The part type wasn't saved. Try again.");
  return { id: made.id, name: made.name, scheme: made.scheme ?? null };
}

type Decision = CoreDecision & {
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
  fromMonth: number | null;
  toMonth: number | null;
};

/** The upload's side-coverage rule (P7): a partial axle is held, not half-saved. */
function strictGap(groupRows: Decision[], type: CoreType, build: CarBuild): string | null {
  const dated = groupRows.filter((d) => d.fromMonth != null);
  if (!dated.length) return null;
  const periods = (rs: Decision[]) => rs.map((d) => ({ from: d.fromMonth!, to: d.toMonth! }));
  if (SIDED.has(String(type.scheme ?? ""))) {
    for (const place of ["left", "right"] as const) {
      const sideRows = dated.filter((d) => d.side === place || d.side === "both");
      if (!sideRows.length) return "No number for this side";
      const gap = placeGap(periods(sideRows), build);
      if (gap) return gap;
    }
    return null;
  }
  return placeGap(periods(dated), build);
}

export async function saveRowsAsPartType(
  supabase: SupabaseClient,
  input: CoreInput,
): Promise<CoreOutcome> {
  let type: CoreType;
  try {
    type = await resolveType(supabase, input);
  } catch (err) {
    return { ok: false, error: plainError(err) };
  }

  const answer = await writeAnswer(supabase, input, type);
  if (!answer.ok) return { ok: false, error: answer.error, type };

  const car = await readCar(supabase, input.page.vehicle_catalog_id);
  if (!car) return { ok: false, error: "That car isn't on file", type };
  const make = car.make == null ? null : String(car.make);
  const build: CarBuild = {
    startYear: car.production_start_year == null ? null : Number(car.production_start_year),
    startMonth: car.production_start_month == null ? null : Number(car.production_start_month),
    endYear: car.production_end_year == null ? null : Number(car.production_end_year),
    endMonth: car.production_end_month == null ? null : Number(car.production_end_month),
  };
  const domain = input.page.domain ?? null;
  const version = await rememberedVersion(supabase, input.page.vehicle_catalog_id, domain).catch(() => null);
  const fromCarMaker = await carMakerPage(supabase, domain, make).catch(() => false);
  const onFile = await confirmedOnFile(supabase, input.page.vehicle_catalog_id).catch(() => [] as OnFile[]);
  const identity = identityTokens(car as unknown as Record<string, string>);
  const buildText = savedPageBuildText(car);
  const site = domain ?? "";
  const url = input.page.source_url ?? "";

  const decisions: Decision[] = [];
  for (const row of input.rows) {
    const { axle, side } = placeOf(row);
    const fromMonth = monthIndexFromIso(row.from);
    const toMonth = monthIndexFromIso(row.to);
    const held = (reason: string): Decision => ({ row, state: "held", reason, jobId: null, axle, side, fromMonth, toMonth });
    const base = { row, axle, side, fromMonth, toMonth };

    if (!rowNamesSuggestedPart(type, make, row, input.phrase)) {
      decisions.push(held(NO_TYPE_WORDS_REASON));
      continue;
    }
    if (POSITION_SCHEMES.has(String(type.scheme ?? ""))) {
      if (!axle) {
        decisions.push(held(PLACE_AXLE_REASON));
        continue;
      }
      if (SIDED.has(String(type.scheme ?? "")) && !side) {
        decisions.push(held(PLACE_SIDE_REASON));
        continue;
      }
    }
    const number = String(row.number ?? "").trim();
    const hits = onFile.filter((a) => a.componentId === type.id && placeMatches(a, { type, axle, side }));
    const same = hits.find((a) => norm(a.number) === norm(number)) ?? null;
    if (same) {
      decisions.push({ ...base, state: "already", reason: null, jobId: null });
      continue;
    }
    const other = hits.find((a) => norm(a.number) !== norm(number) && overlaps(a, { from: fromMonth, to: toMonth })) ?? null;
    if (other) {
      decisions.push(held(`Roam already has ${other.number} for these years`));
      continue;
    }
    if (!number) {
      decisions.push(held("No part number on that row"));
      continue;
    }
    decisions.push({ ...base, state: "saved", reason: null, jobId: null });
  }

  const byAxle = new Map<string, Decision[]>();
  for (const d of decisions) {
    if (d.state !== "saved") continue;
    const k = d.axle ?? "";
    byAxle.set(k, [...(byAxle.get(k) ?? []), d]);
  }

  let lastReason: string | null = null;

  for (const [axleKey, groupRows] of byAxle) {
    const axle = axleKey === "front" || axleKey === "rear" ? axleKey : null;

    if (input.strict) {
      const gap = strictGap(groupRows, type, build);
      if (gap) {
        for (const d of groupRows) {
          d.state = "held";
          d.reason = gap;
        }
        lastReason = lastReason ?? gap;
        continue;
      }
    }

    const jobResult = await supabase.rpc("research_saved_page_job", {
      p_vehicle_catalog_id: input.page.vehicle_catalog_id,
      p_component_id: type.id,
      p_axle: axle,
      p_actor: input.answer.actor,
    });
    if (jobResult.error) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "The browser check couldn't open. Try again.";
      }
      lastReason = lastReason ?? "The browser check couldn't open. Try again.";
      continue;
    }
    const jr = jobResult.data as { jobId?: string; state?: string; busy?: boolean } | null;
    if (jr?.busy) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "Roam is checking this part now. Try again in a few minutes.";
      }
      lastReason = lastReason ?? "Roam is checking this part now. Try again in a few minutes.";
      continue;
    }
    const jobId = jr?.jobId ? String(jr.jobId) : "";
    if (!jobId) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "The browser check couldn't open. Try again.";
      }
      lastReason = lastReason ?? "The browser check couldn't open. Try again.";
      continue;
    }

    const datesOf = (d: Decision) =>
      d.fromMonth == null
        ? null
        : {
          fromMonth: ((d.fromMonth - 1) % 12) + 1,
          fromYear: Math.floor((d.fromMonth - 1) / 12),
          toMonth: d.toMonth == null ? null : ((d.toMonth - 1) % 12) + 1,
          toYear: d.toMonth == null ? null : Math.floor((d.toMonth - 1) / 12),
        };
    const numbers: NonNullable<CheckAnswers["numbers"]> = [];
    for (const d of groupRows) {
      const value = String(d.row.number ?? "");
      const sides = d.side === "both" ? (["left", "right"] as const) : [d.side];
      for (const side of sides) {
        numbers.push({ axle: d.axle, side, value, valueAgain: value, dates: datesOf(d) });
      }
    }

    const { data: suggestionRows } = await supabase.from("catalog_part_proposal").select("part_number")
      .eq("job_id", jobId).eq("status", "open");
    const suggestionsForGate = ((suggestionRows ?? []) as Array<{ part_number: string | null }>)
      .map((p) => String(p.part_number ?? "").trim()).filter(Boolean);

    const gate = answersGate({
      jobType: "part",
      answers: { versionOk: true, versionCode: version, partFound: true, datesOk: true, numbers },
      identity,
      frame: car.chassis_code == null ? null : String(car.chassis_code),
      site,
      rowName: type.name,
      buildText,
      knownCode: version,
      suggestions: suggestionsForGate,
      positionScheme: type.scheme,
      jobAxle: axle,
      build,
    });
    if (!gate.ok) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "Roam couldn't save these numbers together. Use the browser check.";
      }
      lastReason = lastReason ?? "Roam couldn't save these numbers together. Use the browser check.";
      continue;
    }

    const { data: jobRow } = await supabase.from("catalog_research_job")
      .select("id, job_type, state, vehicle_catalog_id, maintenance_component_id, spec_key, fit_descriptor")
      .eq("id", jobId).maybeSingle();
    if (!jobRow) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "The browser check is gone. Refresh the page.";
      }
      lastReason = lastReason ?? "The browser check is gone. Refresh the page.";
      continue;
    }

    const evidence = [...new Set(groupRows.map((d) => `${d.row.groupLine ?? ""}\n${d.row.lineText}`.trim()))].join("\n");
    const saved = await savePartAnswers(supabase, jobId, {
      job: jobRow as SaveJob,
      car: car as Record<string, string | null>,
      host: site,
      carMakerPage: fromCarMaker,
      detected: String(groupRows[0]?.row.number ?? ""),
      versionCode: version,
      items: gate.items ?? null,
      actor: input.answer.actor,
    }, url, evidence, input.page.id);
    const savedNumbers = new Set((saved.ok ? saved.results : saved.saved).map((r) => norm(r.number)));
    for (const d of groupRows) {
      d.jobId = jobId;
      if (savedNumbers.has(norm(String(d.row.number ?? "")))) {
        d.state = "saved";
        d.reason = null;
      } else {
        d.state = "held";
        d.reason = saved.ok ? "Roam couldn't save this number." : saved.error;
        lastReason = lastReason ?? d.reason;
      }
    }
  }

  const everyRowFinal = decisions.every((d) =>
    d.state === "saved" || d.state === "already" || isPageHeldReason(d.reason)
  );

  let pictures: PicturesResult | undefined;
  const pictureDeps = input.pictures === undefined ? null : input.pictures;
  if (pictureDeps && everyRowFinal) {
    try {
      const queueRows: PartPictureQueueRow[] = decisions
        .filter((d) => d.state === "saved" || d.state === "already")
        .map((d) => ({
          number: String(d.row.number ?? ""),
          lineNo: d.row.lineNo,
          groupLine: d.row.groupLine,
          componentId: type.id,
        }));
      const drawings = await loadPageDrawings(supabase, {
        savedPageId: input.page.id,
        r2: pictureDeps.r2 as SavedPageDiagramStore | null,
      });
      const queued = await queuePartPictures(supabase, {
        drawings,
        savedPageId: input.page.id,
        carMake: make,
        rows: queueRows,
      }, pictureDeps);
      if (queued) pictures = queued;
    } catch (err) {
      console.error("part type pictures not queued", err);
    }
  }

  return {
    ok: true,
    type,
    decisions: decisions.map((d) => ({ row: d.row, state: d.state, reason: d.reason, jobId: d.jobId })),
    everyRowFinal,
    lastReason,
    ...(pictures ? { pictures } : {}),
  };
}
