/**
 * Research engine screens (docs/research-engine-audit.md §3 / §4): one client for every route the Dominion screens call.
 * All under /make-server-37f42386/admin/catalog-research on the platform-catalog function. Responses never carry who
 * asked, when, or how many companies asked (RE-23) — the server strips them.
 */
import { API_ENDPOINTS } from "./apiConfig";
import { publicAnonKey } from "../utils/supabase/info";
import type { PartPicture } from "../components/admin/part-pictures/partPicturesApi";

const BASE = `${API_ENDPOINTS.catalog}/make-server-37f42386/admin/catalog-research`;

function headers(token: string, json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, apikey: publicAnonKey };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : `HTTP ${res.status}`;
}

async function getJson<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(token) });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

async function send<T>(token: string, method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(token, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json().catch(() => ({}))) as T;
}

// ------------------------------------------------------------------ types

export type ResearchJobState =
  | "queued"
  | "researching"
  | "checking"
  | "needs_review"
  | "auto_added"
  | "added"
  | "not_found"
  | "failed"
  | "browser_check"
  | "browser_check_queued";

export type ResearchCar = {
  id: string;
  make: string;
  model: string;
  production_start_year: number | null;
  production_end_year: number | null;
  production_start_month?: number | null;
  production_end_month?: number | null;
  chassis_code: string | null;
  engine_code: string | null;
  engine_type?: string | null;
  /** RE-62: the engine in plain words, only when known (server); null → not said. */
  engine_words?: string | null;
  drivetrain: string | null;
  transmission: string | null;
  trim_series?: string | null;
  catalog_trim?: string | null;
};

export type ResearchJobListItem = {
  jobId: string;
  jobType: "part" | "spec" | "vehicle" | "vehicle_identity" | "vehicle_model";
  state: ResearchJobState;
  vehicleCatalogId: string | null;
  car: ResearchCar | null;
  partTypeId: string | null;
  partTypeName: string | null;
  specKey: string | null;
  specLabel: string | null;
  fitDescriptor: string | null;
  resultPartNumber: string;
  sourceCount: number;
  trustRoute: TrustRoute | null;
  siteDomains: string[];
  conflictOpen: boolean;
  /** Answers teach Roam §5.4: a browser check that carries a question card. */
  needsYou?: boolean;
  /** RE-73: the owner's note when the job was closed on their say-so (shown as Closed), else null. */
  closedNote?: string | null;
  updatedAt: string;
  /** Vehicle and model jobs: the car being researched. */
  subject?: { make: string; model: string; year: number | null } | null;
  vehicleProposals?: Array<Pick<VehicleProposal, "make" | "model" | "production_start_year" | "production_end_year" | "chassis_code" | "engine_code" | "drivetrain" | "grade" | "market" | "action" | "status">>;
};

export type TrustRoute = "a" | "b" | "c" | "owner_browser";

export type ProposalSource = {
  url?: string;
  domain?: string | null;
  readId?: string;
  block?: string;
  dropped?: boolean;
  reason?: string;
};

export type PartProposal = {
  id: string;
  job_id: string;
  brand: string;
  part_number: string;
  part_name: string | null;
  match_kind: string | null;
  position_key: string;
  fits: { listings?: Array<{ vehicleId?: string; position?: string }> } | null;
  sources: ProposalSource[] | null;
  checks: {
    trust?: "confirmed" | "needs_checking";
    passes?: Array<{ domain: string; kind: string; maker: string }>;
    shadowWouldAuto?: boolean;
    conflict?: boolean;
    browserCheckUrl?: string | null;
    manual?: boolean;
  } | null;
  route: string;
  status: string;
  trust_route: TrustRoute | null;
  evidence_read_ids: string[];
  promoted_part_id: string | null;
  rejected_reason: string | null;
};

