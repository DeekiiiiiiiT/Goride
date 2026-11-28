/**
 * Step 3 — one parsed maintenance-table row becomes one DRAFT rule.
 *
 * Nothing is approved here: every row lands as `status = 'draft'`, `source_type = 'maker_manual'`, pointed at the
 * manual and the page it was read from. A row whose part type did not match, matched weakly, or printed no normal
 * interval is still saved — with `confidence = 'uncertain'` and a plain note — so the owner sees it and decides.
 *
 * A part the page prints twice (engine oil for turbo and non-turbo cars, ATF for CVT cars with and without a
 * turbo) is two rows, both kept: the printed remark goes into the row's name, so the owner sees which line is
 * which. Neither of the two is "likely", because the page did not say which one this car's engine is — the
 * engine split itself is the question.
 */
import { matchPartType, type CategoryRow, type PartMatch } from "./maintenance_manual_match.ts";
import type { ManualRowConfidence, ParsedManualRow } from "./maintenance_manual_prompt.ts";

export type DraftRuleRow = {
  component_id: string | null;
  task_name: string;
  task_code: string;
  interval_km: number | null;
  interval_months: number | null;
  severe_interval_km: number | null;
  severe_interval_months: number | null;
  severe_same_as_normal: boolean;
  first_interval_km: number | null;
  first_interval_months: number | null;
  confidence: "likely" | "uncertain";
  draft_note: string | null;
};

export type DraftBuildResult = {
  rows: DraftRuleRow[];
  /** Rows saved as needs-checking. */
  needsChecking: number;
  /** Repeated identical rows on this page (the first one is kept). */
  duplicates: number;
};

function slug(text: string, fallback: string, max = 38): string {
  const out = String(text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max)
    .replace(/_+$/, "");
  return out || fallback;
}

/**
 * A short, stable fingerprint of the label (FNV-1a). Two long names that slug down to the same prefix — "Automatic
 * transmission oil (CVT, except turbo)" and "…(CVT, turbo)" both became `…_CVT_` before — get different codes
 * because of it, and re-reading the same page writes the same code again.
 */
function shortHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(-6);
}

/**
 * task_code must be unique for one family (`mtt_platform_task_code_unique`), so it carries the manual and the page:
 * two manuals for one family (Jamaica and Japan) and two pages of one manual can never collide, and re-reading a
 * page writes the same code again after its old drafts are deleted.
 */
export function draftTaskCode(manualId: string, pageNo: number, label: string): string {
  const shortId = String(manualId ?? "").replace(/-/g, "").slice(0, 8).toLowerCase() || "manual";
  return `mm-${shortId}-p${pageNo}-${slug(label, "part")}-${shortHash(label)}`.slice(0, 64);
}

/** The name the owner sees: the maker's part name, with the printed remark when the page printed one. */
export function draftTaskName(parsed: ParsedManualRow): string {
  const remark = String(parsed.appliesTo ?? "").trim();
  return (remark ? `${parsed.partAsPrinted} (${remark})` : parsed.partAsPrinted).slice(0, 120);
}

function noteFor(
  parsed: ParsedManualRow,
  match: PartMatch,
  hasNormal: boolean,
  others: Array<{ label: string; printed: string }>,
): string | null {
  const printed = parsed.partAsPrinted;
  if (others.length) {
    const sameName = others.filter((other) => other.printed === printed).map((other) => other.label);
    const otherNames = others.filter((other) => other.printed !== printed).map((other) => other.label);
    const parts: string[] = [];
    if (sameName.length) {
      parts.push(
        `The page prints "${printed}" twice, for different cars (${sameName.join(", ")}). ` +
          `This row is "${parsed.appliesTo ?? "no remark"}" - keep the one for this car.`,
      );
    }
    if (otherNames.length) {
      parts.push(`Another row on this page also names this part (${otherNames.join(", ")}) - check which one this car uses.`);
    }
    return parts.join(" ");
  }
  if (match.kind === "none") {
    if (match.closeNames.length) {
      return `"${printed}" fits more than one part type (${match.closeNames.join(", ")}) - choose the right part.`;
    }
    return `No Roam part type matched "${printed}" - choose the right part.`;
  }
  if (!hasNormal) {
    return `The page prints no normal interval for "${printed}" - check it.`;
  }
  if (parsed.confidence === "low") {
    return `The page was hard to read - check these numbers for "${printed}".`;
  }
  return null;
}

function draftConfidence(
  parsed: ParsedManualRow,
  match: PartMatch,
  hasNormal: boolean,
  others: Array<{ label: string; printed: string }>,
): "likely" | "uncertain" {
  if (others.length) return "uncertain";
  const confidentMatch = match.kind === "exact" || match.kind === "near";
  const readWell: ManualRowConfidence = parsed.confidence;
  return confidentMatch && hasNormal && readWell !== "low" ? "likely" : "uncertain";
}

export function buildDraftRows(args: {
  manualId: string;
  pageNo: number;
  parsed: ParsedManualRow[];
  categories: CategoryRow[];
}): DraftBuildResult {
  const rows: DraftRuleRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let needsChecking = 0;

  // First pass: what each row is, and which part types the page prints more than once.
  const prepared: Array<{
    parsed: ParsedManualRow;
    match: PartMatch;
    hasNormal: boolean;
    label: string;
    code: string;
  }> = [];
  for (const parsed of args.parsed) {
    const match = matchPartType(args.categories, parsed.partAsPrinted);
    const hasNormal = parsed.normalKm != null || parsed.normalMonths != null;
    const label = draftTaskName(parsed);
    const code = draftTaskCode(args.manualId, args.pageNo, label);

    // The same printed row twice (a table read twice, say): keep the first.
    if (seen.has(code)) {
      duplicates += 1;
      continue;
    }
    seen.add(code);
    prepared.push({ parsed, match, hasNormal, label, code });
  }

  const byComponent = new Map<string, Array<{ label: string; printed: string }>>();
  for (const row of prepared) {
    if (!row.match.categoryId) continue;
    const list = byComponent.get(row.match.categoryId) ?? [];
    list.push({ label: row.label, printed: row.parsed.partAsPrinted });
    byComponent.set(row.match.categoryId, list);
  }

  for (const row of prepared) {
    // A part type the page prints more than once (by engine, or as two different printed parts): every one of
    // those rows is kept and none is "likely" — which line this car's engine takes is the owner's decision.
    const others = (row.match.categoryId ? byComponent.get(row.match.categoryId) ?? [] : [])
      .filter((other) => other.label !== row.label);

    const confidence = draftConfidence(row.parsed, row.match, row.hasNormal, others);
    if (confidence === "uncertain") needsChecking += 1;

    rows.push({
      component_id: row.match.categoryId,
      task_name: row.label,
      task_code: row.code,
      interval_km: row.parsed.normalKm,
      interval_months: row.parsed.normalMonths,
      // A page that prints one figure gives the normal numbers and no severe ones, so a hard-use car uses
      // exactly what the manual says (the step-1 rule: severe_same_as_normal).
      severe_interval_km: row.parsed.oneFigure ? null : row.parsed.severeKm,
      severe_interval_months: row.parsed.oneFigure ? null : row.parsed.severeMonths,
      severe_same_as_normal: row.parsed.oneFigure,
      first_interval_km: row.parsed.firstKm,
      first_interval_months: row.parsed.firstMonths,
      confidence,
      draft_note: noteFor(row.parsed, row.match, row.hasNormal, others),
    });
  }

  return { rows, needsChecking, duplicates };
}
