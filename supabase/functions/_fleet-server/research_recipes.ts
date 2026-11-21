/**
 * Catalogue-first lookups and deterministic evidence blocks (docs/research-engine-audit.md RE-02 / RE-03).
 *
 * A page is split into its row-like elements (table rows, list items, cards). A check passes only when the
 * factory number, the car identity and (when asked) the position appear in the SAME element. No model reads the
 * page: page text never goes to Gemini (RE-21).
 */
import { readSourcePage, type ReaderDeps, type ReadOutcome, type ReadPurpose } from "./research_page_reader.ts";

export type BlockRule = {
  /** Element tags that make one evidence block. Default: tr, li, article. */
  tags?: string[];
  /** Also take <div>/<section> elements whose class contains one of these. */
  classContains?: string[];
};

export type LookupRecipe = {
  id: string;
  domain: string;
  kind: "by_part_number" | "search_then_page" | "browser_check_link";
  search_url_template: string | null;
  /** Text the result link's href must contain; may use {placeholders}. */
  result_link_rule: string | null;
  /** JSON BlockRule. */
  block_rule: string | null;
};

export type LookupVars = Record<string, string | null | undefined>;

export type BlockCheck = {
  /** Factory / part number to find (any formatting). Omit for spec lookups. */
  number?: string | null;
  /** Any one of these must be in the block (frame code, model, engine code…). */
  identity: string[];
  /** When given, one of these must be in the block too (e.g. "rear"). */
  position?: string[];
  /** Spec lookups: the block must contain a value matching this. */
  valuePattern?: RegExp;
};

export type RecipeResult =
  | { kind: "found"; block: string; value?: string; pageRead: Extract<ReadOutcome, { kind: "ok" }> }
  | { kind: "not_found"; reason: string; pageRead?: Extract<ReadOutcome, { kind: "ok" }> }
  | { kind: "browser_check"; url: string }
  | { kind: "unreadable"; outcome: Exclude<ReadOutcome, { kind: "ok" }> };

// ---------------------------------------------------------------------------
// HTML → blocks
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(td|th|div|p|span|li)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, " ");
}