export type VehicleProposal = {
  id: string;
  job_id: string;
  make: string;
  model: string;
  production_start_year: number | null;
  production_end_year: number | null;
  chassis_code: string | null;
  engine_code: string | null;
  drivetrain: string | null;
  transmission: string | null;
  market: string | null;
  grade: string | null;
  chassis_serial_from: string | null;
  chassis_serial_to: string | null;
  existing_vehicle_catalog_id: string | null;
  action: "new" | "update" | "same" | string | null;
  status: string;
  rejected_reason: string | null;
  sources: ProposalSource[] | null;
  checks: Record<string, unknown> | null;
  evidence_read_ids: string[];
};

export type SpecProposal = {
  id: string;
  job_id: string;
  vehicle_catalog_id: string;
  spec_key: string;
  value: string;
  unit: string | null;
  evidence_read_ids: string[];
  trust_route: TrustRoute | null;
  route: string;
  status: string;
  rejected_reason: string | null;
};

export type NumberConflict = {
  id: string;
  proposal_ids: string[];
  position: string | null;
  opened_at: string;
  closed_at: string | null;
  resolution: string | null;
};

export type ResearchJobDetail = {
  job: {
    id: string;
    job_type: ResearchJobListItem["jobType"];
    state: ResearchJobState;
    vehicle_catalog_id: string | null;
    maintenance_component_id: string | null;
    fit_descriptor: string | null;
    spec_key: string | null;
    attempts: number;
    last_error: string | null;
    updated_at: string;
  };
  car: ResearchCar | null;
  partType: { id: string; name: string; position_scheme?: string | null } | null;
  spec: { key: string; label: string; unit: string | null } | null;
  /** Owner 27 Nov: "any_page" = a spec a parts catalogue never shows (bulb, tyre, oil…), checked on any page about the car. */
  specSource?: "catalogue" | "any_page" | null;
  browserCheckUrl: string | null;
  /** RE-63: the same model's other engines built in the same years (e.g. the turbo). */
  sisterEngines?: Array<{ code: string; turbo: boolean }>;
  /** Step 3 wording: the car maker's own name for this part ("Hub & bearing assy, rear axle"), when Roam knows it. */
  makerPartName?: string | null;
  /** Answers teach Roam AT-06: the word to search the maker's site for, when the maker's words are known. */
  makerSearch?: string | null;
  /** Owner 27 Nov: the exact page this part was found on before (an upload for this car that has it). */
  savedPage?: { url: string; domain: string | null; readAt: string } | null;
  /** AT-11 / AT-12: the question card this browser check carries (the saved-page row Roam read). */
  question?: {
    savedPageId: string;
    domain: string | null;
    readAt: string;
    lineNo: number;
    partType: string;
    place: string | null;
    groupLine: string | null;
    lineText: string;
    number: string | null;
    dates: string | null;
    question: SavedPageQuestion;
  } | null;
  /** RE-63: the catalogue's own name for this car's version, learned from an earlier confirmed check. */
  knownVersion?: {
    domain: string;
    code: string;
    url: string | null;
    /** RE-67: the catalogue's own words for the version's row. */
    engine?: string | null;
    prodPeriod?: string | null;
    grade?: string | null;
    transmission?: string | null;
  } | null;
  reads: Array<{
    id: string;
    domain: string | null;
    path: "direct" | "owner_browser" | "roam_saved_page";
    read_at: string;
  }>;
  proposals: PartProposal[];
  vehicleProposals: VehicleProposal[];
  specProposals: SpecProposal[];
  conflicts: NumberConflict[];
  events: Array<{ id: string; step: string; outcome: string; at: string }>;
};

