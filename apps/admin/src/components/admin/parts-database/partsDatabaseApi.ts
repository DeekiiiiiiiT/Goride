// Stitch: dominion-redesign/ef01fa01e52f4c06b14c3f26887a3b07
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { publicAnonKey } from "../../../utils/supabase/info";
import { supabase } from "../../../utils/supabase/client";

export type PartsOverview = {
  vehicles: number;
  partsOnFile: number;
  fitmentsOnFile: number;
  vehiclesWithParts: number;
  waiting: number;
  /** True when the parts_tiered_search kill switch is on. */
  matchTypesOff: boolean;
  /** Newest part edit or fitment confirmation, when the database knows it. */
  lastCatalogChangeAt?: string | null;
};

export type CatalogVariantPick = {
  id: string;
  make: string;
  model: string;
  chassis_code: string | null;
  engine_code: string | null;
  production_start_year: number | null;
  production_end_year: number | null;
  drivetrain?: string | null;
};

export type PartSection = {
  tier: number;
  label: string;
  sisterNames?: string | null;
  items: Array<Record<string, unknown>>;
};

async function authHeaders(): Promise<HeadersInit> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  return {
    Authorization: token ? `Bearer ${token}` : "",
    apikey: publicAnonKey,
  };
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, {
    headers: await authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load this page");
  return body as T;
}

export async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not save");
  return body as T;
}

export async function patchJson<T>(path: string, payload: unknown): Promise<T> {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || "Could not save");
  return body as T;
}

