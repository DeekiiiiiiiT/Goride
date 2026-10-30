// Calls for Find parts. Dominion and the tests share these names.
export {
  fetchFindParts,
  fetchFindPartsCoverage,
  fetchPartTerm,
  fetchPartsBrowse,
  fetchSymptomSummary,
  type FindPartsCandidate,
  type FindPartsResult,
  type FoundPartRow,
  type PlainSection,
} from "../partsDatabaseApi";

import { getJson, postJson } from "../partsDatabaseApi";

export function fetchSymptoms() {
  return getJson<{
    symptoms: Array<{
      id: string;
      label: string;
      hint: string | null;
      active?: boolean;
      components: Array<{ componentId: string; rank: number }>;
    }>;
  }>("symptoms");
}

export function saveSymptom(payload: {
  id?: string;
  label: string;
  hint?: string | null;
  sortOrder?: number;
  active?: boolean;
  reason: string;
  components?: Array<{ componentId: string; rank: number }>;
}) {
  return postJson<{ id: string }>("symptoms", payload);
}

export function savePartAlias(payload: { term: string; componentId: string; reason: string }) {
  return postJson<{ ok: boolean }>("parts/alias", payload);
}

export function fetchPartDemand(variantId: string, componentId: string) {
  return getJson<{
    partDemand: Array<{ variant_id?: string; component_id?: string; open_count?: number; fleet_count?: number }>;
  }>(`signals?variantId=${encodeURIComponent(variantId)}`).then((body) => {
    const row = (body.partDemand || []).find((item) => item.variant_id === variantId && item.component_id === componentId);
    if (!row || ((row.fleet_count ?? 0) === 0 && (row.open_count ?? 0) === 0)) return null;
    return { fleetCount: row.fleet_count ?? 0, openCount: row.open_count ?? 0 };
  });
}