export type ResearchSummary = {
  needsReview: number;
  browserCheckOpen: number;
  browserCheckWaiting: number;
  browserCheckMax: number;
  researching: number;
  waiting: number;
  addedThisWeek: number;
  addedAutoThisWeek: number;
  vehiclesNeedsReview: number;
  conflictsOpen: number;
  spendTodayUsd: number;
  dailySpendUsd: number;
  costPerJob7dUsd: number | null;
  jobsDone7d: number;
  remainingJobs: number;
  fillTargetDate: string | null;
  expectedFinishDate: string | null;
  carsWithoutFrameCode: number;
  shadowMode: boolean;
  shadowStreak: number;
  paused: boolean;
  pausedReason: string | null;
  autoResumeAt: string | null;
  enabled: boolean;
  fillPlan: { cars: number; ready: number; inProgress: number; waiting: number };
  researchingCar: string | null;
  fillingFirst: Array<{ vehicleCatalogId: string; label: string; chassisCode: string | null; partsReady: number; openJobs: number }>;
};

export type ResearchNotice = {
  id: string;
  kind: "engine_paused" | "site_blocked" | "spend_cap" | "grounding_limit" | "evidence_changed";
  subject: string;
  reason: string | null;
  resumeAt: string | null;
  openedAt: string;
};

export type CoveragePart = {
  componentId: string;
  opCode: string;
  name: string;
  cell: "verified" | "not_applicable" | "unverified" | "missing";
  partNumber: string | null;
  maker: string | null;
  sourceUrl: string | null;
  jobId: string | null;
  jobState: ResearchJobState | null;
  conflictId: string | null;
};

export type CoverageSpec = {
  specKey: string;
  label: string;
  value: string | null;
  unit: string | null;
  trust: "confirmed" | "needs_checking" | null;
  sourceNote: string | null;
  sourceUrl: string | null;
  trustRoute: TrustRoute | null;
  checkedAt: string | null;
  jobId: string | null;
  jobState: ResearchJobState | null;
};

export type CarCoverage = {
  vehicleCatalogId: string;
  make: string;
  model: string;
  chassisCode: string | null;
  engineCode: string | null;
  partsReady: number;
  parts: CoveragePart[];
  specs: CoverageSpec[];
  /** Every spec on file for this car (S7), with trust and source. */
  allSpecs: CoverageSpec[];
};

export type ResearchSettings = {
  enabled: boolean;
  shadow_mode: boolean;
  paused: boolean;
  paused_reason?: string | null;
  auto_resume_at?: string | null;
  shadow_approve_streak?: number;
  daily_spend_usd?: number;
  max_open_browser_checks?: number;
  fill_target_date?: string | null;
};

export type ResearchIncident = { id: string; state: string; last_error: string | null; attempts: number; updated_at: string };

export type TrustedSite = {
  domain: string;
  automated_read: "allowed" | "blocked" | "not_checked";
  automated_read_checked_at: string | null;
  automated_read_note: string | null;
  blocked_at: string | null;
  backoff_until: string | null;
  pages_confirmed: number;
  makers: Array<{ kind: "car_maker" | "part_maker" | "reference"; maker: string }>;
  recipeCount: number;
};

export type LookupRecipe = {
  id: string;
  domain: string;
  maker_norm: string | null;
  name: string;
  kind: "by_part_number" | "search_then_page" | "browser_check_link" | "form_then_page";
  search_url_template: string | null;
  /** form_then_page only: the fields posted to the form address. */
  form_body_template?: string | null;
  result_link_rule: string | null;
  block_rule: string | null;
  active: boolean;
  notes: string | null;
  updated_at: string;
  worked: number;
  lastWorkedAt: string | null;
};

export type SiteRead = {
  id: string;
  purpose: "job" | "recipe_test" | "recheck";
  /** Who read the page: the robot itself, a person's browser check, or Roam saving from an uploaded saved page. */
  path: "direct" | "owner_browser" | "roam_saved_page";
  url: string;
  httpStatus: number | null;
  foundRow: boolean;
  readAt: string;
};

