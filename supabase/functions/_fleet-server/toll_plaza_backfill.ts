/**
 * Recover plaza attribution on historical toll rows.
 *
 * Three quarters of the ledger was written before `plaza_id` was populated, so
 * every chart grouped those rows under "Unknown Plaza". The only evidence left
 * on those rows is free text from the T-Tag statement, so this matches on that
 * text — but conservatively: a row that could plausibly be two different plazas
 * is reported as ambiguous rather than assigned to whichever came first in the
 * array. A wrong plaza is worse than no plaza, because it silently moves money
 * between cost centres.
 *
 * Pure, so the plan can be unit-tested and reviewed before anything is written.
 */

export interface BackfillPlazaRef {
  id: string;
  name: string;
  /** Alternate spellings seen on statements, if the plaza record carries any. */
  aliases?: string[] | null;
}

export interface BackfillLedgerRow {
  id: string;
  plazaId?: string | null;
  plaza?: string | null;
  location?: string | null;
  description?: string | null;
  vendor?: string | null;
}

export interface PlazaBackfillAssignment {
  id: string;
  plazaId: string;
  plazaName: string;
  matchedOn: string;
}

export interface PlazaBackfillAmbiguity {
  id: string;
  text: string;
  candidates: string[];
}

export interface PlazaBackfillPlan {
  total: number;
  alreadyAttributed: number;
  toStamp: PlazaBackfillAssignment[];
  ambiguous: PlazaBackfillAmbiguity[];
  unresolved: Array<{ id: string; text: string }>;
}

function normalize(s: string | null | undefined): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function searchTextFor(row: BackfillLedgerRow): string {
  return normalize([row.plaza, row.location, row.description, row.vendor].filter(Boolean).join(" "));
}

/** Words distinctive enough to attribute on. "toll", "plaza" etc. match everything. */
const STOP_WORDS = new Set(["toll", "plaza", "booth", "highway", "hwy", "main", "line", "ramp", "north", "south", "east", "west"]);

function distinctiveWords(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

/** Every plaza whose name or alias is present in the row's text. */
function candidatesFor(text: string, plazas: BackfillPlazaRef[]): Array<{ plaza: BackfillPlazaRef; matchedOn: string }> {
  const hits: Array<{ plaza: BackfillPlazaRef; matchedOn: string }> = [];
  for (const plaza of plazas) {
    const names = [plaza.name, ...(plaza.aliases || [])].filter(Boolean) as string[];
    let matchedOn: string | null = null;
    for (const name of names) {
      const n = normalize(name);
      if (n && text.includes(n)) {
        matchedOn = name;
        break;
      }
    }
    if (!matchedOn) {
      // Fall back to distinctive words so "Spanish Town M/L" still finds "Spanish Town".
      const words = distinctiveWords(plaza.name);
      if (words.length > 0 && words.every((w) => text.includes(w))) {
        matchedOn = plaza.name;
      }
    }
    if (matchedOn) hits.push({ plaza, matchedOn });
  }
  return hits;
}

export function planPlazaBackfill(
  rows: BackfillLedgerRow[],
  plazas: BackfillPlazaRef[],
): PlazaBackfillPlan {
  const plan: PlazaBackfillPlan = {
    total: rows.length,
    alreadyAttributed: 0,
    toStamp: [],
    ambiguous: [],
    unresolved: [],
  };
  const knownIds = new Set(plazas.map((p) => p.id));

  for (const row of rows) {
    // An id that points at a plaza that no longer exists is not attribution.
    if (row.plazaId && knownIds.has(row.plazaId)) {
      plan.alreadyAttributed += 1;
      continue;
    }

    const text = searchTextFor(row);
    if (!text) {
      plan.unresolved.push({ id: row.id, text: "" });
      continue;
    }

    const hits = candidatesFor(text, plazas);
    if (hits.length === 1) {
      plan.toStamp.push({
        id: row.id,
        plazaId: hits[0].plaza.id,
        plazaName: hits[0].plaza.name,
        matchedOn: hits[0].matchedOn,
      });
    } else if (hits.length > 1) {
      // Longest name wins only when it fully contains every rival — "Spanish Town
      // Ramp" beating "Spanish Town" is a refinement, not a conflict.
      const sorted = [...hits].sort((a, b) => normalize(b.plaza.name).length - normalize(a.plaza.name).length);
      const longest = normalize(sorted[0].plaza.name);
      const isRefinement = sorted.slice(1).every((h) => longest.includes(normalize(h.plaza.name)));
      if (isRefinement) {
        plan.toStamp.push({
          id: row.id,
          plazaId: sorted[0].plaza.id,
          plazaName: sorted[0].plaza.name,
          matchedOn: sorted[0].matchedOn,
        });
      } else {
        plan.ambiguous.push({ id: row.id, text, candidates: hits.map((h) => h.plaza.name) });
      }
    } else {
      plan.unresolved.push({ id: row.id, text });
    }
  }

  return plan;
}