export async function deleteJson<T>(path: string, payload?: unknown): Promise<T> {
  const headers = new Headers(await authHeaders());
  if (payload !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, {
    method: "DELETE",
    headers,
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || "Could not save");
  return body as T;
}

export type ListingTrustSnapshot = {
  trust?: string | null;
  /** Server returns `reason` for listing trust patch */
  reason?: string | null;
  setBy?: string | null;
};

export type ListingTrustPatchResult = {
  previous: ListingTrustSnapshot;
  current: ListingTrustSnapshot;
};

export type ListingYearsSnapshot = {
  yearFrom?: number | null;
  yearTo?: number | null;
};

export type ListingYearsPatchResult = {
  previous: ListingYearsSnapshot;
  current: ListingYearsSnapshot;
};

export function patchListingTrust(listingId: string, body: { trust: string; reason?: string | null }) {
  return patchJson<ListingTrustPatchResult>(`listings/${encodeURIComponent(listingId)}/trust`, body);
}

export function patchListingYears(
  listingId: string,
  body: { yearFrom: number | null | undefined; yearTo: number | null | undefined },
) {
  return patchJson<ListingYearsPatchResult>(`listings/${encodeURIComponent(listingId)}/years`, body);
}

export type TrustedSourceSiteRow = {
  id: string;
  domain: string;
  addedBy: string | null;
  addedAt: string | null;
};

export type TrustedSourceMakerGroup = {
  maker: string;
  sites: TrustedSourceSiteRow[];
};

export type TrustedSourcesPayload = {
  carMakers: TrustedSourceMakerGroup[];
  partMakers: TrustedSourceMakerGroup[];
};

export function fetchTrustedSources() {
  return getJson<TrustedSourcesPayload>("trusted-sources");
}

export function addTrustedSource(body: { kind: "car_maker" | "part_maker"; maker: string; domain: string }) {
  return postJson<TrustedSourceSiteRow & { kind?: string; maker?: string }>("trusted-sources", body);
}

export function removeTrustedSource(id: string) {
  return deleteJson<TrustedSourceSiteRow>(`trusted-sources/${encodeURIComponent(id)}`);
}

export function renameTrustedSourceMaker(body: { kind: "car_maker" | "part_maker"; from: string; to: string }) {
  return patchJson<{ updated: number }>("trusted-sources/maker", body);
}

export function deleteTrustedSourceMaker(body: { kind: "car_maker" | "part_maker"; maker: string }) {
  return deleteJson<unknown>("trusted-sources/maker", body);
}

export function fetchPartsOverview() {
  return getJson<PartsOverview>("parts-overview");
}

export type FindPartsCandidate = {
  id: string;
  plainLabel: string;
  codeLine: string;
};

export type FoundPartRow = {
  partId: string;
  componentId?: string | null;
  name: string;
  brand: string;
  number: string;
  tier: number;
  reason: string;
  status: "verified" | "needs_checking";
  fitsVariantIds: string[];
  alsoKnownAs?: string[];
  evidenceUrl?: string | null;
  matchReasonCode?: string | null;
  matchReasonParams?: Record<string, unknown> | null;
  matchStatus?: string | null;
  fitSource?: string | null;
  via?: string | null;
  partBadgeCode?: string | null;
  wva?: string | null;
  position?: string | null;
  side?: string | null;
  derivedId?: string;
  groupId?: string;
  wvaPeerLabel?: string;
  partKind?: string | null;
  linkComponentName?: string | null;
};

export type PlainSection = {
  tier: number;
  plainLabel: string;
  tag: string;
  plainReason: string;
  items: FoundPartRow[];
};

export type FindPartsResult = {
  mode?: "tiered" | "legacy";
  car?: { make: string; model: string; year: number | null; label: string } | null;
  candidates?: FindPartsCandidate[];
  askVariant?: boolean;
  pickedVariantId?: string | null;
  variants: CatalogVariantPick[];
  picked: CatalogVariantPick | null;
  sections: PartSection[];
  plainSections?: PlainSection[];
  emptyTiers?: number[];
  bestPick?: FoundPartRow | null;
  coverage?: { essentials: number; essentialsTotal: number; specs: number; specsTotal: number; otherParts: number } | null;
  databaseNodeGroups?: number;
  universalToleranceMm?: number | null;
  universal_part?: { tolerance_mm?: number | null } | null;
  platformLabel?: string;
  axleLabel?: string;
};

export function fetchFindParts(query: {
  make?: string;
  model?: string;
  year?: string;
  variantId?: string;
  componentId?: string;
  position?: string;
  side?: string;
}) {
  const params = new URLSearchParams();
  if (query.make) params.set("make", query.make);
  if (query.model) params.set("model", query.model);
  if (query.year) params.set("year", query.year);
  if (query.variantId) params.set("variantId", query.variantId);
  if (query.componentId) params.set("componentId", query.componentId);
  if (query.position) params.set("position", query.position);
  if (query.side) params.set("side", query.side);
  return getJson<FindPartsResult>(`find-parts?${params.toString()}`);
}

export function fetchFindPartsCoverage(variantId: string) {
  return getJson<{ variantId: string; areas: Array<{ id: string; count: number }> }>(
    `find-parts/coverage?variantId=${encodeURIComponent(variantId)}`,
  );
}

export function fetchPartsBrowse() {
  return getJson<{
    systems: Array<{
      id: string;
      plainName: string;
      icon: string | null;
      components: Array<{ id: string; plainName: string; positionAware: boolean }>;
    }>;
    common: Array<{ id: string; plainName: string }>;
  }>("parts/browse");
}

export function fetchPartTerm(q: string) {
  return getJson<{
    components: Array<{ id?: string; plainName?: string }>;
    synonyms: Array<{ term?: string; componentId?: string; plainName?: string }>;
    parts: Array<{ id?: string; name?: string; number?: string }>;
    hits?: Array<{ kind: "part" | "synonym" | "name"; id: string; plainName: string; number?: string | null; componentId?: string | null }>;
  }>(`parts/term?q=${encodeURIComponent(q)}`);
}

export function fetchSymptomSummary() {
  return getJson<{ problems: number; live: number }>("symptoms/summary");
}

export function fetchBodyFamilies() {
  return getJson<{
    families: Array<Record<string, unknown>>;
    unassigned: Array<Record<string, unknown>>;
    engines: Array<Record<string, unknown>>;
  }>("body-families");
}

export function saveBodyFamily(payload: {
  label?: string;
  familyId?: string;
  platformIds: string[];
  evidenceUrl: string;
  reason?: string;
  action?: "add" | "remove";
  dryRun?: boolean;
  move?: boolean;
}) {
  return postJson<{ before?: number; after?: number; beforeCars?: Array<Record<string, string>>; afterCars?: Array<Record<string, string>> }>("body-families", payload);
}

export function fetchChecklist(variantId: string) {
  return getJson<Record<string, unknown>>(`variants/${variantId}/checklist`);
}

export function saveGuidedPart(payload: Record<string, unknown>) {
  return postJson("parts/guided", payload);
}

export function fetchPartGroup(groupId: string, variantId: string) {
  return getJson<{
    groupId?: string;
    componentOpCode?: string | null;
    categoryId?: string | null;
    position?: string | null;
    yearFrom?: number | null;
    yearTo?: number | null;
    evidenceUrl?: string | null;
    note?: string | null;
    productionStartYear?: number | null;
    productionEndYear?: number | null;
    brands?: Array<{ manufacturer?: string; partNumber?: string; name?: string; kind?: string }>;
    listedVariantIds?: string[];
  }>(`parts/group/${groupId}?variantId=${encodeURIComponent(variantId)}`);
}

export function previewPartReach(payload: {
  variantId: string;
  tickedVariantIds: string[];
  componentOpCode?: string;
  groupId?: string;
  yearFrom?: string;
  yearTo?: string;
}) {
  return postJson<{ sister?: string[]; engine?: string[] }>("parts/reach-preview", payload);
}

export function excludeListing(payload: { groupId: string; variantId: string; reason: string; evidenceUrl: string }) {
  return postJson("parts/exclude", payload);
}

export function removeGuidedPart(payload: { groupId: string; variantId: string }) {
  return postJson("parts/remove", payload);
}

export function saveApplicability(payload: Record<string, unknown>) {
  return postJson("applicability", payload);
}

export function saveSpec(payload: Record<string, unknown>) {
  return postJson("specs", payload);
}

export function fetchPartJobs() {
  return getJson<{ items: Array<{ section: string; op_code: string; label: string; position: string | null }> }>("part-jobs");
}

export function fetchPartCategories() {
  return getJson<{ items: Array<{ id: string; label: string; slug: string }> }>("part-categories");
}

export function fetchSameModel(variantId: string) {
  return getJson<{ items: CatalogVariantPick[] }>(`same-model?variantId=${encodeURIComponent(variantId)}`);
}

export function fetchVehicleOptions(query: { make?: string; model?: string }) {
  const params = new URLSearchParams();
  if (query.make) params.set("make", query.make);
  if (query.model) params.set("model", query.model);
  return getJson<{ makes: string[]; models: string[]; years: number[] }>(`vehicle-options?${params.toString()}`);
}

export function fetchUniversalParts() {
  return getJson<{ items: Array<Record<string, unknown>> }>("universal-parts");
}

export function saveUniversalPart(payload: Record<string, unknown>) {
  return postJson("universal-parts", payload);
}

export function deleteUniversalPart(id: string) {
  return postJson("universal-parts/delete", { id });
}

export function fetchAdvancedTables(offset = 0) {
  return getJson<{
    offset: number;
    page: number;
    parts: { count: number; rows: Array<Record<string, unknown>> };
    brands: { count: number; rows: Array<Record<string, unknown>> };
    listings: { count: number; rows: Array<Record<string, unknown>> };
  }>(`advanced-tables?offset=${offset}`);
}

export function fetchSpecKeys() {
  return getJson<{ items: Array<{ key: string; label: string; unit: string | null }> }>("spec-keys");
}

export type MasterPartRow = {
  partId: string;
  groupId: string | null;
  name: string;
  number: string;
  brand: string;
  tier: number;
  assembly: string;
  fittedCars: string;
  versionCount: number;
  status: "verified" | "needs_checking";
  updatedAt: string | null;
  wva?: string | null;
  fitCount?: number;
};

export type SisterFamilyRow = {
  id: string;
  label: string;
  chassisCodes: string;
  cars: string[];
};

export type UniversalCatalogRow = {
  id: string;
  name: string;
  number: string;
  brand: string;
  fits: string;
  source: string;
};

export type MasterSearchResult = {
  rows: MasterPartRow[];
  total: number;
  chips: { all: number; oem: number; sister: number; engine: number; aftermarket: number; universal: number };
  groups?: {
    oem: MasterPartRow[];
    engine: MasterPartRow[];
    aftermarket: MasterPartRow[];
    sister: SisterFamilyRow[];
    universal: UniversalCatalogRow[];
  };
  emptyTiers?: string[];
  facets: {
    brands: string[];
    assemblies: string[];
    cars: Array<{ id: string; label: string }>;
    brandCounts?: Array<{ name: string; count: number }>;
    areaCounts?: Array<{ name: string; count: number }>;
    statusCounts?: { all: number; verified: number; needs_checking: number };
  };
};

export type MasterFit = {
  listingId?: string;
  variantId: string;
  make: string;
  model: string;
  chassis: string;
  years: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  position: string;
  linkType: "DIRECT" | "PLATFORM TWIN";
  evidenceUrl?: string | null;
  trust?: string | null;
  /** API / RPC field name */
  trustReason?: string | null;
  trustSetBy?: string | null;
};

export type MasterFactoryOeOnCar = {
  oeId?: string;
  variantId?: string;
  make?: string;
  model?: string;
  oeNumber?: string;
  oeBrand?: string;
  evidenceUrl?: string | null;
  evidenceUrl2?: string | null;
  trust?: string | null;
  trustReason?: string | null;
  trustSetBy?: string | null;
};

export type MasterPartDetail = {
  partId: string;
  groupId: string | null;
  name: string;
  number: string;
  brand: string;
  partType?: string;
  wva?: string | null;
  fitCount?: number;
  groupCode?: string | null;
  groupRevision?: number | null;
  indexRevision?: number | null;
  indexGroupCode?: string | null;
  indexGroupHeadline?: string | null;
  indexBadge?: string | null;
  wvaPeerLabels?: string[];
  groupMembers?: Array<{ partId?: string; number?: string; brand?: string; name?: string }>;
  provenanceHash?: string | null;
  hash?: string | null;
  tier: number;
  status: "verified" | "needs_checking";
  evidenceUrl: string | null;
  note: string;
  fits: Array<MasterFit & { via?: string; side?: string }>;
  factoryOeOnCars?: MasterFactoryOeOnCar[];
};

export function fetchMasterSearch(query: {
  q?: string;
  match?: string;
  brand?: string;
  assembly?: string;
  variantId?: string;
  status?: string;
  make?: string;
  model?: string;
  year?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.match) params.set("match", query.match);
  if (query.brand) params.set("brand", query.brand);
  if (query.assembly) params.set("assembly", query.assembly);
  if (query.variantId) params.set("variantId", query.variantId);
  if (query.status) params.set("status", query.status);
  if (query.make) params.set("make", query.make);
  if (query.model) params.set("model", query.model);
  if (query.year) params.set("year", query.year);
  params.set("limit", String(query.limit ?? 25));
  params.set("offset", String(query.offset ?? 0));
  return getJson<MasterSearchResult>(`parts/master?${params.toString()}`);
}

export function exportMasterCsv(query: {
  q?: string;
  match?: string;
  brand?: string;
  assembly?: string;
  status?: string;
  make?: string;
  model?: string;
  year?: string;
}) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.match && query.match !== "all") params.set("match", query.match);
  if (query.brand) params.set("brand", query.brand);
  if (query.assembly) params.set("assembly", query.assembly);
  if (query.status) params.set("status", query.status);
  if (query.make) params.set("make", query.make);
  if (query.model) params.set("model", query.model);
  if (query.year) params.set("year", query.year);
  return getJson<{ csv: string }>(`parts/master/export?${params.toString()}`);
}

export function fetchMasterPart(partId: string) {
  return getJson<MasterPartDetail>(`parts/master/${encodeURIComponent(partId)}`);
}