export type BrowserCheckAnswersPayload = {
  url: string;
  answers: {
    versionOk: boolean | null;
    versionCode: string | null;
    partFound: boolean;
    value: string;
    valueAgain: string | null;
    /** RE-69: one number per position, for parts that come in positions. */
    positions?: Array<{
      axle: "front" | "rear";
      side: "left" | "right" | null;
      value: string;
      valueAgain: string | null;
      /** RE-70: the number for cars built before / from `changeAt`. */
      period?: "before" | "from" | null;
    }> | null;
    /** RE-70: the month the car maker changed the number during the build. */
    changeAt?: { month: number; year: number } | null;
    /** RE-70: the number for cars built from `changeAt` (parts without positions; `value` = before). */
    valueFrom?: string | null;
    valueFromAgain?: string | null;
    /** Owner 25 Nov: the dates the site shows next to the first (and second) number. */
    datesShown?: Array<{ fromMonth: number; fromYear: number; toMonth: number; toYear: number }> | null;
    /**
     * Owner 25 Nov: every number the site lists, with its place (parts with places) and the dates shown next to it
     * (month only when shown; null = no dates shown). Replaces value / positions / changeAt for parts.
     */
    numbers?: Array<{
      axle: "front" | "rear" | null;
      side: "left" | "right" | null;
      value: string;
      valueAgain: string | null;
      dates: { fromMonth: number | null; fromYear: number; toMonth: number | null; toYear: number } | null;
    }> | null;
    datesOk: boolean;
    sideOk: boolean | null;
  };
  rowName: string | null;
  buildText: string | null;
  knownCode: string | null;
};

export type BrowserCheckGate =
  | { ok: true; detected: string }
  | { ok: false; reason: "no_car" | "no_number" | "number_not_on_line" | "wrong_years" | "wrong_engine" | "no_value" | "empty" };

// ------------------------------------------------------------------ saved catalogue pages (docs/saved-page-parts-audit.md)

/**
 * docs/saved-page-reads-disagree-audit.md Rev 2: "not_saved" = Roam already has a different number here (a fact, no
 * button); "left_for_later" = Roam couldn't prove the row from the page, so nothing was saved and nothing is asked.
 */
export type SavedPageGroup = "saved" | "already" | "held" | "not_saved" | "left_for_later" | "not_roam_type";
/** Older uploads carry only the first four keys. */
export type SavedPageCounts = Record<"saved" | "already" | "held" | "not_roam_type", number> &
  Partial<Record<"not_saved" | "left_for_later", number>>;