/** Every element with this tag (nesting-aware), optionally only those whose class contains one of `classContains`. */
export function extractElements(html: string, tag: string, classContains?: string[]): string[] {
  const out: string[] = [];
  const open = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  const any = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = open.exec(html))) {
    if (classContains?.length) {
      const cls = (m[1].match(/class\s*=\s*["']([^"']*)["']/i)?.[1] || "").toLowerCase();
      if (!classContains.some((c) => cls.includes(c.toLowerCase()))) continue;
    }
    any.lastIndex = m.index + m[0].length;
    let depth = 1;
    let t: RegExpExecArray | null;
    let end = -1;
    while ((t = any.exec(html))) {
      depth += t[1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    if (end > 0) out.push(html.slice(m.index + m[0].length, end));
  }
  return out;
}

/** Text of every evidence block on the page, innermost first and de-duplicated. */
export function htmlToBlocks(html: string, rule: BlockRule = {}): string[] {
  const clean = stripNoise(html);
  const tags = rule.tags?.length ? rule.tags : ["tr", "li", "article"];
  const raw: string[] = [];
  for (const t of tags) raw.push(...extractElements(clean, t));
  if (rule.classContains?.length) {
    for (const t of ["div", "section"]) raw.push(...extractElements(clean, t, rule.classContains));
  }
  const texts = raw.map(htmlText).filter((t) => t.length > 0 && t.length <= 2000);
  // Innermost first: a short row beats the table/card that contains it.
  return [...new Set(texts)].sort((a, b) => a.length - b.length);
}

export function parseBlockRule(raw: string | null | undefined): BlockRule {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    return {
      tags: Array.isArray(j.tags) ? j.tags.filter((t: unknown) => typeof t === "string" && /^[a-z][a-z0-9]*$/i.test(t)) : undefined,
      classContains: Array.isArray(j.classContains) ? j.classContains.filter((t: unknown) => typeof t === "string") : undefined,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Block checks (RE-03)
// ---------------------------------------------------------------------------

export function normNumber(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Whole-token match (review #3): the token must stand on its own, so frame code NCP10 never matches NCP100 and
 * "Fit" never matches "FITS". Spaces and hyphens inside the token are optional ("M900A" = "M900-A").
 */
export function containsToken(text: string, token: string): boolean {
  const t = token.trim().toUpperCase();
  if (!t) return false;
  const pattern = t
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s-]*");
  return new RegExp(`(^|[^A-Z0-9])${pattern}([^A-Z0-9]|$)`).test(text.toUpperCase());
}

function tokenIn(blockUpper: string, _blockNorm: string, token: string): boolean {
  return containsToken(blockUpper, token);
}

/** The first block where number, identity and position all appear together; null when none. */
export function findEvidenceBlock(blocks: string[], check: BlockCheck): { block: string; value?: string } | null {
  const numberNorm = check.number ? normNumber(check.number) : "";
  for (const block of blocks) {
    const upper = block.toUpperCase();
    const norm = normNumber(block);
    if (numberNorm && !norm.includes(numberNorm)) continue;
    if (!check.identity.some((id) => tokenIn(upper, norm, id))) continue;
    if (check.position?.length && !check.position.some((p) => tokenIn(upper, norm, p))) continue;
    if (check.valuePattern) {
      const v = block.match(check.valuePattern);
      if (!v) continue;
      return { block, value: v[0].trim() };
    }
    if (!numberNorm) continue; // a part check without a number never passes
    return { block };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recipes (RE-02)
// ---------------------------------------------------------------------------

export function fillTemplate(template: string, vars: LookupVars): string | null {
  let missing = false;
  const out = template.replace(/\{([a-zA-Z_]+)\}/g, (_m, k: string) => {
    const v = vars[k];
    if (v == null || String(v).trim() === "") {
      missing = true;
      return "";
    }
    return encodeURIComponent(String(v).trim());
  });
  return missing ? null : out;
}

/** The first link on a results page whose href contains the (filled) rule text. */
export function pickResultLink(html: string, baseUrl: string, rule: string, vars: LookupVars): string | null {
  const needle = (fillTemplate(rule, vars) ?? rule).toLowerCase();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].replace(/&amp;/g, "&");
    if (!href.toLowerCase().includes(decodeURIComponent(needle))) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol === "https:") return u.toString();
    } catch {
      // ignore bad links
    }
  }
  return null;
}

export async function runRecipe(
  recipe: LookupRecipe,
  vars: LookupVars,
  check: BlockCheck,
  ctx: { purpose: ReadPurpose; jobId?: string | null; readerDeps?: ReaderDeps },
): Promise<RecipeResult> {
  if (!recipe.search_url_template) return { kind: "not_found", reason: "recipe_has_no_url" };
  const first = fillTemplate(recipe.search_url_template, vars);
  if (!first) return { kind: "not_found", reason: "missing_lookup_value" };
  if (recipe.kind === "browser_check_link") return { kind: "browser_check", url: first };

  const read = (url: string) =>
    readSourcePage({ url, purpose: ctx.purpose, jobId: ctx.jobId, recipeId: recipe.id }, ctx.readerDeps);

  let page = await read(first);
  if (page.kind !== "ok") return { kind: "unreadable", outcome: page };

  if (recipe.kind === "search_then_page") {
    if (!recipe.result_link_rule) return { kind: "not_found", reason: "recipe_has_no_link_rule", pageRead: page };
    const link = pickResultLink(page.body, page.finalUrl, recipe.result_link_rule, vars);
    if (!link) return { kind: "not_found", reason: "no_matching_result", pageRead: page };
    page = await read(link);
    if (page.kind !== "ok") return { kind: "unreadable", outcome: page };
  }

  const blocks = htmlToBlocks(page.body, parseBlockRule(recipe.block_rule));
  const hit = findEvidenceBlock(blocks, check);
  if (!hit) return { kind: "not_found", reason: "no_block_with_number_and_car", pageRead: page };
  return { kind: "found", block: hit.block, value: hit.value, pageRead: page };
}