export type SavedPageRow = {
  partType: string;
  place: string | null;
  number: string | null;
  dates: string | null;
  group: SavedPageGroup;
  /** Plain reason from the server (held rows only); the screen never makes its own wording. */
  reason: string | null;
  jobId: string | null;
  /** The suggestion this unknown row belongs to (docs/part-type-learning-audit.md D1/D2), or null. */
  suggestion?: string | null;
  /** Part pictures (docs/part-pictures-audit.md §3.5 point 7): only on GET saved-pages/:id. */
  picture?: PartPicture | null;
  // Answers teach Roam (docs/answers-teach-roam-audit.md §5.1): what Roam read, for the question card.
  lineNo?: number;
  groupLine?: string | null;
  lineText?: string;
  /** The one thing a held row asks; `answer` is set once the owner answered. */
  question?: SavedPageQuestion | null;
  /** This row was saved because of an earlier answer ("Learned from you"). */
  learned?: boolean;
  /** Skipped rows only: the server's plain reason the page couldn't prove it (shown on the Skipped tab). */
  waitReason?: string | null;
  /** The heading's key (side words removed), so the RH and LH rows of one heading share one question card. */
  phraseKey?: string | null;
};
export type SavedPageQuestion = {
  kind: "wording" | "types" | "axle" | "side";
  typeIds: string[];
  typeNames: string[];
  answer?: "yes" | "no" | null;
  /** The server's line under an answered card ("Roam will remember … for Toyota."). */
  note?: string | null;
};
/** The answer the owner gives on a question card. */
export type QuestionAnswer = {
  yes?: boolean;
  typeId?: string | null;
  axle?: "front" | "rear";
  side?: "left" | "right" | "both";
  /** "It has no front or rear": the part type's place setting is corrected for every car. */
  noPlace?: boolean;
  /** "It has no left or right": the part type keeps front/rear only. */
  noSide?: boolean;
};
/** One owner lesson on Part types → Learned from you (§5.3). */
export type MakerLesson = {
  id: string;
  heading: string;
  make: string;
  model: string | null;
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
  typeId: string;
  typeName: string;
  partsSaved: number;
  answeredBy: string | null;
  answeredAt: string | null;
};
/** What the upload did about pictures (§3.2). */
export type SavedPagePictures = {
  queued: number;
  alreadyHave: number;
  noDiagram: number;
  failed: boolean;
  rows: Array<{ number: string; status: "queued" | "alreadyHave" | "noDiagram" | "templateOff" }>;
};
/** One "Parts Roam doesn't know yet" card (docs/part-type-learning-audit.md D2). Every word comes from the server. */
export type SavedPageSuggestion = {
  key: string;
  /** The suggested plain name; for kind "existing", the existing type's own name. */
  name: string;
  groupId: string | null;
  groupName: string;
  kind: "new" | "existing" | "fixings";
  existingTypeId: string | null;
  positionScheme: "none" | "axle" | "axle_left_right";
  /** The catalogue's own words, e.g. "INLET, AIR CLEANER, NO.1". */
  pagePhrase: string;
  numbers: string[];
  rowCount: number;
  numberCount: number;
  /** open/dismissed = the owner decides (older uploads); added/skipped/waiting = Roam sorted it (auto-sort plan). */
  status: "open" | "added" | "dismissed" | "skipped" | "waiting";
  typeId: string | null;
  typeName: string | null;
  /** Why the last Add didn't finish, in plain words. */
  reason: string | null;
};
/** One "not a part we track" phrase (Part types → Hidden from saved pages). */
export type HiddenPartTypePhrase = {
  id: string;
  phrase: string;
  groupId: string | null;
  groupName: string | null;
  dismissedBy: string | null;
  dismissedByName: string | null;
  dismissedAt: string;
};
/** One answer on the "Sorted by Roam" review list (docs/part-type-auto-sort-audit.md R4). */
export type PartNameItem = {
  key: string;
  /** Added: the search word (the plain name); Not tracked: the catalogue words as the page wrote them. */
  phrase: string;
  name: string | null;
  typeId: string | null;
  typeName: string | null;
  groupName: string | null;
  reason: string | null;
  setBy: "owner" | "roam";
  at: string;
  uploads: number;
};
export type PartNamesTab = "added" | "not_tracked";
export type TrackPartNameReply = { ok: true; saved: number; pages: number; remaining: number; busy: boolean; type: { id: string; name: string } | null };
export type SavedPageStopCode =
  | "wrong_car"
  | "untrusted_site"
  | "part_maker_page"
  | "cap_reached"
  | "too_big"
  | "not_web_page"
  | "no_rows"
  | "no_build_dates"
  | "too_many_pages"
  | "ai_failed"
  /** Answers teach Roam: the maker's words couldn't be read, so nothing was decided. */
  | "words_unread";
export type SavedPage = {
  id: string;
  vehicle_catalog_id: string;
  job_id: string | null;
  domain: string | null;
  source_url: string | null;
  file_name: string | null;
  status: "reading" | "done" | "stopped";
  stop_reason: string | null;
  result: {
    counts?: SavedPageCounts;
    rows?: SavedPageRow[];
    otherTypes?: string[];
    stop?: { code: string; detail: string };
    pictures?: SavedPagePictures;
    suggestions?: SavedPageSuggestion[];
    /** Unknown rows beyond the 20 cards. */
    moreUnknownRows?: number;
    /** When Roam last sorted this upload's unknown names (auto-sort plan R3/R5). */
    sortAt?: string;
    /** Rev 2 §3.3: rows Roam left out because the page couldn't prove them (same as counts.left_for_later). */
    skipped?: number;
    /** Answers teach Roam AT-08: rows saved on this upload because of an earlier answer. */
    learned?: number;
  };
  created_at: string;
};
export type SavedPageReply = {
  savedPage: SavedPage;
  alreadyRead?: boolean;
  readAt?: string;
  stop?: { code: SavedPageStopCode; detail: string };
  versionShown?: string | null;
  carFrame?: string | null;
};
export type SavedPageListItem = { id: string; createdAt: string; domain: string | null; status: SavedPage["status"]; counts: SavedPageCounts };

/** R1: upload one saved page (multipart; the browser sets the boundary). */
async function uploadSavedPage(
  token: string,
  body: { file: File; vehicleCatalogId: string; jobId?: string | null; url?: string | null; again?: boolean },
): Promise<SavedPageReply> {
  const form = new FormData();
  form.append("file", body.file, body.file.name);
  form.append("vehicleCatalogId", body.vehicleCatalogId);
  if (body.jobId) form.append("jobId", body.jobId);
  if (body.url) form.append("url", body.url);
  if (body.again) form.append("again", "true");
  const res = await fetch(`${BASE}/saved-pages`, { method: "POST", headers: headers(token), body: form });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as SavedPageReply;
}

// ------------------------------------------------------------------ reads

export const researchApi = {
  uploadSavedPage,
  savedPages: (t: string, vehicleCatalogId: string) =>
    getJson<{ items: SavedPageListItem[] }>(t, `/saved-pages?vehicleCatalogId=${encodeURIComponent(vehicleCatalogId)}`).then((r) => r.items ?? []),
  savedPage: (t: string, id: string) => getJson<{ savedPage: SavedPage }>(t, `/saved-pages/${encodeURIComponent(id)}`).then((r) => r.savedPage),
  /** The same page with each row's picture, and whether AI part pictures are on (S1). */
  savedPageWithPictures: (t: string, id: string) =>
    getJson<{ savedPage: SavedPage; picturesAiOn?: boolean }>(t, `/saved-pages/${encodeURIComponent(id)}`),
  /** R5/R6: Add part type, or Not a part we track. Answers the whole page, as GET saved-pages/:id does. */
  savedPagePartType: (t: string, id: string, body: { key: string; action: "add" | "dismiss"; name?: string; groupId?: string }) =>
    send<{ savedPage: SavedPage; picturesAiOn?: boolean }>(t, "POST", `/saved-pages/${encodeURIComponent(id)}/part-type`, body),
  hiddenPartTypePhrases: (t: string) =>
    getJson<{ items: HiddenPartTypePhrase[] }>(t, "/hidden-part-type-phrases").then((r) => r.items ?? []),
  partNames: (t: string, tab: PartNamesTab, cursor?: string | null) =>
    getJson<{ items: PartNameItem[]; nextCursor: string | null }>(
      t,
      `/part-names?tab=${tab}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  trackPartName: (t: string, key: string) => send<TrackPartNameReply>(t, "POST", `/part-names/${encodeURIComponent(key)}/track`),
  skipPartName: (t: string, key: string) =>
    send<{ ok: true; drafted: boolean; pages: number }>(t, "POST", `/part-names/${encodeURIComponent(key)}/skip`),
  suggestPartTypeAgain: (t: string, id: string) => send<{ deleted: string }>(t, "DELETE", `/hidden-part-type-phrases/${encodeURIComponent(id)}`),
  /** Answers teach Roam §5.1 / §5.2: answer one question card. */
  answerQuestion: (t: string, savedPageId: string, lineNo: number, body: QuestionAnswer) =>
    send<{ result: SavedPage["result"]; message: string | null }>(
      t,
      "POST",
      `/saved-pages/${encodeURIComponent(savedPageId)}/rows/${lineNo}/answer`,
      body,
    ),
  /** §5.3: what Roam learned from the owner's answers, and Undo. */
  lessons: (t: string) => getJson<{ lessons: MakerLesson[]; canUndo: boolean }>(t, "/lessons"),
  forgetLesson: (t: string, id: string) => send<{ ok: true }>(t, "DELETE", `/lessons/${encodeURIComponent(id)}`),
  summary: (t: string) => getJson<ResearchSummary>(t, "/summary"),
  notices: (t: string) => getJson<{ items: ResearchNotice[] }>(t, "/notices").then((r) => r.items ?? []),
  coverage: (t: string, carId: string) => getJson<CarCoverage>(t, `/coverage/${encodeURIComponent(carId)}`),
  jobs: (t: string, types?: string[]) =>
    getJson<{ items: ResearchJobListItem[] }>(t, `/jobs${types?.length ? `?types=${types.join(",")}` : ""}`).then((r) => r.items ?? []),
  job: (t: string, jobId: string) => getJson<ResearchJobDetail>(t, `/jobs/${encodeURIComponent(jobId)}`),
  settings: (t: string) => getJson<{ settings: ResearchSettings; status: string }>(t, "/settings"),
  incidents: (t: string) => getJson<{ items: ResearchIncident[] }>(t, "/incidents").then((r) => r.items ?? []),
  trustedSites: (t: string) => getJson<{ items: TrustedSite[] }>(t, "/trusted-sites").then((r) => r.items ?? []),
  siteReads: (t: string, domain: string) =>
    getJson<{ items: SiteRead[] }>(t, `/trusted-sites/${encodeURIComponent(domain)}/reads`).then((r) => r.items ?? []),
  recipes: (t: string, domain: string) =>
    getJson<{ items: LookupRecipe[] }>(t, `/trusted-sites/${encodeURIComponent(domain)}/recipes`).then((r) => r.items ?? []),

  // ---------------------------------------------------------------- writes
  patchSettings: (t: string, body: Partial<{ enabled: boolean; shadow_mode: boolean; paused: boolean; daily_spend_usd: number; max_open_browser_checks: number; fill_target_date: string }>) =>
    send(t, "PATCH", "/settings", body),
  retry: (t: string, jobId: string) => send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/retry`),
  researchNext: (t: string, jobId: string) => send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/research-next`),
  undo: (t: string, jobId: string) => send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/undo`),
  notFound: (t: string, jobId: string) => send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/not-found`),
  looksRight: (t: string, jobId: string, proposalId: string) =>
    send<{ result: unknown }>(t, "POST", `/jobs/${encodeURIComponent(jobId)}/looks-right`, { proposalId }),
  editAndAdd: (t: string, jobId: string, body: { brand: string; partNumber: string; partName: string; sourceUrl: string; sourceQuote?: string }) =>
    send(t, "POST", `/jobs/${encodeURIComponent(jobId)}/edit-and-add`, body),
  reprocessQueued: (t: string) => send<{ requeued: number }>(t, "POST", "/reprocess-queued"),
  exportCsv: async (t: string) => {
    const res = await fetch(`${BASE}/export.csv`, { headers: headers(t) });
    if (!res.ok) throw new Error(await readError(res));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "research_jobs.csv";
    a.click();
    URL.revokeObjectURL(url);
  },

  approveVehicle: (t: string, id: string) => send(t, "POST", `/vehicle-proposals/${encodeURIComponent(id)}/approve`),
  rejectVehicle: (t: string, id: string, reason: string) => send(t, "POST", `/vehicle-proposals/${encodeURIComponent(id)}/reject`, { reason }),
  approveSpec: (t: string, id: string) => send(t, "POST", `/spec-proposals/${encodeURIComponent(id)}/approve`),
  rejectSpec: (t: string, id: string, reason: string) => send(t, "POST", `/spec-proposals/${encodeURIComponent(id)}/reject`, { reason }),
  researchIdentity: (t: string, vehicleCatalogId: string) => send(t, "POST", "/identity", { vehicleCatalogId }),
  researchModel: (t: string, make: string, model: string) => send<{ result: { jobId: string; newJob: boolean } }>(t, "POST", "/model", { make, model }),

  fillCar: (t: string, vehicleCatalogId: string) =>
    send<{ result: { identityFirst: boolean; newJobs: number; joined: number } }>(t, "POST", "/fill/car", { vehicleCatalogId }),
  fillModel: (t: string, make: string, model: string) => send<{ result: Record<string, unknown> }>(t, "POST", "/fill/model", { make, model }),
  fillItem: (t: string, body: { vehicleCatalogId: string; componentId?: string; specKey?: string }) => send(t, "POST", "/fill/item", body),

  browserChecks: (t: string) => getJson<{ open: number; waiting: number; max: number }>(t, "/browser-checks/summary"),
  previewBrowserCheck: (t: string, jobId: string, pasted: string, number?: string) =>
    send<{ gate: BrowserCheckGate }>(t, "POST", `/browser-checks/${encodeURIComponent(jobId)}/preview`, { pasted, number: number || undefined }).then((r) => r.gate),
  confirmBrowserCheck: (t: string, jobId: string, pasted: string, url: string, number?: string) =>
    send<{ detected: string }>(t, "POST", `/browser-checks/${encodeURIComponent(jobId)}/confirm`, { pasted, url, number: number || undefined }),
  /** RE-68: the owner's answers to the check's questions (no pasted text). */
  confirmBrowserCheckAnswers: (t: string, jobId: string, payload: BrowserCheckAnswersPayload) =>
    send<{ detected: string }>(t, "POST", `/browser-checks/${encodeURIComponent(jobId)}/confirm`, payload),
  notOnPage: (t: string, jobId: string) => send(t, "POST", `/browser-checks/${encodeURIComponent(jobId)}/not-on-page`),

  resolveConflict: (t: string, id: string, body: { resolution: "picked" | "both_wrong"; proposalId?: string }) =>
    send(t, "POST", `/conflicts/${encodeURIComponent(id)}/resolve`, body),

  addSite: (t: string, body: { domain: string; kind: "car_maker" | "part_maker" | "reference"; makers: string[]; automatedRead: "allowed" | "blocked" | "not_checked"; checkedAt?: string }) =>
    send(t, "POST", "/trusted-sites", body),
  markSite: (t: string, domain: string, automatedRead: "allowed" | "blocked") =>
    send(t, "PATCH", `/trusted-sites/${encodeURIComponent(domain)}`, { automatedRead }),
  removeSite: (t: string, domain: string) => send(t, "POST", `/trusted-sites/${encodeURIComponent(domain)}/remove`),
  addRecipe: (t: string, domain: string, body: { name: string; kind: LookupRecipe["kind"]; searchUrlTemplate: string; formBodyTemplate?: string; resultLinkRule?: string; maker?: string; notes?: string }) =>
    send(t, "POST", `/trusted-sites/${encodeURIComponent(domain)}/recipes`, body),
  patchRecipe: (t: string, id: string, body: Partial<{ active: boolean; name: string; kind: LookupRecipe["kind"]; searchUrlTemplate: string; formBodyTemplate: string; resultLinkRule: string; notes: string }>) =>
    send(t, "PATCH", `/recipes/${encodeURIComponent(id)}`, body),
  testRecipe: (t: string, id: string, vehicleCatalogId: string, number?: string) =>
    send<{ found: boolean; block?: string; url?: string; browserCheckUrl?: string; reason?: string }>(
      t, "POST", `/recipes/${encodeURIComponent(id)}/test`, { vehicleCatalogId, number },
    ),
};
